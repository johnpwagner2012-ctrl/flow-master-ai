import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, CalendarClock, Power, PowerOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { getScheduleForWorkflow, type ScheduleRow } from "@/lib/schedules-api";
import { upsertSchedule, setScheduleEnabled } from "@/lib/schedules.functions";
import { CRON_PRESETS, detectPreset, validateCron, describeCron, nextRunFrom, type CronPreset } from "@/lib/cron-utils";

function formatRelative(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  const diff = d.getTime() - Date.now();
  const abs = Math.abs(diff);
  const mins = Math.round(abs / 60000);
  if (mins < 1) return diff >= 0 ? "in <1m" : "just now";
  if (mins < 60) return diff >= 0 ? `in ${mins}m` : `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return diff >= 0 ? `in ${hrs}h` : `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  return diff >= 0 ? `in ${days}d` : `${days}d ago`;
}

export function SchedulePanel({ workflowId }: { workflowId: string }) {
  const upsertFn = useServerFn(upsertSchedule);
  const toggleFn = useServerFn(setScheduleEnabled);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [schedule, setSchedule] = useState<ScheduleRow | null>(null);
  const [preset, setPreset] = useState<CronPreset>("daily");
  const [expression, setExpression] = useState<string>(CRON_PRESETS.daily);
  const [enabled, setEnabled] = useState<boolean>(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const s = await getScheduleForWorkflow(workflowId);
        if (cancelled) return;
        if (s) {
          setSchedule(s);
          setExpression(s.cron_expression);
          setPreset(detectPreset(s.cron_expression));
          setEnabled(s.enabled);
        }
      } catch (e) { toast.error((e as Error).message); }
      finally { if (!cancelled) setLoading(false); }
    })();

    const channel = supabase
      .channel(`schedule-${workflowId}`)
      .on("postgres_changes",
        { event: "*", schema: "public", table: "workflow_schedules", filter: `workflow_id=eq.${workflowId}` },
        (payload) => {
          const row = (payload.new ?? payload.old) as ScheduleRow | null;
          if (row && payload.eventType !== "DELETE") setSchedule(row);
        }).subscribe();

    return () => { cancelled = true; supabase.removeChannel(channel); };
  }, [workflowId]);

  const cronError = useMemo(() => {
    const v = validateCron(expression);
    return v.ok ? null : v.error;
  }, [expression]);

  const previewNext = useMemo(() => {
    if (cronError) return null;
    try { return nextRunFrom(expression); } catch { return null; }
  }, [expression, cronError]);

  const onPresetChange = (val: string) => {
    setPreset(val as CronPreset);
    if (val !== "custom") setExpression(CRON_PRESETS[val as Exclude<CronPreset, "custom">]);
  };

  const onSave = async () => {
    if (cronError) { toast.error(`Invalid cron: ${cronError}`); return; }
    setSaving(true);
    try {
      const row = await upsertFn({ data: { workflowId, cronExpression: expression, timezone: "UTC", enabled } });
      setSchedule(row as ScheduleRow);
      toast.success("Schedule saved");
    } catch (e) { toast.error((e as Error).message); }
    finally { setSaving(false); }
  };

  const onToggle = async (next: boolean) => {
    setEnabled(next);
    if (!schedule) return; // not yet saved
    try {
      const row = await toggleFn({ data: { workflowId, enabled: next } });
      setSchedule(row as ScheduleRow);
    } catch (e) {
      setEnabled(!next);
      toast.error((e as Error).message);
    }
  };

  return (
    <div className="glass rounded-xl">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-2 text-sm font-medium">
          <CalendarClock className="h-3.5 w-3.5 text-muted-foreground" /> Schedule
        </div>
        <div className="flex items-center gap-2 text-xs">
          {schedule?.enabled ? <Power className="h-3 w-3 text-success" /> : <PowerOff className="h-3 w-3 text-muted-foreground" />}
          <Switch checked={enabled} onCheckedChange={onToggle} disabled={loading} />
        </div>
      </div>

      <div className="space-y-3 px-4 py-3 text-xs">
        <div className="space-y-1.5">
          <label className="text-[10px] uppercase tracking-widest text-muted-foreground">Frequency</label>
          <Select value={preset} onValueChange={onPresetChange} disabled={loading}>
            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="hourly">Hourly</SelectItem>
              <SelectItem value="daily">Daily (09:00 UTC)</SelectItem>
              <SelectItem value="weekly">Weekly (Mon 09:00 UTC)</SelectItem>
              <SelectItem value="custom">Custom cron</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <label className="text-[10px] uppercase tracking-widest text-muted-foreground">Cron expression</label>
          <Input
            value={expression}
            onChange={(e) => { setExpression(e.target.value); setPreset(detectPreset(e.target.value)); }}
            className="h-8 font-mono text-xs"
            placeholder="0 9 * * *"
            disabled={loading}
          />
          {cronError && <div className="text-[10px] text-destructive">{cronError}</div>}
          {!cronError && <div className="text-[10px] text-muted-foreground">{describeCron(expression)}</div>}
        </div>

        <div className="grid grid-cols-2 gap-2 rounded-md border border-border bg-card/30 p-2">
          <div>
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Next run</div>
            <div className="mt-0.5 font-mono">
              {schedule?.enabled
                ? (schedule.next_run_at ? formatRelative(schedule.next_run_at) : "—")
                : (previewNext ? `preview ${formatRelative(previewNext.toISOString())}` : "disabled")}
            </div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Last run</div>
            <div className="mt-0.5 font-mono">{schedule?.last_run_at ? formatRelative(schedule.last_run_at) : "—"}</div>
          </div>
        </div>

        <Button size="sm" className="w-full" onClick={onSave} disabled={saving || !!cronError || loading}>
          {saving && <Loader2 className="mr-2 h-3 w-3 animate-spin" />}
          {schedule ? "Update schedule" : "Save schedule"}
        </Button>
      </div>
    </div>
  );
}