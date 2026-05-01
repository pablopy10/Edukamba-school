import { ReactNode, useState } from "react";
import { Sidebar, SidebarMobileDrawer } from "./Sidebar";
import { Topbar } from "./Topbar";
import { NativeMobileSyncBar } from "./NativeMobileSyncBar";

import { MobileBottomNav } from "./MobileBottomNav";

export const DashboardLayout = ({ children }: { children: ReactNode }) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <div className="flex min-h-screen w-full bg-background font-sans text-foreground">
      <Sidebar />
      <SidebarMobileDrawer open={mobileMenuOpen} onOpenChange={setMobileMenuOpen} />
      <main className="flex-1 overflow-x-hidden pb-[calc(5.25rem+env(safe-area-inset-bottom,0px))] lg:pb-0">
        <div className="mx-auto flex max-w-[1600px] flex-col gap-6 p-5 lg:p-7">
          <Topbar onOpenMobileMenu={() => setMobileMenuOpen(true)} />
          <NativeMobileSyncBar />
          {children}
        </div>
      </main>
      <MobileBottomNav />
    </div>
  );
};