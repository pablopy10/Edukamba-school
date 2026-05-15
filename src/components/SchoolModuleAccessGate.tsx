import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useUserRole } from "@/hooks/useUserRole";
import { useSchoolPermissionMatrix } from "@/hooks/useSchoolPermissionMatrix";
import { pathToPermissionModule } from "@/lib/schoolPermissionPathMap";

/**
 * Bloqueia páginas por módulo (Definições › Permissões) em conjunto com a Sidebar.
 */
export function SchoolModuleAccessGate({ children }: { children: ReactNode }) {
  const location = useLocation();
  const { role, loading: roleLoading } = useUserRole();
  const { canReadModule, loading: permLoading } = useSchoolPermissionMatrix();

  const mod = pathToPermissionModule(location.pathname);

  if (roleLoading || (mod != null && permLoading)) {
    return (
      <div className="flex min-h-[30vh] items-center justify-center py-12">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (role === "ADMIN" || role === "SUPER_ADMIN") return <>{children}</>;

  if (mod != null && !canReadModule(mod)) {
    return <Navigate to="/dashboard" replace state={{ fromDenied: location.pathname }} />;
  }

  return <>{children}</>;
}
