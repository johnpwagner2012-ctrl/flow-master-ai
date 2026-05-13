import { useEffect, useRef } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import {
  completeClientJob,
  failClientJob,
  heartbeatClientJob,
} from "./client-jobs.functions";

// ---------- types ----------
type Job = {
  id: string;
  workflow_id: string;
  workflow_run_id: string;
  node_execution_id: string;
  node_key: string;
  node_type: string;
  payload: { node_kind: string; config: Record<string, unknown>; inputs: Record<string, unknown> };
  attempts: number;
  max_attempts: number;
};

type AssetOut = {
  type: string;
  name?: string | null;
  storage_bucket: string;
  storage_path: string;
  mime_type?: string;
  size_bytes?: number;
  duration_ms?: number;
  file_url?: string;
  metadata?: Record<string, unknown>;
};

type HandlerResult = { output: Record<string, unknown>; assets: AssetOut[] };

// ---------- utils ----------
const POLL_INTERVAL_MS = 4000;
const LEASE_SECONDS = 180;
const HEARTBEAT_MS = 30_000;

function workerId(): string {
  if (typeof window === "undefined") return "ssr";
  const k = "lovable.browser_worker_id";
  let id = window.sessionStorage.getItem(k);
  if (!id) {
    id = `w_${crypto.randomUUID()}`;
    window.sessionStorage.setItem(k, id);
  }
  return id;
}

async function uploadBlob(
  userId: string,
  bucket: string,
  filename: string,
  blob: Blob,
): Promise<{ path: string; size: number; signedUrl: string }> {
  const path = `${userId}/${Date.now()}-${filename}`;
  const { error } = await supabase.storage.from(bucket).upload(path, blob, {
    contentType: blob.type || "application/octet-stream",
    upsert: false,
  });
  if (error) throw new Error(`Upload failed: ${error.message}`);
  const { data: signed, error: sErr } = await supabase.storage
    .from(bucket)
    .createSignedUrl(path, 60 * 60 * 24 * 7);
  if (sErr) throw new Error(`Signed URL failed: ${sErr.message}`);
  return { path, size: blob.size, signedUrl: signed.signedUrl };
}

function pickUpstreamString(inputs: Record<string, unknown>, fields: string[]): string | null {
  for (const v of Object.values(inputs)) {
    if (typeof v === "string") return v;
    if (v && typeof v === "object") {
      const rec = v as Record<string, unknown>;
      for (const f of fields) {
        const val = rec[f];
        if (typeof val === "string" && val.length) return val;
      }
    }
  }
  return null;
}

// ---------- handlers ----------

/**
 * Web Speech API TTS — speaks the script in the browser and emits a
 * word-timing JSON manifest as the asset. (Browsers do not expose the
 * synthesized audio buffer directly, so we capture timing via boundary
 * events; the timing file feeds downstream subtitle/video nodes.)
 */
async function handleTextToSpeech(userId: string, job: Job): Promise<HandlerResult> {
  if (typeof window === "undefined" || !window.speechSynthesis) {
    throw new Error("Web Speech API not available in this browser");
  }
  const text = pickUpstreamString(job.payload.inputs, ["text", "content", "body"]);
  if (!text) throw new Error("Text to Speech: no upstream text");
  const cfg = job.payload.config;
  const rate = Math.min(2, Math.max(0.5, Number(cfg.rate ?? 1)));
  const voiceName = String(cfg.voice ?? "default");

  // Wait for voice list
  const voices = await new Promise<SpeechSynthesisVoice[]>((resolve) => {
    const list = window.speechSynthesis.getVoices();
    if (list.length) return resolve(list);
    const t = setTimeout(() => resolve(window.speechSynthesis.getVoices()), 500);
    window.speechSynthesis.onvoiceschanged = () => {
      clearTimeout(t);
      resolve(window.speechSynthesis.getVoices());
    };
  });

  const utter = new SpeechSynthesisUtterance(text);
  utter.rate = rate;
  const matched = voices.find((v) => v.name === voiceName) ?? voices[0];
  if (matched) utter.voice = matched;
  utter.volume = 0; // synthesize silently — we only want timings

  const segments: { start: number; end: number; word: string }[] = [];
  const t0 = performance.now();

  await new Promise<void>((resolve, reject) => {
    utter.onboundary = (ev: SpeechSynthesisEvent) => {
      const word = text.slice(ev.charIndex, ev.charIndex + (ev.charLength || 8));
      const t = (performance.now() - t0) / 1000;
      const last = segments[segments.length - 1];
      if (last) last.end = t;
      segments.push({ start: t, end: t, word });
    };
    utter.onend = () => resolve();
    utter.onerror = (e) => reject(new Error(`TTS error: ${e.error}`));
    window.speechSynthesis.speak(utter);
  });

  const totalSec = (performance.now() - t0) / 1000;
  if (segments.length) segments[segments.length - 1].end = totalSec;

  const manifest = {
    text,
    voice: matched?.name ?? null,
    rate,
    duration_seconds: totalSec,
    segments,
  };
  const blob = new Blob([JSON.stringify(manifest, null, 2)], { type: "application/json" });
  const up = await uploadBlob(userId, "audio", `${job.node_key}-tts.json`, blob);

  return {
    output: {
      url: up.signedUrl,
      storage_path: up.path,
      bucket: "audio",
      mime_type: "application/json",
      duration_ms: Math.round(totalSec * 1000),
      provider: "browser_speech",
      manifest,
    },
    assets: [{
      type: "audio",
      name: `TTS ${job.node_key}`,
      storage_bucket: "audio",
      storage_path: up.path,
      mime_type: "application/json",
      size_bytes: up.size,
      duration_ms: Math.round(totalSec * 1000),
      file_url: up.signedUrl,
      metadata: { provider: "browser_speech", segments: segments.length },
    }],
  };
}

