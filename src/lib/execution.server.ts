import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { NODE_REGISTRY, type NodeKind } from "./node-registry";

type SB = SupabaseClient<Database>;

type NodeRow = {
  id: string;
  node_key: string;
  type: string;
  label: string | null;
  config: Record<string, unknown>;
};

type EdgeRow = {
  source_key: string;
  target_key: string;
};

/** Sentinel returned by handlers when a node was paused for browser-side execution. */
const AWAITING_CLIENT = Symbol("awaiting_client");
type HandlerResult = unknown | typeof AWAITING_CLIENT;

function topoSort(nodes: NodeRow[], edges: EdgeRow[]): { order: NodeRow[]; cycle: boolean } {
  const byKey = new Map(nodes.map((n) => [n.node_key, n]));
  const indeg = new Map<string, number>();
  const adj = new Map<string, string[]>();
  for (const n of nodes) { indeg.set(n.node_key, 0); adj.set(n.node_key, []); }
  for (const e of edges) {
    if (!byKey.has(e.source_key) || !byKey.has(e.target_key)) continue;
    adj.get(e.source_key)!.push(e.target_key);
    indeg.set(e.target_key, (indeg.get(e.target_key) ?? 0) + 1);
  }
  const q: string[] = [];
  for (const [k, d] of indeg) if (d === 0) q.push(k);
  const order: NodeRow[] = [];
  while (q.length) {
    const k = q.shift()!;
    order.push(byKey.get(k)!);
    for (const t of adj.get(k) ?? []) {
      indeg.set(t, (indeg.get(t) ?? 0) - 1);
      if (indeg.get(t) === 0) q.push(t);
    }
  }
  return { order, cycle: order.length !== nodes.length };
}

function interpolate(template: string, ctx: Record<string, unknown>): string {
  return template.replace(/\{\{\s*([\w.$-]+)\s*\}\}/g, (_, path: string) => {
    const parts = path.split(".");
    let cur: unknown = ctx;
    for (const p of parts) {
      if (cur && typeof cur === "object" && p in (cur as Record<string, unknown>)) {
        cur = (cur as Record<string, unknown>)[p];
      } else return "";
    }
    return typeof cur === "string" ? cur : JSON.stringify(cur ?? "");
  });
}

async function callLovableAI(model: string, prompt: string): Promise<string> {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) throw new Error("LOVABLE_API_KEY is not configured");
  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: model || "google/gemini-2.5-flash",
      messages: [
        { role: "system", content: "You are a creative writing assistant. Respond with the requested content directly." },
        { role: "user", content: prompt },
      ],
    }),
  });
  if (res.status === 429) throw new Error("AI rate limit exceeded. Please retry shortly.");
  if (res.status === 402) throw new Error("AI credits exhausted. Add credits in Settings → Workspace → Usage.");
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`AI gateway error ${res.status}: ${t.slice(0, 300)}`);
  }
  const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const content = json.choices?.[0]?.message?.content ?? "";
  if (!content) throw new Error("AI returned empty response");
  return content;
}

