import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { NativeOutletAnimator } from "@/components/dashboard/NativeOutletAnimator";

export function DashboardShell() {
  return (
    <DashboardLayout>
      <NativeOutletAnimator />
    </DashboardLayout>
  );
}
