import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2, FileText, Music, Video as VideoIcon, Image as ImageIcon, Trash2, ExternalLink, Download, Captions } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/assets")({ component: AssetsPage });

type AssetRow = {
  id: string;
  type: string;
  name: string | null;
  content: string | null;
  file_url: string | null;
  thumbnail_url: string | null;
  storage_bucket: string | null;
  storage_path: string | null;
  mime_type: string | null;
  size_bytes: number | null;
  duration_ms: number | null;
  metadata: Record<string, unknown> | null;
  workflow_run_id: string | null;
  workflow_id: string | null;
  node_key: string | null;
  created_at: string;
};

const ICON: Record<string, typeof FileText> = {
  script: FileText, audio: Music, video: VideoIcon, image: ImageIcon, subtitles: Captions,
};

function formatBytes(b: number | null): string {
  if (!b) return "—";
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1024 / 1024).toFixed(1)} MB`;
}

function formatDuration(ms: number | null): string {
  if (!ms) return "—";
  const s = Math.round(ms / 1000);
  const m = Math.floor(s / 60);
  return m > 0 ? `${m}:${String(s % 60).padStart(2, "0")}` : `${s}s`;
}

async function refreshSignedUrl(bucket: string | null, path: string | null, fallback: string | null): Promise<string | null> {
  if (bucket && path) {
    const { data } = await supabase.storage.from(bucket).createSignedUrl(path, 60 * 60);
    if (data?.signedUrl) return data.signedUrl;
  }
  return fallback;
}

function AssetsPage() {
  const [rows, setRows] = useState<AssetRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [preview, setPreview] = useState<AssetRow | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const load = async () => {
    const { data, error } = await supabase
      .from("assets")
      .select("id,type,name,content,file_url,thumbnail_url,storage_bucket,storage_path,mime_type,size_bytes,duration_ms,metadata,workflow_run_id,workflow_id,node_key,created_at")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) { toast.error(error.message); return; }
    setRows((data ?? []) as AssetRow[]);
    setLoading(false);
  };

  useEffect(() => {
    load();
    const ch = supabase
      .channel("assets-feed")
      .on("postgres_changes", { event: "*", schema: "public", table: "assets" }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  const onDelete = async (id: string) => {
    const { error } = await supabase.from("assets").delete().eq("id", id);
    if (error) toast.error(error.message);
    else setRows((r) => r.filter((x) => x.id !== id));
  };

  const openPreview = async (a: AssetRow) => {
    setPreview(a);
    setPreviewUrl(null);
    const url = await refreshSignedUrl(a.storage_bucket, a.storage_path, a.file_url);
    setPreviewUrl(url);
  };

  const onDownload = async (a: AssetRow) => {
    const url = await refreshSignedUrl(a.storage_bucket, a.storage_path, a.file_url);
    if (!url) { toast.error("No file available"); return; }
    const ext = (a.mime_type ?? "").split("/")[1] ?? "bin";
    const name = (a.name ?? `asset-${a.id.slice(0, 8)}`).replace(/\s+/g, "_") + `.${ext}`;
    const blob = await (await fetch(url)).blob();
    const obj = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = obj; link.download = name; link.click();
    URL.revokeObjectURL(obj);
  };

  const Tile = ({ a }: { a: AssetRow }) => {
    if (a.type === "image" && a.file_url) {
      return <img src={a.file_url} alt={a.name ?? "image"} className="h-32 w-full rounded-md object-cover" loading="lazy" />;
    }
    if (a.type === "video" && a.thumbnail_url) {
      return <img src={a.thumbnail_url} alt="" className="h-32 w-full rounded-md object-cover" loading="lazy" />;
    }
    return null;
  };

  return (
    <div className="mx-auto w-full max-w-6xl p-6">
      <div className="mb-6 flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Assets</h1>
          <p className="text-sm text-muted-foreground">Generated content saved by your workflows.</p>
        </div>
        <Badge variant="secondary">{rows.length} total</Badge>
      </div>

      {loading ? (
        <div className="grid place-items-center py-24"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
      ) : rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card/40 p-12 text-center">
          <p className="text-sm text-muted-foreground">
            No assets yet. Add a <span className="font-medium text-foreground">Save Asset</span> node to a workflow and run it.
          </p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((a) => {
            const Icon = ICON[a.type] ?? FileText;
            return (
              <div key={a.id} className="group flex flex-col gap-3 rounded-xl border border-border bg-card/60 p-4 backdrop-blur-md transition-colors hover:border-primary/40">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <div className="grid h-8 w-8 place-items-center rounded-lg bg-primary/10 text-primary">
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium">{a.name ?? `${a.type} asset`}</div>
                      <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{a.type}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button size="icon" variant="ghost" onClick={() => onDownload(a)} title="Download">
                      <Download className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="icon" variant="ghost" onClick={() => onDelete(a.id)} title="Delete">
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
                <Tile a={a} />
                <button
                  onClick={() => openPreview(a)}
                  className="line-clamp-4 rounded-md bg-muted/30 p-2 text-left text-xs text-muted-foreground hover:bg-muted/50"
                >
                  {a.content?.slice(0, 280) ?? a.file_url ?? "(empty)"}
                </button>
                <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                  <span>{formatBytes(a.size_bytes)}</span>
                  {a.duration_ms ? <span>{formatDuration(a.duration_ms)}</span> : null}
                  {a.mime_type ? <span className="truncate">{a.mime_type}</span> : null}
                </div>
                <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                  <span>{new Date(a.created_at).toLocaleString()}</span>
                  {a.workflow_id && (
                    <Link to="/workflows/$id" params={{ id: a.workflow_id }} className="inline-flex items-center gap-1 hover:text-foreground">
                      Workflow <ExternalLink className="h-3 w-3" />
                    </Link>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={!!preview} onOpenChange={(o) => { if (!o) { setPreview(null); setPreviewUrl(null); } }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{preview?.name ?? `${preview?.type} asset`}</DialogTitle>
          </DialogHeader>
          {preview && previewUrl && preview.type === "video" && (
            <video src={previewUrl} controls className="w-full rounded-md bg-black" style={{ maxHeight: "70vh" }} />
          )}
          {preview && previewUrl && preview.type === "audio" && (
            <audio src={previewUrl} controls className="w-full" />
          )}
          {preview && previewUrl && preview.type === "image" && (
            <img src={previewUrl} alt={preview.name ?? ""} className="w-full rounded-md" />
          )}
          {preview && previewUrl && (preview.type === "subtitles" || preview.type === "script") && !preview.content && (
            <a href={previewUrl} target="_blank" rel="noreferrer" className="text-sm text-primary underline break-all">{previewUrl}</a>
          )}
          {preview?.content && (
            <pre className="max-h-[60vh] overflow-auto whitespace-pre-wrap rounded-md bg-muted/40 p-3 text-xs">
              {preview.content}
            </pre>
          )}
          {preview && (
            <div className="grid grid-cols-3 gap-2 text-[11px] text-muted-foreground">
              <div><div className="text-[9px] uppercase">Size</div>{formatBytes(preview.size_bytes)}</div>
              <div><div className="text-[9px] uppercase">Duration</div>{formatDuration(preview.duration_ms)}</div>
              <div><div className="text-[9px] uppercase">MIME</div>{preview.mime_type ?? "—"}</div>
            </div>
          )}
          {preview && (
            <div className="flex justify-end">
              <Button size="sm" variant="outline" onClick={() => onDownload(preview)}>
                <Download className="mr-2 h-3.5 w-3.5" /> Download
              </Button>
            </div>
          )}
          <div className="text-[11px] text-muted-foreground">
            Run: {preview?.workflow_run_id ?? "—"} · Node: {preview?.node_key ?? "—"}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}