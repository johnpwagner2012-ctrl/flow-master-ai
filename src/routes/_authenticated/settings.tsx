import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/settings")({ component: SettingsPage });

function SettingsPage() {
  const { user } = useAuth();
  const [displayName, setDisplayName] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user) return;
    supabase.from("profiles").select("display_name").eq("id", user.id).maybeSingle().then(({ data }) => {
      setDisplayName(data?.display_name ?? "");
      setLoading(false);
    });
  }, [user]);

  const onSave = async () => {
    if (!user) return;
    setSaving(true);
    const { error } = await supabase.from("profiles").update({ display_name: displayName }).eq("id", user.id);
    setSaving(false);
    if (error) toast.error(error.message); else toast.success("Profile saved");
  };

  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b border-border px-6 py-4">
        <h1 className="text-xl font-semibold tracking-tight">Settings</h1>
        <p className="text-xs text-muted-foreground">Manage your profile</p>
      </header>
      <section className="max-w-xl p-6">
        <div className="glass space-y-5 rounded-xl p-6">
          <div className="space-y-1.5">
            <Label>Email</Label>
            <Input value={user?.email ?? ""} readOnly disabled />
          </div>
          <div className="space-y-1.5">
            <Label>Display name</Label>
            {loading ? <div className="h-9 animate-pulse rounded bg-muted" />
              : <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} />}
          </div>
          <Button onClick={onSave} disabled={saving || loading} className="bg-[image:var(--gradient-primary)] text-primary-foreground hover:opacity-90">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save changes"}
          </Button>
        </div>
      </section>
    </div>
  );
}
