import { Link, useRouterState } from "@tanstack/react-router";
import { LayoutDashboard, Workflow, Settings, Sparkles, LogOut, Library, BookText } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";

const items = [
  { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard },
  { title: "Workflows", url: "/workflows", icon: Workflow },
  { title: "Assets", url: "/assets", icon: Library },
  { title: "Templates", url: "/templates", icon: BookText },
  { title: "Settings", url: "/settings", icon: Settings },
];

export function AppSidebar() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { user, signOut } = useAuth();

  return (
    <aside className="hidden md:flex h-screen w-60 shrink-0 flex-col border-r border-border bg-sidebar/60 backdrop-blur-xl">
      <div className="flex items-center gap-2 px-5 py-5">
        <div className="grid h-8 w-8 place-items-center rounded-lg bg-[image:var(--gradient-primary)] text-primary-foreground">
          <Sparkles className="h-4 w-4" />
        </div>
        <div className="flex flex-col leading-tight">
          <span className="text-sm font-semibold tracking-tight">Flowforge</span>
          <span className="text-[10px] uppercase tracking-widest text-muted-foreground">AI automation</span>
        </div>
      </div>
      <nav className="flex-1 px-3 py-2 space-y-1">
        {items.map((it) => {
          const active = pathname === it.url || pathname.startsWith(it.url + "/");
          return (
            <Link
              key={it.url}
              to={it.url}
              className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
                active
                  ? "bg-sidebar-accent text-sidebar-accent-foreground glow-ring"
                  : "text-sidebar-foreground/80 hover:text-sidebar-foreground hover:bg-sidebar-accent/60"
              }`}
            >
              <it.icon className="h-4 w-4" />
              <span>{it.title}</span>
            </Link>
          );
        })}
      </nav>
      <div className="border-t border-sidebar-border p-3">
        <div className="flex items-center justify-between gap-2 rounded-lg px-2 py-2">
          <div className="min-w-0 flex-1">
            <div className="truncate text-xs font-medium">{user?.email ?? "Signed in"}</div>
            <div className="text-[10px] text-muted-foreground">Workspace</div>
          </div>
          <Button variant="ghost" size="icon" onClick={() => signOut()} title="Sign out">
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </aside>
  );
}