async function callLovableImage(model: string, prompt: string): Promise<{ base64: string; mime: string }> {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) throw new Error("LOVABLE_API_KEY is not configured");
  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: model || "google/gemini-2.5-flash-image",
      messages: [{ role: "user", content: prompt }],
      modalities: ["image", "text"],
    }),
  });
  if (res.status === 429) throw new Error("Image rate limit exceeded.");
  if (res.status === 402) throw new Error("Image credits exhausted.");
  if (!res.ok) throw new Error(`Image gateway error ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const json = (await res.json()) as { choices?: { message?: { images?: { image_url?: { url?: string } }[] } }[] };
  const dataUrl = json.choices?.[0]?.message?.images?.[0]?.image_url?.url;
  if (!dataUrl?.startsWith("data:")) throw new Error("Image model returned no image data");
  const m = /^data:([^;]+);base64,(.+)$/.exec(dataUrl);
  if (!m) throw new Error("Malformed image data URL");
  return { mime: m[1], base64: m[2] };
}

function buildSrt(text: string, opts: { wpm: number; maxChars: number; format: "srt" | "vtt" }): { content: string; segments: { start: number; end: number; text: string }[]; durationMs: number } {
  const words = text.replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  const wps = Math.max(1, opts.wpm) / 60;
  // Group words into lines that fit maxChars
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    if ((cur + " " + w).trim().length > opts.maxChars && cur) { lines.push(cur.trim()); cur = w; }
    else cur = (cur ? cur + " " : "") + w;
  }
  if (cur.trim()) lines.push(cur.trim());

  const segments: { start: number; end: number; text: string }[] = [];
  let t = 0;
  for (const line of lines) {
    const lineWords = line.split(" ").length;
    const dur = lineWords / wps;
    segments.push({ start: t, end: t + dur, text: line });
    t += dur;
  }
  const fmtTime = (s: number, vtt: boolean) => {
    const ms = Math.floor((s % 1) * 1000);
    const sec = Math.floor(s) % 60;
    const min = Math.floor(s / 60) % 60;
    const hr = Math.floor(s / 3600);
    const sep = vtt ? "." : ",";
    return `${String(hr).padStart(2,"0")}:${String(min).padStart(2,"0")}:${String(sec).padStart(2,"0")}${sep}${String(ms).padStart(3,"0")}`;
  };
  let content = "";
  if (opts.format === "vtt") content += "WEBVTT\n\n";
  segments.forEach((s, i) => {
    if (opts.format === "srt") content += `${i + 1}\n`;
    content += `${fmtTime(s.start, opts.format === "vtt")} --> ${fmtTime(s.end, opts.format === "vtt")}\n${s.text}\n\n`;
  });
  return { content, segments, durationMs: Math.round(t * 1000) };
}

async function log(sb: SB, params: { runId: string; nodeExecId: string; userId: string; level: string; message: string }) {
  await sb.from("execution_logs").insert({
    workflow_run_id: params.runId,
    node_execution_id: params.nodeExecId,
    user_id: params.userId,
    level: params.level,
    message: params.message.slice(0, 4000),
  });
}

async function uploadBase64(sb: SB, userId: string, bucket: string, path: string, base64: string, contentType: string): Promise<{ path: string; size: number }> {
  const bin = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  const fullPath = `${userId}/${path}`;
  const { error } = await sb.storage.from(bucket).upload(fullPath, bin, { contentType, upsert: true });
  if (error) throw new Error(`Storage upload failed: ${error.message}`);
  return { path: fullPath, size: bin.byteLength };
}

async function signedUrl(sb: SB, bucket: string, path: string, seconds = 60 * 60 * 24 * 7): Promise<string> {
  const { data, error } = await sb.storage.from(bucket).createSignedUrl(path, seconds);
  if (error) throw new Error(`Signed URL failed: ${error.message}`);
  return data.signedUrl;
}

async function executeNode(
  sb: SB,
  userId: string,
  runId: string,
  nodeExecId: string,
  node: NodeRow,
  inputs: Record<string, unknown>,
  workflowId: string,
  triggerType: string,
): Promise<HandlerResult> {
  const cfg = node.config ?? {};
  const def = NODE_REGISTRY[node.type as NodeKind];

  // Browser-only nodes pause here for the client-side executor.
  if (def?.executor === "browser") {
    if (triggerType !== "manual" && triggerType !== "replay") {
      await log(sb, { runId, nodeExecId, userId, level: "warn",
        message: `Skipping ${node.type}: requires browser execution and run is ${triggerType}.` });
      return { skipped: true, reason: "browser_required" };
    }
    // Build a payload for the browser executor: include relevant upstream inputs
    const payload = { node_kind: node.type, config: cfg, inputs };
    await sb.from("node_executions")
      .update({ status: "awaiting_client", client_payload: payload as never })
      .eq("id", nodeExecId);
    await sb.from("pending_client_jobs").insert({
      user_id: userId, workflow_id: workflowId, workflow_run_id: runId,
      node_execution_id: nodeExecId, node_key: node.node_key, node_type: node.type,
      payload: payload as never,
    });
    await log(sb, { runId, nodeExecId, userId, level: "info",
      message: `Awaiting browser executor (${node.type}).` });
    return AWAITING_CLIENT;
  }

  switch (node.type) {
    case "ai_script": {
      const model = String(cfg.model ?? "google/gemini-2.5-flash");
      const rawPrompt = String(cfg.prompt ?? "");
      if (!rawPrompt.trim()) throw new Error("AI Script: prompt is empty");
      const prompt = interpolate(rawPrompt, { input: inputs, ...inputs });
      await log(sb, { runId, nodeExecId, userId, level: "info", message: `Calling ${model}` });
      const text = await callLovableAI(model, prompt);
      await log(sb, { runId, nodeExecId, userId, level: "info", message: `Generated ${text.length} chars` });
      return { text, model };
    }
    case "image_generator": {
      const model = String(cfg.model ?? "google/gemini-2.5-flash-image");
      const prompt = interpolate(String(cfg.prompt ?? ""), { input: inputs, ...inputs });
      if (!prompt.trim()) throw new Error("Image Generator: prompt is empty");
      await log(sb, { runId, nodeExecId, userId, level: "info", message: `Generating image with ${model}` });
      const { base64, mime } = await callLovableImage(model, prompt);
      const ext = mime.includes("png") ? "png" : mime.includes("jpeg") ? "jpg" : "bin";
      const path = `${runId}/${node.node_key}-${Date.now()}.${ext}`;
      const up = await uploadBase64(sb, userId, "images", path, base64, mime);
      const url = await signedUrl(sb, "images", up.path);
      // auto-persist as asset
      await sb.from("assets").insert({
        user_id: userId, workflow_run_id: runId, node_execution_id: nodeExecId, workflow_id: workflowId,
        node_key: node.node_key, type: "image", name: `Image ${node.node_key}`,
        file_url: url, provider: "lovable_ai_image", mime_type: mime,
        size_bytes: up.size, storage_bucket: "images", storage_path: up.path,
      });
      await log(sb, { runId, nodeExecId, userId, level: "info", message: `Image stored (${up.size} bytes)` });
      return { url, mime_type: mime, storage_path: up.path, bucket: "images", model };
    }
    case "subtitle_generator": {
      const sourceField = String(cfg.source_field ?? "text").trim();
      const upstreamKeys = Object.keys(inputs);
      if (upstreamKeys.length === 0) throw new Error("Subtitle Generator: no upstream node");
      const upstream = inputs[upstreamKeys[0]] as Record<string, unknown> | string;
      const text = typeof upstream === "string"
        ? upstream
        : String((upstream as Record<string, unknown>)?.[sourceField] ?? (upstream as Record<string, unknown>)?.text ?? "");
      if (!text.trim()) throw new Error("Subtitle Generator: empty text");
      const wpm = Number(cfg.wpm ?? 150);
      const maxChars = Number(cfg.max_chars_per_line ?? 38);
      const format = (cfg.format === "vtt" ? "vtt" : "srt") as "srt" | "vtt";
      const built = buildSrt(text, { wpm, maxChars, format });
      const path = `${runId}/${node.node_key}-${Date.now()}.${format}`;
      const base64 = btoa(unescape(encodeURIComponent(built.content)));
      const up = await uploadBase64(sb, userId, "subtitles", path,
        base64, format === "vtt" ? "text/vtt" : "application/x-subrip");
      const url = await signedUrl(sb, "subtitles", up.path);
      await sb.from("assets").insert({
        user_id: userId, workflow_run_id: runId, node_execution_id: nodeExecId, workflow_id: workflowId,
        node_key: node.node_key, type: "subtitles", name: `Subtitles ${node.node_key}`,
        content: built.content, file_url: url, provider: "text_timing",
        mime_type: format === "vtt" ? "text/vtt" : "application/x-subrip",
        size_bytes: up.size, storage_bucket: "subtitles", storage_path: up.path,
        duration_ms: built.durationMs,
      });
      await log(sb, { runId, nodeExecId, userId, level: "info",
        message: `Built ${built.segments.length} subtitle segments (${Math.round(built.durationMs / 1000)}s)` });
      return { url, format, segments: built.segments, duration_ms: built.durationMs, bucket: "subtitles", storage_path: up.path };
    }
    case "asset_transform": {
      const expr = String(cfg.expression ?? "input");
      const upstreamKeys = Object.keys(inputs);
      const merged = upstreamKeys.length === 1 ? inputs[upstreamKeys[0]] : inputs;
      try {
        // eslint-disable-next-line no-new-func
        const fn = new Function("input", `return (${expr});`);
        return fn(merged);
      } catch (e) {
        throw new Error(`Transform expression failed: ${(e as Error).message}`);
      }
    }
    case "asset_merge": {
      return { merged: inputs };
    }
    case "asset_export": {
      const name = String(cfg.name ?? `export-${Date.now()}.json`);
      const json = JSON.stringify(inputs, null, 2);
      const path = `${runId}/${node.node_key}-${Date.now()}.json`;
      const base64 = btoa(unescape(encodeURIComponent(json)));
      const up = await uploadBase64(sb, userId, "scripts", path, base64, "application/json");
      const url = await signedUrl(sb, "scripts", up.path);
      const { data: asset } = await sb.from("assets").insert({
        user_id: userId, workflow_run_id: runId, node_execution_id: nodeExecId, workflow_id: workflowId,
        node_key: node.node_key, type: "script", name,
        content: json, file_url: url, mime_type: "application/json",
        size_bytes: up.size, storage_bucket: "scripts", storage_path: up.path,
      }).select("id").single();
      await log(sb, { runId, nodeExecId, userId, level: "info", message: `Exported ${up.size} bytes` });
      return { url, asset_id: asset?.id, bucket: "scripts", storage_path: up.path };
    }
    case "timeline_builder": {
      const sceneSeconds = Math.max(0.5, Math.min(20, Number(cfg.scene_seconds ?? 3)));
      const fps = Math.max(1, Math.min(60, Number(cfg.fps ?? 30)));
      const res = String(cfg.resolution ?? "vertical");
      const dims = res === "square" ? { w: 1080, h: 1080 } :
        res === "landscape" ? { w: 1920, h: 1080 } : { w: 1080, h: 1920 };

      const images: { url: string; mime_type?: string }[] = [];
      let audio: { url: string; mime_type?: string; duration_ms?: number; manifest?: unknown } | null = null;
      let subtitles: { url?: string; format?: string; segments?: unknown; content?: string; duration_ms?: number } | null = null;
      const overlays: Record<string, unknown>[] = [];

      const collect = (rec: Record<string, unknown>) => {
        const url = (rec.url ?? rec.file_url) as string | undefined;
        const mime = (rec.mime_type as string | undefined) ?? "";
        if (Array.isArray(rec.overlays)) overlays.push(...(rec.overlays as Record<string, unknown>[]));
        if (rec.overlay && typeof rec.overlay === "object") overlays.push(rec.overlay as Record<string, unknown>);
        if (typeof url !== "string") return;
        if (mime.startsWith("image/")) images.push({ url, mime_type: mime });
        else if (mime.startsWith("audio/") || mime === "application/json" && rec.provider === "browser_speech") {
          audio = { url, mime_type: mime, duration_ms: rec.duration_ms as number | undefined, manifest: rec.manifest };
        } else if (mime.includes("subrip") || mime.includes("vtt") || rec.format === "srt" || rec.format === "vtt") {
          subtitles = {
            url, format: (rec.format as string) ?? "srt",
            segments: rec.segments, content: rec.content as string | undefined,
            duration_ms: rec.duration_ms as number | undefined,
          };
        }
      };
      for (const v of Object.values(inputs)) {
        if (v && typeof v === "object") collect(v as Record<string, unknown>);
      }
      if (images.length === 0) throw new Error("Timeline Builder: at least one upstream image is required");

      // Distribute scene durations: align with audio if available
      const totalAudioMs = audio?.duration_ms ?? subtitles?.duration_ms ?? Math.round(images.length * sceneSeconds * 1000);
      const perScene = totalAudioMs / images.length / 1000;
      const scenes = images.map((img, i) => ({
        index: i,
        image_url: img.url,
        start_seconds: +(i * perScene).toFixed(3),
        end_seconds: +((i + 1) * perScene).toFixed(3),
        duration_seconds: +perScene.toFixed(3),
      }));

      const timeline = {
        version: 1,
        resolution: dims, fps,
        duration_seconds: +(totalAudioMs / 1000).toFixed(3),
        scenes,
        audio: audio ? { url: audio.url, mime_type: audio.mime_type, manifest: audio.manifest } : null,
        subtitles,
        overlays,
      };
      await log(sb, { runId, nodeExecId, userId, level: "info",
        message: `Built timeline: ${scenes.length} scenes, ${(totalAudioMs/1000).toFixed(1)}s, ${dims.w}×${dims.h}@${fps}fps` });
      return { timeline, ...timeline };
    }
    case "media_overlay": {
      const overlayType = String(cfg.overlay_type ?? "hook_text");
      const text = interpolate(String(cfg.text ?? ""), { input: inputs, ...inputs });
      const imageField = String(cfg.image_field ?? "url").trim();
      let imageUrl: string | null = null;
      const upstreams = Object.values(inputs);
      if (overlayType === "image") {
        for (const v of upstreams) {
          if (v && typeof v === "object") {
            const rec = v as Record<string, unknown>;
            const candidate = rec[imageField] ?? rec.url ?? rec.file_url;
            if (typeof candidate === "string" && /^https?:/.test(candidate)) { imageUrl = candidate; break; }
          }
        }
      }
      const overlay = {
        kind: overlayType,
        text: overlayType === "image" ? null : text,
        image_url: imageUrl,
      };
      // Pass through the first upstream object and append our overlay
      const base = (upstreams.find((v) => v && typeof v === "object") as Record<string, unknown> | undefined) ?? {};
      const baseOverlays = Array.isArray(base.overlays) ? (base.overlays as unknown[]) : [];
      await log(sb, { runId, nodeExecId, userId, level: "info", message: `Added overlay: ${overlayType}` });
      return { ...base, overlays: [...baseOverlays, overlay] };
    }
    case "youtube_upload": {
      const sourceField = String(cfg.source_field ?? "url").trim();
      const upstreamKeys = Object.keys(inputs);
      if (upstreamKeys.length === 0) throw new Error("YouTube Upload: no upstream video");
      const upstream = inputs[upstreamKeys[0]] as Record<string, unknown>;
      const videoUrl = String(upstream?.[sourceField] ?? upstream?.url ?? "");
      if (!/^https?:\/\//.test(videoUrl)) throw new Error("YouTube Upload: upstream produced no http(s) video URL");
      const { data: integ } = await sb.from("user_integrations")
        .select("access_token, refresh_token, expires_at")
        .eq("provider", "youtube").maybeSingle();
      if (!integ?.access_token) {
        throw new Error("YouTube account not connected. Connect it on the Settings page, then retry.");
      }
      // Resumable upload init
      const meta = {
        snippet: { title: String(cfg.title ?? "Untitled"), description: String(cfg.description ?? "") },
        status: { privacyStatus: String(cfg.privacy ?? "private") },
      };
      const initRes = await fetch(
        "https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status",
        { method: "POST", headers: {
          Authorization: `Bearer ${integ.access_token}`,
          "Content-Type": "application/json",
        }, body: JSON.stringify(meta) },
      );
      if (!initRes.ok) throw new Error(`YouTube init failed ${initRes.status}: ${(await initRes.text()).slice(0, 300)}`);
      const uploadUrl = initRes.headers.get("location");
      if (!uploadUrl) throw new Error("YouTube: no upload URL returned");
      const videoBytes = await (await fetch(videoUrl)).arrayBuffer();
      const upRes = await fetch(uploadUrl, { method: "PUT", body: videoBytes });
      if (!upRes.ok) throw new Error(`YouTube upload failed ${upRes.status}: ${(await upRes.text()).slice(0, 300)}`);
      const result = (await upRes.json()) as { id?: string };
      await log(sb, { runId, nodeExecId, userId, level: "info", message: `Uploaded to YouTube id=${result.id ?? "?"}` });
      return { youtube_id: result.id, url: result.id ? `https://youtu.be/${result.id}` : null };
    }
    case "http_request": {
      const method = String(cfg.method ?? "GET");
      const url = interpolate(String(cfg.url ?? ""), { input: inputs, ...inputs });
      if (!url) throw new Error("HTTP Request: URL is empty");
      const bodyRaw = cfg.body ? interpolate(String(cfg.body), { input: inputs, ...inputs }) : undefined;
      const init: RequestInit = { method, headers: { "Content-Type": "application/json" } };
      if (bodyRaw && method !== "GET" && method !== "DELETE") init.body = bodyRaw;
      await log(sb, { runId, nodeExecId, userId, level: "info", message: `${method} ${url}` });
      const res = await fetch(url, init);
      const ct = res.headers.get("content-type") ?? "";
      const body = ct.includes("application/json") ? await res.json() : await res.text();
      await log(sb, { runId, nodeExecId, userId, level: res.ok ? "info" : "error", message: `→ ${res.status}` });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return { status: res.status, body };
    }
    case "delay": {
      const ms = Math.min(Math.max(Number(cfg.ms ?? 1000), 0), 60_000);
      await log(sb, { runId, nodeExecId, userId, level: "info", message: `Sleeping ${ms}ms` });
      await new Promise((r) => setTimeout(r, ms));
      return { waited_ms: ms };
    }
    case "condition": {
      const expr = String(cfg.expression ?? "true");
      // Safe eval: only support `input.X === 'Y'` style by inspecting input
      let result = false;
      try {
        // eslint-disable-next-line no-new-func
        const fn = new Function("input", `try { return Boolean(${expr}); } catch { return false; }`);
        result = Boolean(fn(inputs));
      } catch {
        result = false;
      }
      await log(sb, { runId, nodeExecId, userId, level: "info", message: `Condition → ${result}` });
      return { result, inputs };
    }
    case "cron_trigger":
    case "webhook_trigger": {
      return { triggered_at: new Date().toISOString(), payload: inputs };
    }
    case "save_asset": {
      const assetType = String(cfg.asset_type ?? "script");
      const sourceField = String(cfg.source ?? "text").trim();
      const name = cfg.name ? String(cfg.name) : null;

      // Find first upstream output and extract content
      const upstreamKeys = Object.keys(inputs);
      if (upstreamKeys.length === 0) throw new Error("Save Asset: no upstream node connected");
      const upstream = inputs[upstreamKeys[0]] as Record<string, unknown> | string | null;

      let content: string | null = null;
      let fileUrl: string | null = null;
      let storageBucket: string | null = null;
      let storagePath: string | null = null;
      let mimeType: string | null = null;
      let durationMs: number | null = null;
      if (typeof upstream === "string") {
        content = upstream;
      } else if (upstream && typeof upstream === "object") {
        const rec = upstream as Record<string, unknown>;
        const candidate = sourceField && sourceField in rec ? rec[sourceField] : (rec.text ?? rec.body ?? rec.content ?? rec.url);
        if (typeof candidate === "string") {
          if (assetType !== "script" && /^https?:\/\//i.test(candidate)) fileUrl = candidate;
          else content = candidate;
        } else {
          content = JSON.stringify(candidate ?? rec, null, 2);
        }
        if (typeof rec.storage_bucket === "string") storageBucket = rec.storage_bucket;
        if (typeof rec.bucket === "string" && !storageBucket) storageBucket = rec.bucket;
        if (typeof rec.storage_path === "string") storagePath = rec.storage_path;
        if (typeof rec.mime_type === "string") mimeType = rec.mime_type;
        if (typeof rec.duration_ms === "number") durationMs = rec.duration_ms;
      }

      const { data: assetRow, error: aErr } = await sb
        .from("assets")
        .insert({
          user_id: userId,
          workflow_run_id: runId,
          node_execution_id: nodeExecId,
          workflow_id: workflowId,
          node_key: node.node_key,
          type: assetType,
          name,
          content,
          file_url: fileUrl,
          storage_bucket: storageBucket,
          storage_path: storagePath,
          mime_type: mimeType,
          duration_ms: durationMs,
          metadata: { source_node: upstreamKeys[0], source_field: sourceField } as never,
        })
        .select("id")
        .single();
      if (aErr) throw new Error(`Save Asset failed: ${aErr.message}`);

      await log(sb, { runId, nodeExecId, userId, level: "info", message: `Saved ${assetType} asset ${assetRow.id}` });
      return { asset_id: assetRow.id, type: assetType, content, file_url: fileUrl };
    }
    default: {
      // Scaffold for unimplemented nodes — pass through, no fake output
      await log(sb, {
        runId, nodeExecId, userId, level: "warn",
        message: `Node type "${node.type}" has no executor in this phase; passing inputs through.`,
      });
      return { passthrough: inputs };
    }
  }
}

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  if (!ms || ms <= 0) return promise;
  return await Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`Timeout after ${ms}ms`)), ms)),
  ]);
}

