import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { resumeWorkflowRun, runWorkflowEngine } from "./execution.server";

const AssetInput = z.object({
  type: z.string().min(1).max(40),
  name: z.string().max(200).nullish(),
  storage_bucket: z.string().min(1).max(80),
  storage_path: z.string().min(1).max(500),
  mime_type: z.string().max(120).nullish(),
  size_bytes: z.number().int().nonnegative().nullish(),
  duration_ms: z.number().int().nonnegative().nullish(),
  thumbnail_url: z.string().url().nullish(),
  file_url: z.string().url().nullish(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

/** Heartbeat to extend the lease while a long browser job is running. */
export const heartbeatClientJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      jobId: z.string().uuid(),
      workerId: z.string().min(1).max(80),
      leaseSeconds: z.number().int().min(15).max(900).default(120),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const lease = new Date(Date.now() + data.leaseSeconds * 1000).toISOString();
    const { data: row, error } = await supabase
      .from("pending_client_jobs")
      .update({ heartbeat_at: new Date().toISOString(), lease_until: lease })
      .eq("id", data.jobId)
      .eq("claimed_by", data.workerId)
      .eq("status", "claimed")
      .select("id")
      .maybeSingle();
    if (error) throw new Error(error.message);
    return { ok: !!row };
  });

/** Report incremental progress for a running browser job (0-100 + short message). */
export const reportClientJobProgress = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      jobId: z.string().uuid(),
      workerId: z.string().min(1).max(80),
      pct: z.number().int().min(0).max(100),
      message: z.string().max(200).optional(),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: job } = await supabase
      .from("pending_client_jobs")
      .select("node_execution_id, claimed_by, status")
      .eq("id", data.jobId)
      .maybeSingle();
    if (!job || job.status !== "claimed" || job.claimed_by !== data.workerId) return { ok: false };
    const lease = new Date(Date.now() + 120 * 1000).toISOString();
    await supabase
      .from("pending_client_jobs")
      .update({ heartbeat_at: new Date().toISOString(), lease_until: lease })
      .eq("id", data.jobId);
    await supabase
      .from("node_executions")
      .update({ progress_pct: data.pct, progress_message: data.message ?? null })
      .eq("id", job.node_execution_id);
    return { ok: true };
  });

/** Mark a browser job as completed. Idempotent: safe to call twice. */
export const completeClientJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      jobId: z.string().uuid(),
      workerId: z.string().min(1).max(80),
      output: z.record(z.string(), z.unknown()),
      assets: z.array(AssetInput).max(10).default([]),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // Fetch and ownership-verify the job
    const { data: job, error: jErr } = await supabase
      .from("pending_client_jobs")
      .select("id, workflow_id, workflow_run_id, node_execution_id, node_key, status, claimed_by")
      .eq("id", data.jobId)
      .maybeSingle();
    if (jErr) throw new Error(jErr.message);
    if (!job) throw new Error("Job not found");
    if (job.status === "completed") return { ok: true, alreadyCompleted: true };
    if (job.claimed_by && job.claimed_by !== data.workerId) {
      throw new Error("Job claimed by a different worker");
    }

    // 1) Update node_execution to success (idempotent: only if still running/awaiting)
    const finishedAt = new Date().toISOString();
    await supabase
      .from("node_executions")
      .update({
        status: "success",
        output_data: data.output as never,
        finished_at: finishedAt,
      })
      .eq("id", job.node_execution_id)
      .in("status", ["running", "awaiting_client"]);

    // 2) Register assets
    if (data.assets.length > 0) {
      const rows = data.assets.map((a) => ({
        user_id: userId,
        workflow_id: job.workflow_id,
        workflow_run_id: job.workflow_run_id,
        node_execution_id: job.node_execution_id,
        node_key: job.node_key,
        type: a.type,
        name: a.name ?? null,
        storage_bucket: a.storage_bucket,
        storage_path: a.storage_path,
        mime_type: a.mime_type ?? null,
        size_bytes: a.size_bytes ?? null,
        duration_ms: a.duration_ms ?? null,
        thumbnail_url: a.thumbnail_url ?? null,
        file_url: a.file_url ?? null,
        metadata: (a.metadata ?? {}) as never,
        provider: "browser_executor",
      }));
      const { error: aErr } = await supabase.from("assets").insert(rows);
      if (aErr) throw new Error(`Asset insert failed: ${aErr.message}`);
    }

    // 3) Mark job completed
    await supabase
      .from("pending_client_jobs")
      .update({ status: "completed", completed_at: finishedAt, last_error: null })
      .eq("id", data.jobId);

    // 4) Resume the run
    try {
      await resumeWorkflowRun(supabase, userId, job.workflow_run_id);
    } catch (e) {
      // Resume errors don't undo the completion; log and bubble.
      await supabase.from("execution_logs").insert({
        workflow_run_id: job.workflow_run_id,
        node_execution_id: job.node_execution_id,
        user_id: userId,
        level: "error",
        message: `Resume failed: ${(e as Error).message}`.slice(0, 4000),
      });
      throw e;
    }
    return { ok: true };
  });