// Lazy ffmpeg loader so the bundle doesn't pay the cost upfront.
let ffmpegInstance: { ff: unknown; util: typeof import("@ffmpeg/util") } | null = null;
async function getFfmpeg() {
  if (ffmpegInstance) return ffmpegInstance;
  const [{ FFmpeg }, util] = await Promise.all([
    import("@ffmpeg/ffmpeg"),
    import("@ffmpeg/util"),
  ]);
  const ff = new FFmpeg();
  const baseURL = "https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd";
  await ff.load({
    coreURL: await util.toBlobURL(`${baseURL}/ffmpeg-core.js`, "text/javascript"),
    wasmURL: await util.toBlobURL(`${baseURL}/ffmpeg-core.wasm`, "application/wasm"),
  });
  ffmpegInstance = { ff, util };
  return ffmpegInstance;
}

async function handleFfmpeg(
  userId: string,
  job: Job,
  variant: "video_assembler" | "ffmpeg_processor",
): Promise<HandlerResult> {
  const { ff, util } = await getFfmpeg();
  const ffmpeg = ff as {
    writeFile: (n: string, d: Uint8Array) => Promise<void>;
    exec: (args: string[]) => Promise<number>;
    readFile: (n: string) => Promise<Uint8Array>;
    deleteFile?: (n: string) => Promise<void>;
  };

  // Collect upstream URLs: prefer images + audio + subtitles for video_assembler
  const urls: { kind: string; url: string }[] = [];
  for (const v of Object.values(job.payload.inputs)) {
    if (!v || typeof v !== "object") continue;
    const rec = v as Record<string, unknown>;
    const url = (rec.url ?? rec.file_url) as string | undefined;
    if (typeof url !== "string" || !/^https?:/.test(url)) continue;
    const mime = String(rec.mime_type ?? "");
    const kind = mime.startsWith("image/") ? "image" :
      mime.startsWith("audio/") ? "audio" :
      mime.startsWith("video/") ? "video" :
      mime.includes("subrip") || mime.includes("vtt") ? "subtitle" : "asset";
    urls.push({ kind, url });
  }
  if (urls.length === 0) throw new Error(`${variant}: no upstream media URLs`);

  // Download and write into ffmpeg FS
  const localFiles: string[] = [];
  for (let i = 0; i < urls.length; i++) {
    const { url, kind } = urls[i];
    const ext = url.split("?")[0].split(".").pop()?.toLowerCase() ?? "bin";
    const name = `${kind}_${i}.${ext}`;
    await ffmpeg.writeFile(name, await util.fetchFile(url));
    localFiles.push(name);
  }

  const cfg = job.payload.config;
  let outName = "out.mp4";
  let mime = "video/mp4";
  let args: string[];

  if (variant === "video_assembler") {
    const images = localFiles.filter((f) => f.startsWith("image_"));
    const audio = localFiles.find((f) => f.startsWith("audio_"));
    if (images.length === 0) throw new Error("Video Assembler: requires at least one upstream image");
    const fps = Math.max(1, Math.min(60, Number(cfg.fps ?? 30)));
    const res = String(cfg.resolution ?? "vertical");
    const scale = res === "square" ? "1080:1080" : res === "landscape" ? "1920:1080" : "1080:1920";
    const secsPerImg = 3;

    // Build a concat list of images held for N seconds each
    const concatLines = images
      .map((img) => `file '${img}'\nduration ${secsPerImg}`)
      .concat([`file '${images[images.length - 1]}'`])
      .join("\n");
    await ffmpeg.writeFile("list.txt", new TextEncoder().encode(concatLines));

    args = [
      "-y", "-f", "concat", "-safe", "0", "-i", "list.txt",
      ...(audio ? ["-i", audio, "-shortest", "-c:a", "aac"] : []),
      "-vf", `scale=${scale}:force_original_aspect_ratio=increase,crop=${scale},fps=${fps}`,
      "-pix_fmt", "yuv420p", "-c:v", "libx264", "-preset", "ultrafast",
      outName,
    ];
  } else {
    const op = String(cfg.operation ?? "compress");
    const inFile = localFiles[0];
    if (op === "thumbnail") {
      outName = "out.jpg"; mime = "image/jpeg";
      args = ["-y", "-i", inFile, "-ss", "0", "-frames:v", "1", "-q:v", "3", outName];
    } else if (op === "crop_vertical") {
      args = ["-y", "-i", inFile, "-vf", "crop=ih*9/16:ih,scale=1080:1920", "-c:a", "copy", outName];
    } else if (op === "mix_audio") {
      const audio = localFiles.find((f) => f.startsWith("audio_"));
      if (!audio) throw new Error("mix_audio: needs an upstream audio asset");
      args = ["-y", "-i", inFile, "-i", audio, "-c:v", "copy", "-shortest", outName];
    } else {
      // compress
      args = ["-y", "-i", inFile, "-c:v", "libx264", "-crf", "28", "-preset", "ultrafast", "-c:a", "aac", outName];
    }
  }

  const code = await ffmpeg.exec(args);
  if (code !== 0) throw new Error(`ffmpeg exited with code ${code}`);
  const data = await ffmpeg.readFile(outName);
  const blob = new Blob([data as BlobPart], { type: mime });
  const bucket = mime.startsWith("image/") ? "thumbnails" : "videos";
  const up = await uploadBlob(userId, bucket, `${job.node_key}-${outName}`, blob);

  // best-effort cleanup
  try { for (const f of [...localFiles, "list.txt", outName]) await ffmpeg.deleteFile?.(f); } catch { /* ignore */ }

  return {
    output: {
      url: up.signedUrl, storage_path: up.path, bucket, mime_type: mime,
      size_bytes: up.size, provider: "ffmpeg_wasm",
    },
    assets: [{
      type: mime.startsWith("image/") ? "image" : "video",
      name: `${variant} ${job.node_key}`,
      storage_bucket: bucket, storage_path: up.path,
      mime_type: mime, size_bytes: up.size, file_url: up.signedUrl,
      metadata: { source_count: urls.length },
    }],
  };
}

