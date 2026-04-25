import { ReactNode } from "react";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";

export const DashboardLayout = ({ children }: { children: ReactNode }) => {
  return (
    <div className="flex min-h-screen w-full bg-background font-sans text-foreground">
      <Sidebar />
      <main className="flex-1 overflow-x-hidden">
        <div className="mx-auto flex max-w-[1600px] flex-col gap-6 p-5 lg:p-7">
          <Topbar />
          {children}
        </div>
      </main>
    </div>
  );
};