export async function runWorkflowEngine(
  sb: SB,
  userId: string,
  workflowId: string,
  options: { triggerType?: string; parentRunId?: string } = {},
): Promise<{ runId: string; status: string }> {
  const triggerType = options.triggerType ?? "manual";
  // Verify workflow ownership and load graph
  const [{ data: wf, error: wfErr }, { data: nodes, error: nErr }, { data: edges, error: eErr }] = await Promise.all([
    sb.from("workflows").select("id,user_id,current_version").eq("id", workflowId).maybeSingle(),
    sb.from("workflow_nodes").select("id,node_key,type,label,config").eq("workflow_id", workflowId),
    sb.from("workflow_edges").select("source_key,target_key").eq("workflow_id", workflowId),
  ]);
  if (wfErr) throw new Error(wfErr.message);
  if (nErr) throw new Error(nErr.message);
  if (eErr) throw new Error(eErr.message);
  if (!wf) throw new Error("Workflow not found");

  const nodeRows = (nodes ?? []) as NodeRow[];
  const edgeRows = (edges ?? []) as EdgeRow[];

  if (nodeRows.length === 0) throw new Error("Workflow has no nodes");

  const { order, cycle } = topoSort(nodeRows, edgeRows);
  if (cycle) throw new Error("Workflow contains a cycle");

  // Create run
  const { data: runRow, error: runErr } = await sb
    .from("workflow_runs")
    .insert({
      workflow_id: workflowId,
      user_id: userId,
      status: "running",
      started_at: new Date().toISOString(),
      trigger_type: triggerType,
      parent_run_id: options.parentRunId ?? null,
      workflow_version: (wf as { current_version?: number }).current_version ?? null,
    })
    .select("id")
    .single();
  if (runErr) throw new Error(runErr.message);
  const runId = runRow.id;

  const incoming = new Map<string, string[]>();
  for (const n of nodeRows) incoming.set(n.node_key, []);
  for (const e of edgeRows) {
    if (incoming.has(e.target_key)) incoming.get(e.target_key)!.push(e.source_key);
  }

  await runOrderFromNode(sb, userId, runId, workflowId, nodeRows, order, incoming, {}, triggerType);
  return { runId, status: "started" };
}

