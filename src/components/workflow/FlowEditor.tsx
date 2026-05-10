import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  useReactFlow,
  type Connection,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange,
  type Viewport,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import { WorkflowNode, type WorkflowNodeData } from "./WorkflowNode";
import { NodePalette } from "./NodePalette";
import { NodeInspector } from "./NodeInspector";
import { NODE_REGISTRY, type NodeKind } from "@/lib/node-registry";
import { getWorkflow, syncCanvas, updateWorkflowMeta } from "@/lib/workflow-api";
import { Loader2, Check, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

type SaveState = "idle" | "saving" | "saved" | "error";

function defaultConfig(kind: NodeKind): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of NODE_REGISTRY[kind].fields) if ("default" in f && f.default !== undefined) out[f.key] = f.default;
  return out;
}

function Canvas({ workflowId, nodeStatuses }: { workflowId: string; nodeStatuses?: Record<string, WorkflowNodeData["status"]> }) {
  const [nodes, setNodes] = useState<Node<WorkflowNodeData>[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [viewport, setViewport] = useState<Viewport | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const wrapper = useRef<HTMLDivElement>(null);
  const { screenToFlowPosition } = useReactFlow();

  // Load
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { workflow, nodes: nRows, edges: eRows } = await getWorkflow(workflowId);
        if (cancelled) return;
        setNodes(
          nRows.map((n) => ({
            id: n.node_key,
            type: "workflow",
            position: { x: n.position_x, y: n.position_y },
            data: { kind: n.type, label: n.label ?? undefined, config: (n.config as Record<string, unknown>) ?? {} },
          })),
        );
        setEdges(
          eRows.map((e) => ({
            id: e.edge_key,
            source: e.source_key,
            target: e.target_key,
            sourceHandle: e.source_handle ?? undefined,
            targetHandle: e.target_handle ?? undefined,
          })),
        );
        setViewport(workflow.viewport ?? { x: 0, y: 0, zoom: 1 });
      } catch (e) {
        toast.error(`Failed to load workflow: ${(e as Error).message}`);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [workflowId]);

  // Debounced autosave
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dirty = useRef(false);
  const scheduleSave = useCallback(() => {
    dirty.current = true;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      if (!dirty.current) return;
      setSaveState("saving");
      try {
        await syncCanvas({
          workflowId,
          nodes: nodes.map((n) => ({
            node_key: n.id,
            type: n.data.kind,
            label: n.data.label ?? null,
            position_x: n.position.x,
            position_y: n.position.y,
            config: n.data.config ?? {},
          })),
          edges: edges.map((e) => ({
            edge_key: e.id,
            source_key: e.source,
            target_key: e.target,
            source_handle: e.sourceHandle ?? null,
            target_handle: e.targetHandle ?? null,
          })),
        });
        dirty.current = false;
        setSaveState("saved");
        setTimeout(() => setSaveState((s) => (s === "saved" ? "idle" : s)), 1500);
      } catch (e) {
        setSaveState("error");
        toast.error(`Save failed: ${(e as Error).message}`);
      }
    }, 600);
  }, [workflowId, nodes, edges]);

  useEffect(() => {
    if (loading) return;
    scheduleSave();
  }, [nodes, edges, loading, scheduleSave]);

  // Persist viewport (rarely)
  const vpTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onMove = useCallback(
    (_: unknown, vp: Viewport) => {
      setViewport(vp);
      if (vpTimer.current) clearTimeout(vpTimer.current);
      vpTimer.current = setTimeout(() => {
        updateWorkflowMeta(workflowId, { viewport: vp }).catch(() => {});
      }, 1200);
    },
    [workflowId],
  );

  const onNodesChange = useCallback((changes: NodeChange[]) => {
    setNodes((nds) => applyNodeChanges(changes, nds) as Node<WorkflowNodeData>[]);
  }, []);
  const onEdgesChange = useCallback((changes: EdgeChange[]) => {
    setEdges((eds) => applyEdgeChanges(changes, eds));
  }, []);
  const onConnect = useCallback((c: Connection) => {
    setEdges((eds) => addEdge({ ...c, id: `e_${crypto.randomUUID()}` }, eds));
  }, []);

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  }, []);
  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const kind = e.dataTransfer.getData("application/x-node-kind") as NodeKind;
      if (!kind || !NODE_REGISTRY[kind]) return;
      const position = screenToFlowPosition({ x: e.clientX, y: e.clientY });
      const id = `n_${crypto.randomUUID()}`;
      const newNode: Node<WorkflowNodeData> = {
        id, type: "workflow", position,
        data: { kind, config: defaultConfig(kind) },
      };
      setNodes((nds) => [...nds, newNode]);
      setSelectedId(id);
    },
    [screenToFlowPosition],
  );

  const updateNode = useCallback((id: string, patch: Partial<WorkflowNodeData>) => {
    setNodes((nds) => nds.map((n) => (n.id === id ? { ...n, data: { ...n.data, ...patch } } : n)));
  }, []);
  const deleteNode = useCallback((id: string) => {
    setNodes((nds) => nds.filter((n) => n.id !== id));
    setEdges((eds) => eds.filter((e) => e.source !== id && e.target !== id));
    setSelectedId((s) => (s === id ? null : s));
  }, []);

  const nodeTypes = useMemo(() => ({ workflow: WorkflowNode }), []);
  const selected = nodes.find((n) => n.id === selectedId) ?? null;

  const renderedNodes = useMemo(() => {
    if (!nodeStatuses) return nodes;
    return nodes.map((n) => ({ ...n, data: { ...n.data, status: nodeStatuses[n.id] } }));
  }, [nodes, nodeStatuses]);

  return (
    <div className="flex h-full gap-3 p-3">
      <NodePalette />
      <div ref={wrapper} className="glass relative flex-1 overflow-hidden rounded-xl" onDragOver={onDragOver} onDrop={onDrop}>
        {loading ? (
          <div className="grid h-full place-items-center text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /></div>
        ) : (
          <>
            <ReactFlow
              nodes={renderedNodes}
              edges={edges}
              defaultViewport={viewport ?? { x: 0, y: 0, zoom: 1 }}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              onMoveEnd={onMove}
              onNodeClick={(_, n) => setSelectedId(n.id)}
              onPaneClick={() => setSelectedId(null)}
              nodeTypes={nodeTypes}
              fitView={!viewport}
              proOptions={{ hideAttribution: false }}
            >
              <Background variant={BackgroundVariant.Dots} gap={18} size={1} color="oklch(1 0 0 / 0.08)" />
              <Controls position="bottom-right" />
              <MiniMap
                pannable zoomable maskColor="oklch(0.16 0.02 270 / 0.8)"
                nodeColor={(n) => `oklch(0.40 0.12 ${NODE_REGISTRY[(n.data as WorkflowNodeData).kind]?.hue ?? 200})`}
              />
            </ReactFlow>
            <div className="pointer-events-none absolute right-3 top-3 flex items-center gap-2 rounded-full border border-border bg-card/70 px-3 py-1 text-xs backdrop-blur-md">
              {saveState === "saving" && (<><Loader2 className="h-3 w-3 animate-spin" /> Saving…</>)}
              {saveState === "saved" && (<><Check className="h-3 w-3 text-success" /> Saved</>)}
              {saveState === "error" && (<><AlertTriangle className="h-3 w-3 text-destructive" /> Save error</>)}
              {saveState === "idle" && (<><Check className="h-3 w-3 text-muted-foreground" /> Up to date</>)}
            </div>
          </>
        )}
      </div>
      <NodeInspector node={selected} onChange={updateNode} onDelete={deleteNode} />
    </div>
  );
}

export function FlowEditor({ workflowId, nodeStatuses }: { workflowId: string; nodeStatuses?: Record<string, WorkflowNodeData["status"]> }) {
  return (
    <ReactFlowProvider>
      <Canvas workflowId={workflowId} nodeStatuses={nodeStatuses} />
    </ReactFlowProvider>
  );
}
