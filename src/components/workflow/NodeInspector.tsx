import { NODE_REGISTRY } from "@/lib/node-registry";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Trash2 } from "lucide-react";
import type { Node } from "@xyflow/react";
import type { WorkflowNodeData } from "./WorkflowNode";

type Props = {
  node: Node<WorkflowNodeData> | null;
  onChange: (id: string, patch: Partial<WorkflowNodeData>) => void;
  onDelete: (id: string) => void;
};

export function NodeInspector({ node, onChange, onDelete }: Props) {
  if (!node) {
    return (
      <aside className="glass w-80 shrink-0 rounded-xl p-5">
        <div className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Inspector</div>
        <p className="mt-3 text-sm text-muted-foreground">Select a node to edit its configuration. Drag from the left to add new nodes.</p>
      </aside>
    );
  }
  const def = NODE_REGISTRY[node.data.kind];
  const config = node.data.config ?? {};

  const setConfig = (key: string, val: unknown) =>
    onChange(node.id, { config: { ...config, [key]: val } });

  return (
    <aside className="glass w-80 shrink-0 rounded-xl">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div>
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{def.category}</div>
          <div className="text-sm font-semibold">{def.label}</div>
        </div>
        <Button size="icon" variant="ghost" onClick={() => onDelete(node.id)} title="Delete node">
          <Trash2 className="h-4 w-4 text-destructive" />
        </Button>
      </div>
      <div className="space-y-4 p-4">
        <div className="space-y-1.5">
          <Label className="text-xs">Label</Label>
          <Input
            value={node.data.label ?? ""}
            placeholder={def.label}
            onChange={(e) => onChange(node.id, { label: e.target.value })}
          />
        </div>
        {def.fields.map((f) => {
          const value = (config as Record<string, unknown>)[f.key];
          if (f.type === "textarea") {
            return (
              <div key={f.key} className="space-y-1.5">
                <Label className="text-xs">{f.label}</Label>
                <Textarea
                  value={(value as string) ?? ""}
                  placeholder={f.placeholder}
                  onChange={(e) => setConfig(f.key, e.target.value)}
                  className="min-h-24"
                />
              </div>
            );
          }
          if (f.type === "select") {
            return (
              <div key={f.key} className="space-y-1.5">
                <Label className="text-xs">{f.label}</Label>
                <Select value={(value as string) ?? f.default ?? ""} onValueChange={(v) => setConfig(f.key, v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {f.options.map((o) => (<SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>
            );
          }
          return (
            <div key={f.key} className="space-y-1.5">
              <Label className="text-xs">{f.label}</Label>
              <Input
                type={f.type === "number" ? "number" : f.type === "url" ? "url" : "text"}
                value={(value as string | number) ?? ""}
                placeholder={f.placeholder}
                onChange={(e) => setConfig(f.key, f.type === "number" ? Number(e.target.value) : e.target.value)}
              />
            </div>
          );
        })}
      </div>
    </aside>
  );
}