/** Resume a run that paused for a browser node. Called by completeBrowserJob server fn. */
export async function resumeWorkflowRun(sb: SB, userId: string, runId: string): Promise<void> {
  const { data: run } = await sb.from("workflow_runs")
    .select("id, workflow_id, trigger_type, status, output_data")
    .eq("id", runId).maybeSingle();
  if (!run) throw new Error("Run not found");
  if (run.status !== "running") return;

  const [{ data: nodes }, { data: edges }, { data: execs }] = await Promise.all([
    sb.from("workflow_nodes").select("id,node_key,type,label,config").eq("workflow_id", run.workflow_id),
    sb.from("workflow_edges").select("source_key,target_key").eq("workflow_id", run.workflow_id),
    sb.from("node_executions").select("node_key,status,output_data").eq("workflow_run_id", runId),
  ]);
  const nodeRows = (nodes ?? []) as NodeRow[];
  const edgeRows = (edges ?? []) as EdgeRow[];
  const { order } = topoSort(nodeRows, edgeRows);
  const incoming = new Map<string, string[]>();
  for (const n of nodeRows) incoming.set(n.node_key, []);
  for (const e of edgeRows) {
    if (incoming.has(e.target_key)) incoming.get(e.target_key)!.push(e.source_key);
  }
  // Build outputs from completed nodes
  const outputs: Record<string, unknown> = {};
  const completedKeys = new Set<string>();
  for (const e of execs ?? []) {
    if (e.status === "success" || e.status === "skipped") {
      outputs[e.node_key] = e.output_data ?? {};
      completedKeys.add(e.node_key);
    }
  }
  // Run remaining
  const remaining = order.filter((n) => !completedKeys.has(n.node_key));
  await runOrderFromNode(sb, userId, runId, run.workflow_id, nodeRows, remaining, incoming, outputs, run.trigger_type ?? "manual");
}