/** Mark a browser job as failed. If retries remain, requeue it. Otherwise fail the run. */
export const failClientJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      jobId: z.string().uuid(),
      workerId: z.string().min(1).max(80),
      error: z.string().min(1).max(2000),
      fatal: z.boolean().default(false),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: job, error: jErr } = await supabase
      .from("pending_client_jobs")
      .select("id, workflow_run_id, node_execution_id, attempts, max_attempts, status, claimed_by")
      .eq("id", data.jobId)
      .maybeSingle();
    if (jErr) throw new Error(jErr.message);
    if (!job) throw new Error("Job not found");
    if (job.status === "completed") return { ok: true, alreadyCompleted: true };
    if (job.claimed_by && job.claimed_by !== data.workerId) {
      throw new Error("Job claimed by a different worker");
    }

    const exhausted = data.fatal || job.attempts >= job.max_attempts;
    const now = new Date().toISOString();

    await supabase.from("execution_logs").insert({
      workflow_run_id: job.workflow_run_id,
      node_execution_id: job.node_execution_id,
      user_id: userId,
      level: exhausted ? "error" : "warn",
      message: `Browser job ${exhausted ? "failed" : "retry"} (attempt ${job.attempts}/${job.max_attempts}): ${data.error}`.slice(0, 4000),
    });

    if (exhausted) {
      await supabase
        .from("pending_client_jobs")
        .update({ status: "failed", last_error: data.error, completed_at: now })
        .eq("id", data.jobId);
      await supabase
        .from("node_executions")
        .update({ status: "failed", error_message: data.error, finished_at: now })
        .eq("id", job.node_execution_id);
      await supabase
        .from("workflow_runs")
        .update({ status: "failed", error_message: data.error, finished_at: now })
        .eq("id", job.workflow_run_id)
        .eq("status", "running");
      return { ok: true, exhausted: true };
    }

    // Release the lease so another worker (or the same one later) can pick it up.
    await supabase
      .from("pending_client_jobs")
      .update({
        status: "pending",
        claimed_by: null,
        claimed_at: null,
        lease_until: null,
        heartbeat_at: null,
        last_error: data.error,
      })
      .eq("id", data.jobId);
    return { ok: true, exhausted: false };
  });

/** Cancel a workflow run safely. Sets cancel_requested; the engine loop checks it between nodes. */
export const cancelWorkflowRun = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ runId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const now = new Date().toISOString();

    // Mark cancellation request (visible to the engine and any in-flight loop)
    await supabase
      .from("workflow_runs")
      .update({ cancel_requested: true })
      .eq("id", data.runId);

    // Cancel any pending browser jobs for this run
    await supabase
      .from("pending_client_jobs")
      .update({ status: "cancelled", completed_at: now })
      .eq("workflow_run_id", data.runId)
      .in("status", ["pending", "claimed"]);

    // If the run is paused on a browser node, finalise it now
    await supabase
      .from("node_executions")
      .update({ status: "failed", error_message: "Cancelled by user", finished_at: now })
      .eq("workflow_run_id", data.runId)
      .in("status", ["awaiting_client", "running"]);

    await supabase
      .from("workflow_runs")
      .update({ status: "failed", error_message: "Cancelled by user", finished_at: now })
      .eq("id", data.runId)
      .in("status", ["running", "queued"]);

    await supabase.from("execution_logs").insert({
      workflow_run_id: data.runId,
      node_execution_id: data.runId, // FK is loose; logs are scoped to the run
      user_id: userId,
      level: "warn",
      message: "Run cancelled by user",
    });

    return { ok: true };
  });

/** Replay a workflow run deterministically — re-execute the same workflow version as a child run. */
export const replayWorkflowRun = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ runId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: run, error } = await supabase
      .from("workflow_runs")
      .select("id, workflow_id")
      .eq("id", data.runId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!run) throw new Error("Run not found");
    return runWorkflowEngine(supabase, userId, run.workflow_id, {
      triggerType: "replay",
      parentRunId: run.id,
    });
  });