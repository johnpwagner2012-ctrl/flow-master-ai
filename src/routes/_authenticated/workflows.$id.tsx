import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, Loader2, Power, PowerOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { updateWorkflowMeta, type WorkflowRow } from "@/lib/workflow-api";
import { FlowEditor } from "@/components/workflow/FlowEditor";
import { ExecutionPanel } from "@/components/workflow/ExecutionPanel";
import type { WorkflowNodeData } from "@/components/workflow/WorkflowNode";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/workflows/$id")({ component: WorkflowEditorPage });

function WorkflowEditorPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const [wf, setWf] = useState<WorkflowRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [nodeStatuses, setNodeStatuses] = useState<Record<string, WorkflowNodeData["status"]>>({});

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase.from("workflows").select("*").eq("id", id).maybeSingle();
      if (cancelled) return;
      if (error) { toast.error(error.message); navigate({ to: "/workflows" }); return; }
      if (!data) { toast.error("Workflow not found"); navigate({ to: "/workflows" }); return; }
      setWf(data as WorkflowRow);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [id, navigate]);

  const updateMeta = async (patch: Partial<WorkflowRow>) => {
    if (!wf) return;
    setWf({ ...wf, ...patch });
    setSaving(true);
    try { await updateWorkflowMeta(wf.id, patch); }
    catch (e) { toast.error((e as Error).message); }
    finally { setSaving(false); }
  };

  if (loading || !wf) {
    return <div className="grid h-screen place-items-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="flex h-screen flex-col">
      <header className="flex items-center justify-between gap-4 border-b border-border px-4 py-3">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <Link to="/workflows"><Button size="icon" variant="ghost"><ArrowLeft className="h-4 w-4" /></Button></Link>
          <Input
            value={wf.name}
            onChange={(e) => setWf({ ...wf, name: e.target.value })}
            onBlur={() => updateMeta({ name: wf.name.trim() || "Untitled workflow" })}
            className="max-w-md border-transparent bg-transparent text-base font-medium focus-visible:bg-card"
          />
          {saving && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 rounded-full border border-border bg-card/60 px-3 py-1.5 text-xs">
            {wf.is_active ? <Power className="h-3 w-3 text-success" /> : <PowerOff className="h-3 w-3 text-muted-foreground" />}
            <span className="text-muted-foreground">{wf.is_active ? "Active" : "Draft"}</span>
            <Switch checked={wf.is_active} onCheckedChange={(v) => updateMeta({ is_active: v })} />
          </div>
        </div>
      </header>
      <div className="flex flex-1 overflow-hidden">
        <div className="flex-1 overflow-hidden">
          <FlowEditor workflowId={wf.id} nodeStatuses={nodeStatuses} />
        </div>
        <div className="flex h-full py-3 pr-3">
          <ExecutionPanel workflowId={wf.id} onStatusesChange={setNodeStatuses} />
        </div>
      </div>
    </div>
  );
}
