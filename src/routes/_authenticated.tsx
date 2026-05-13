import { createFileRoute, Outlet, Navigate } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth";
import { AppSidebar } from "@/components/app-sidebar";
import { BrowserExecutor } from "@/lib/browser-executor";
import { Loader2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated")({ component: AuthedLayout });

function AuthedLayout() {
  const { loading, session } = useAuth();
  if (loading) {
    return <div className="grid min-h-screen place-items-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }
  if (!session) return <Navigate to="/login" />;
  return (
    <div className="flex min-h-screen w-full">
      <AppSidebar />
      <main className="flex min-h-screen flex-1 flex-col overflow-hidden">
        <Outlet />
      </main>
      <BrowserExecutor />
    </div>
  );
}
