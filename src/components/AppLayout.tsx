import { Outlet, Navigate } from "react-router-dom";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "./AppSidebar";
import { useAuth } from "@/hooks/useAuth";
import { EncryptionGate } from "./EncryptionGate";

export default function AppLayout() {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="min-h-screen grid place-items-center bg-background">
        <div className="text-sm text-muted-foreground">Loading…</div>
      </div>
    );
  }
  if (!user) return <Navigate to="/auth" replace />;

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-background">
        <AppSidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <header className="h-12 flex items-center border-b border-border/60 px-3 sticky top-0 z-10 bg-background/80 backdrop-blur">
            <SidebarTrigger />
          </header>
          <main className="flex-1 overflow-auto">
            <EncryptionGate>
              <Outlet />
            </EncryptionGate>
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
