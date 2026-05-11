import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { runWorkflowEngine } from "@/lib/execution.server";
import { nextRunFrom } from "@/lib/cron-utils";

type ClaimedRow = {
  id: string;
  workflow_id: string;
  user_id: string;
  cron_expression: string;
  timezone: string;
  next_run_at: string | null;
};

export const Route = createFileRoute("/api/public/hooks/scheduler-tick")({
  server: {
    handlers: {
      POST: async () => {
        const startedAt = Date.now();
        const { data: claims, error } = await supabaseAdmin.rpc("claim_due_schedules", {
          _limit: 50,
          _lock_seconds: 300,
        });
        if (error) {
          return new Response(JSON.stringify({ error: error.message }), {
            status: 500, headers: { "Content-Type": "application/json" },
          });
        }
        const rows = (claims ?? []) as ClaimedRow[];

        const results = await Promise.allSettled(
          rows.map(async (r) => {
            try {
              const { runId } = await runWorkflowEngine(supabaseAdmin, r.user_id, r.workflow_id);
              const next = nextRunFrom(r.cron_expression, new Date(), r.timezone);
              await supabaseAdmin.rpc("mark_schedule_run", {
                _id: r.id,
                _next_run_at: next.toISOString(),
                _run_id: runId,
              });
              return { id: r.id, runId, ok: true };
            } catch (e) {
              // Still advance next_run_at so a permanently broken schedule does not hot-loop
              try {
                const next = nextRunFrom(r.cron_expression, new Date(), r.timezone);
                await supabaseAdmin.rpc("mark_schedule_run", {
                  _id: r.id,
                  _next_run_at: next.toISOString(),
                  _run_id: null as unknown as string,
                });
              } catch {
                // ignore
              }
              return { id: r.id, ok: false, error: (e as Error).message };
            }
          }),
        );

        return new Response(
          JSON.stringify({
            claimed: rows.length,
            results: results.map((r) => (r.status === "fulfilled" ? r.value : { ok: false, error: String(r.reason) })),
            duration_ms: Date.now() - startedAt,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      },
    },
  },
});