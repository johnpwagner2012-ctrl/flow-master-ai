import { supabase } from "@/integrations/supabase/client";

export type ScheduleRow = {
  id: string;
  workflow_id: string;
  user_id: string;
  cron_expression: string;
  timezone: string;
  enabled: boolean;
  last_run_at: string | null;
  next_run_at: string | null;
  last_run_id: string | null;
  created_at: string;
  updated_at: string;
};

export async function getScheduleForWorkflow(workflowId: string): Promise<ScheduleRow | null> {
  const { data, error } = await supabase
    .from("workflow_schedules")
    .select("*")
    .eq("workflow_id", workflowId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as ScheduleRow | null) ?? null;
}

export async function listSchedulesWithWorkflows(): Promise<
  Array<ScheduleRow & { workflow: { id: string; name: string; is_active: boolean } | null }>
> {
  const { data, error } = await supabase
    .from("workflow_schedules")
    .select("*, workflow:workflows(id,name,is_active)")
    .order("next_run_at", { ascending: true, nullsFirst: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as never;
}

export async function deleteSchedule(id: string): Promise<void> {
  const { error } = await supabase.from("workflow_schedules").delete().eq("id", id);
  if (error) throw new Error(error.message);
}