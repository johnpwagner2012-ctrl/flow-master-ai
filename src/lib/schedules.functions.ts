import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { nextRunFrom, validateCron } from "./cron-utils";

const upsertSchema = z.object({
  workflowId: z.string().uuid(),
  cronExpression: z.string().min(1).max(120),
  timezone: z.string().min(1).max(64).default("UTC"),
  enabled: z.boolean().default(true),
});

export const upsertSchedule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => upsertSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const valid = validateCron(data.cronExpression, data.timezone);
    if (!valid.ok) throw new Error(`Invalid cron expression: ${valid.error}`);

    // Verify workflow ownership (RLS will also enforce)
    const { data: wf, error: wfErr } = await supabase
      .from("workflows").select("id").eq("id", data.workflowId).maybeSingle();
    if (wfErr) throw new Error(wfErr.message);
    if (!wf) throw new Error("Workflow not found");

    const next = data.enabled ? nextRunFrom(data.cronExpression, new Date(), data.timezone) : null;

    const { data: row, error } = await supabase
      .from("workflow_schedules")
      .upsert(
        {
          workflow_id: data.workflowId,
          user_id: userId,
          cron_expression: data.cronExpression,
          timezone: data.timezone,
          enabled: data.enabled,
          next_run_at: next ? next.toISOString() : null,
          claimed_at: null,
        },
        { onConflict: "workflow_id" },
      )
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const setScheduleEnabled = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ workflowId: z.string().uuid(), enabled: z.boolean() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: existing, error: gErr } = await supabase
      .from("workflow_schedules").select("*").eq("workflow_id", data.workflowId).maybeSingle();
    if (gErr) throw new Error(gErr.message);
    if (!existing) throw new Error("No schedule configured for this workflow");

    const next = data.enabled
      ? nextRunFrom(existing.cron_expression, new Date(), existing.timezone).toISOString()
      : null;

    const { data: row, error } = await supabase
      .from("workflow_schedules")
      .update({ enabled: data.enabled, next_run_at: next, claimed_at: null })
      .eq("id", existing.id)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });