import { Handle, Position, type NodeProps } from "@xyflow/react";
import { NODE_REGISTRY, type NodeKind } from "@/lib/node-registry";
import { memo } from "react";

export type WorkflowNodeData = {
  kind: NodeKind;
  label?: string;
  config: Record<string, unknown>;
  status?: "pending" | "running" | "success" | "failed";
};

function WorkflowNodeBase({ data, selected }: NodeProps) {
  const d = data as unknown as WorkflowNodeData;
  const def = NODE_REGISTRY[d.kind];
  if (!def) return null;
  const Icon = def.icon;
  const isTrigger = def.category === "Trigger";
  const statusRing =
    d.status === "running" ? "ring-2 ring-primary glow-ring animate-pulse" :
    d.status === "success" ? "ring-2 ring-success" :
    d.status === "failed" ? "ring-2 ring-destructive" :
    "";

  return (
    <div
      className={`glass min-w-[200px] rounded-xl px-3 py-2.5 transition ${
        selected ? "ring-2 ring-primary glow-ring" : ""
      } ${statusRing}`}
      style={{ borderColor: `oklch(0.50 0.10 ${def.hue} / 0.5)` }}
    >
      {!isTrigger && <Handle type="target" position={Position.Left} />}
      <div className="flex items-center gap-2.5">
        <div
          className="grid h-8 w-8 place-items-center rounded-md"
          style={{ background: `oklch(0.30 0.08 ${def.hue} / 0.7)`, color: `oklch(0.95 0.12 ${def.hue})` }}
        >
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{def.category}</div>
          <div className="truncate text-sm font-medium">{d.label?.trim() || def.label}</div>
          {d.status && (
            <div className="text-[10px] mt-0.5 capitalize text-muted-foreground">{d.status}</div>
          )}
        </div>
      </div>
      <Handle type="source" position={Position.Right} />
    </div>
  );
}

export const WorkflowNode = memo(WorkflowNodeBase);
