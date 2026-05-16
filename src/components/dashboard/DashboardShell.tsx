import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { NativeOutletAnimator } from "@/components/dashboard/NativeOutletAnimator";
import { SuperTenantRedirect } from "@/components/SuperTenantRedirect";
import { SupportSessionBanner } from "@/components/SupportSessionBanner";

export function DashboardShell() {
  return (
    <DashboardLayout>
      <SuperTenantRedirect />
      <SupportSessionBanner />
      <NativeOutletAnimator />
    </DashboardLayout>
  );
}
