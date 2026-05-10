import { NODE_LIST, type NodeKind } from "@/lib/node-registry";
import { ScrollArea } from "@/components/ui/scroll-area";

export function NodePalette() {
  const grouped = NODE_LIST.reduce<Record<string, typeof NODE_LIST>>((acc, n) => {
    (acc[n.category] ??= []).push(n);
    return acc;
  }, {});

  const onDragStart = (e: React.DragEvent, kind: NodeKind) => {
    e.dataTransfer.setData("application/x-node-kind", kind);
    e.dataTransfer.effectAllowed = "move";
  };

  return (
    <aside className="glass w-64 shrink-0 rounded-xl">
      <div className="border-b border-border px-4 py-3">
        <div className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Nodes</div>
        <div className="mt-1 text-[11px] text-muted-foreground">Drag onto canvas</div>
      </div>
      <ScrollArea className="h-[calc(100vh-220px)]">
        <div className="space-y-5 p-3">
          {Object.entries(grouped).map(([cat, items]) => (
            <div key={cat}>
              <div className="mb-2 px-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">{cat}</div>
              <div className="space-y-1.5">
                {items.map((n) => (
                  <div
                    key={n.kind}
                    draggable
                    onDragStart={(e) => onDragStart(e, n.kind)}
                    className="group flex cursor-grab items-center gap-3 rounded-lg border border-border bg-card/50 px-3 py-2 transition hover:bg-card hover:glow-ring active:cursor-grabbing"
                  >
                    <div
                      className="grid h-7 w-7 place-items-center rounded-md"
                      style={{ background: `oklch(0.30 0.06 ${n.hue} / 0.6)`, color: `oklch(0.92 0.10 ${n.hue})` }}
                    >
                      <n.icon className="h-3.5 w-3.5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-xs font-medium">{n.label}</div>
                      <div className="truncate text-[10px] text-muted-foreground">{n.description}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>
    </aside>
  );
}