async function runOrderFromNode(
  sb: SB, userId: string, runId: string, workflowId: string,
  _allNodes: NodeRow[], order: NodeRow[], incoming: Map<string, string[]>,
  initialOutputs: Record<string, unknown>, triggerType: string,
): Promise<void> {
  const outputs: Record<string, unknown> = { ...initialOutputs };
  const failures: string[] = [];
  let paused = false;

  for (const node of order) {
    // Cancellation check
    const { data: runState } = await sb.from("workflow_runs")
      .select("cancel_requested,status").eq("id", runId).maybeSingle();
    if (runState?.cancel_requested) {
      await sb.from("workflow_runs").update({
        status: "failed",
        error_message: "Cancelled by user",
        finished_at: new Date().toISOString(),
      }).eq("id", runId);
      return;
    }

    const cfg = (node.config ?? {}) as Record<string, unknown>;
    const retryMax = Math.max(0, Math.min(5, Number(cfg.retry_max ?? 0)));
    const timeoutMs = Math.max(0, Math.min(120_000, Number(cfg.timeout_ms ?? 60_000)));

    // Gather inputs from upstream outputs
    const ins: Record<string, unknown> = {};
    for (const src of incoming.get(node.node_key) ?? []) {
      if (src in outputs) ins[src] = outputs[src];
    }

    // Insert node_executions row (running)
    const startedAt = new Date();
    const { data: neRow, error: neErr } = await sb
      .from("node_executions")
      .insert({
        workflow_run_id: runId,
        user_id: userId,
        node_key: node.node_key,
        node_type: node.type,
        status: "running",
        input_data: ins as never,
        started_at: startedAt.toISOString(),
        provider: NODE_REGISTRY[node.type as NodeKind]?.provider ?? null,
      })
      .select("id")
      .single();
    if (neErr) { failures.push(neErr.message); break; }
    const nodeExecId = neRow.id;

    let attempt = 1;
    let lastErr: string | null = null;
    let succeeded = false;
    while (attempt <= retryMax + 1) {
      try {
        const out = await withTimeout(
          executeNode(sb, userId, runId, nodeExecId, node, ins, workflowId, triggerType),
          timeoutMs,
        );
        if (out === AWAITING_CLIENT) {
          // Pause the entire run; resumeWorkflowRun will continue when the browser job completes.
          paused = true;
          break;
        }
        outputs[node.node_key] = out;
        const finishedAt = new Date();
        await sb.from("node_executions").update({
          status: "success",
          output_data: out as never,
          finished_at: finishedAt.toISOString(),
          attempt,
          duration_ms: finishedAt.getTime() - startedAt.getTime(),
        }).eq("id", nodeExecId);
        succeeded = true;
        break;
      } catch (e) {
        lastErr = (e as Error).message;
        if (attempt <= retryMax) {
          await log(sb, { runId, nodeExecId, userId, level: "warn",
            message: `Attempt ${attempt}/${retryMax + 1} failed: ${lastErr}. Retrying…` });
          await new Promise((r) => setTimeout(r, 500 * attempt));
        }
        attempt++;
      }
    }
    if (paused) break;
    if (!succeeded) {
      const finishedAt = new Date();
      await sb.from("node_executions").update({
        status: "failed",
        error_message: lastErr,
        finished_at: finishedAt.toISOString(),
        attempt: attempt - 1,
        duration_ms: finishedAt.getTime() - startedAt.getTime(),
      }).eq("id", nodeExecId);
      await log(sb, { runId, nodeExecId, userId, level: "error", message: lastErr ?? "unknown error" });
      failures.push(`${node.node_key}: ${lastErr}`);
      break;
    }
  }

  if (paused) {
    // Run remains in 'running' status until browser executor completes the awaited node.
    return;
  }

  const finishedStatus = failures.length === 0 ? "success" : "failed";
  await sb
    .from("workflow_runs")
    .update({
      status: finishedStatus,
      finished_at: new Date().toISOString(),
      output_data: outputs as never,
      error_message: failures.length ? failures.join(" | ").slice(0, 4000) : null,
    })
    .eq("id", runId);
}