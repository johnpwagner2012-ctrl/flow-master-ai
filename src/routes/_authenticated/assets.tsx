import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2, FileText, Music, Video as VideoIcon, Image as ImageIcon, Trash2, ExternalLink } from "lucide-react";
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
  workflow_run_id: string | null;
  workflow_id: string | null;
  node_key: string | null;
  created_at: string;
};

const ICON: Record<string, typeof FileText> = {
  script: FileText, audio: Music, video: VideoIcon, image: ImageIcon,
};

function AssetsPage() {
  const [rows, setRows] = useState<AssetRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [preview, setPreview] = useState<AssetRow | null>(null);

  const load = async () => {
    const { data, error } = await supabase
      .from("assets")
      .select("id,type,name,content,file_url,workflow_run_id,workflow_id,node_key,created_at")
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
                  <Button size="icon" variant="ghost" onClick={() => onDelete(a.id)} title="Delete">
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
                <button
                  onClick={() => setPreview(a)}
                  className="line-clamp-4 rounded-md bg-muted/30 p-2 text-left text-xs text-muted-foreground hover:bg-muted/50"
                >
                  {a.content?.slice(0, 280) ?? a.file_url ?? "(empty)"}
                </button>
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

      <Dialog open={!!preview} onOpenChange={(o) => !o && setPreview(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{preview?.name ?? `${preview?.type} asset`}</DialogTitle>
          </DialogHeader>
          {preview?.file_url && (
            <a href={preview.file_url} target="_blank" rel="noreferrer" className="text-sm text-primary underline break-all">
              {preview.file_url}
            </a>
          )}
          {preview?.content && (
            <pre className="max-h-[60vh] overflow-auto whitespace-pre-wrap rounded-md bg-muted/40 p-3 text-xs">
              {preview.content}
            </pre>
          )}
          <div className="text-[11px] text-muted-foreground">
            Run: {preview?.workflow_run_id ?? "—"} · Node: {preview?.node_key ?? "—"}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}