async function runJob(userId: string, job: Job): Promise<HandlerResult> {
  switch (job.node_type) {
    case "text_to_speech": return handleTextToSpeech(userId, job);
    case "video_assembler": return handleFfmpeg(userId, job, "video_assembler");
    case "ffmpeg_processor": return handleFfmpeg(userId, job, "ffmpeg_processor");
    default: throw new Error(`No browser handler for node type "${job.node_type}"`);
  }
}

// ---------- the React mount ----------

/**
 * Singleton browser worker. Mount once near the top of the authenticated
 * tree. It polls for browser-bound jobs, executes them, and reports results
 * to the server. Tab close mid-execution is recovered by lease expiry on
 * the server side (release_stale_client_jobs / next claim attempt).
 */
export function BrowserExecutor() {
  const { session } = useAuth();
  const userId = session?.user?.id ?? null;
  const heartbeatFn = useServerFn(heartbeatClientJob);
  const completeFn = useServerFn(completeClientJob);
  const failFn = useServerFn(failClientJob);
  const busyRef = useRef(false);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    const wid = workerId();

    const tick = async () => {
      if (cancelled || busyRef.current) return;
      busyRef.current = true;
      try {
        // Reclaim stale leases from any prior tab
        await supabase.rpc("release_stale_client_jobs");
        const { data, error } = await supabase.rpc("claim_client_job", {
          _worker_id: wid,
          _lease_seconds: LEASE_SECONDS,
          _types: ["text_to_speech", "video_assembler", "ffmpeg_processor"],
        });
        if (error || !data || (Array.isArray(data) && data.length === 0)) return;
        const job = (Array.isArray(data) ? data[0] : data) as Job;

        // Heartbeat loop while job runs
        const hb = window.setInterval(() => {
          heartbeatFn({ data: { jobId: job.id, workerId: wid, leaseSeconds: LEASE_SECONDS } })
            .catch(() => { /* heartbeat best-effort */ });
        }, HEARTBEAT_MS);

        try {
          const result = await runJob(userId, job);
          await completeFn({ data: { jobId: job.id, workerId: wid, output: result.output, assets: result.assets } });
        } catch (e) {
          const msg = (e as Error).message ?? "Browser job failed";
          await failFn({ data: { jobId: job.id, workerId: wid, error: msg, fatal: false } })
            .catch(() => { /* swallow — server will eventually time out the lease */ });
        } finally {
          window.clearInterval(hb);
        }
      } finally {
        busyRef.current = false;
      }
    };

    const interval = window.setInterval(tick, POLL_INTERVAL_MS);
    void tick();
    return () => { cancelled = true; window.clearInterval(interval); };
  }, [userId, completeFn, failFn, heartbeatFn]);

  return null;
}