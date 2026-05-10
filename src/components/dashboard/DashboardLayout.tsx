import { ReactNode, useState } from "react";
import { TeacherSessionPrefetch } from "@/components/TeacherSessionPrefetch";
import { OfflineSyncStatusBar } from "./OfflineSyncStatusBar";
import { Sidebar, SidebarMobileDrawer } from "./Sidebar";
import { Topbar } from "./Topbar";
import { MobileBottomNav } from "./MobileBottomNav";
import { PullToRefresh } from "@/components/PullToRefresh";

export const DashboardLayout = ({ children }: { children: ReactNode }) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <div className="flex min-h-screen w-full bg-background font-sans text-foreground">
      <PullToRefresh />
      <TeacherSessionPrefetch />
      <Sidebar />
      <SidebarMobileDrawer open={mobileMenuOpen} onOpenChange={setMobileMenuOpen} />
      <main className="flex-1 overflow-x-hidden pb-[calc(5.25rem+var(--sab-r))] [padding-top:var(--sat-r)] lg:pb-0">
        <div className="mx-auto flex max-w-[1600px] flex-col gap-6 p-5 lg:p-7">
          <Topbar onOpenMobileMenu={() => setMobileMenuOpen(true)} />
          <OfflineSyncStatusBar />
          {children}
        </div>
      </main>
      <MobileBottomNav />
    </div>
  );
};