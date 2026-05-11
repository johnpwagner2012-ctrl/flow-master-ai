import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

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

async function log(sb: SB, params: { runId: string; nodeExecId: string; userId: string; level: string; message: string }) {
  await sb.from("execution_logs").insert({
    workflow_run_id: params.runId,
    node_execution_id: params.nodeExecId,
    user_id: params.userId,
    level: params.level,
    message: params.message.slice(0, 4000),
  });
}

async function executeNode(
  sb: SB,
  userId: string,
  runId: string,
  nodeExecId: string,
  node: NodeRow,
  inputs: Record<string, unknown>,
): Promise<unknown> {
  const cfg = node.config ?? {};
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
      }

      const { data: assetRow, error: aErr } = await sb
        .from("assets")
        .insert({
          user_id: userId,
          workflow_run_id: runId,
          node_execution_id: nodeExecId,
          node_key: node.node_key,
          type: assetType,
          name,
          content,
          file_url: fileUrl,
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

export async function runWorkflowEngine(sb: SB, userId: string, workflowId: string): Promise<{ runId: string }> {
  // Verify workflow ownership and load graph
  const [{ data: wf, error: wfErr }, { data: nodes, error: nErr }, { data: edges, error: eErr }] = await Promise.all([
    sb.from("workflows").select("id,user_id").eq("id", workflowId).maybeSingle(),
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
    })
    .select("id")
    .single();
  if (runErr) throw new Error(runErr.message);
  const runId = runRow.id;

  // Build incoming map for input gathering
  const incoming = new Map<string, string[]>();
  for (const n of nodeRows) incoming.set(n.node_key, []);
  for (const e of edgeRows) {
    if (incoming.has(e.target_key)) incoming.get(e.target_key)!.push(e.source_key);
  }

  const outputs: Record<string, unknown> = {};
  const failures: string[] = [];

  for (const node of order) {
    // Gather inputs from upstream outputs
    const ins: Record<string, unknown> = {};
    for (const src of incoming.get(node.node_key) ?? []) {
      if (src in outputs) ins[src] = outputs[src];
    }

    // Insert node_executions row (running)
    const { data: neRow, error: neErr } = await sb
      .from("node_executions")
      .insert({
        workflow_run_id: runId,
        user_id: userId,
        node_key: node.node_key,
        node_type: node.type,
        status: "running",
        input_data: ins as never,
        started_at: new Date().toISOString(),
      })
      .select("id")
      .single();
    if (neErr) { failures.push(neErr.message); break; }
    const nodeExecId = neRow.id;

    try {
      const out = await executeNode(sb, userId, runId, nodeExecId, node, ins);
      outputs[node.node_key] = out;
      await sb
        .from("node_executions")
        .update({
          status: "success",
          output_data: out as never,
          finished_at: new Date().toISOString(),
        })
        .eq("id", nodeExecId);
    } catch (e) {
      const msg = (e as Error).message;
      await sb
        .from("node_executions")
        .update({
          status: "failed",
          error_message: msg,
          finished_at: new Date().toISOString(),
        })
        .eq("id", nodeExecId);
      await log(sb, { runId, nodeExecId, userId, level: "error", message: msg });
      failures.push(`${node.node_key}: ${msg}`);
      break; // stop on first failure
    }
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

  return { runId };
}