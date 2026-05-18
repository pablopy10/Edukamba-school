import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { intlLocaleTagFromLng } from "@/lib/intlLocale";

interface ComplaintRow {
  id: string;
  subject: string;
  target_type: "STUDENT" | "TEACHER" | "STAFF";
  severity: "LOW" | "NORMAL" | "HIGH";
  status: "OPEN" | "IN_REVIEW" | "RESOLVED" | "REJECTED";
  created_at: string;
  target_student: { full_name: string | null } | null;
  target_profile: { full_name: string | null } | null;
}

const statusClass: Record<ComplaintRow["status"], string> = {
  OPEN: "bg-pastel-yellow text-pastel-yellow-foreground",
  IN_REVIEW: "bg-pastel-blue text-pastel-blue-foreground",
  RESOLVED: "bg-pastel-green text-pastel-green-foreground",
  REJECTED: "bg-muted text-muted-foreground",
};

const severityClass: Record<ComplaintRow["severity"], string> = {
  LOW: "text-muted-foreground",
  NORMAL: "text-foreground",
  HIGH: "text-destructive",
};

export const ComplaintsCard = ({ studentScopeId }: { studentScopeId?: string | null } = {}) => {
  const { t, i18n } = useTranslation("common");
  const localeTag = intlLocaleTagFromLng(i18n.language);
  const [rows, setRows] = useState<ComplaintRow[]>([]);

  useEffect(() => {
    let cancelled = false;
    let q = supabase
      .from("complaints")
      .select(
        "id, subject, target_type, severity, status, created_at, target_student:students!complaints_target_student_id_fkey(full_name), target_profile:profiles!complaints_target_profile_id_fkey(full_name)",
      )
      .order("created_at", { ascending: false })
      .limit(6);
    if (studentScopeId) {
      q = q.eq("target_type", "STUDENT").eq("target_student_id", studentScopeId);
    }
    q.then(({ data }) => {
        if (!cancelled) setRows((data ?? []) as unknown as ComplaintRow[]);
      });
    return () => {
      cancelled = true;
    };
  }, [studentScopeId]);

  const targetLabel = (type: ComplaintRow["target_type"]) =>
    ({
      STUDENT: t("dashboard.complaints.target_STUDENT"),
      TEACHER: t("dashboard.complaints.target_TEACHER"),
      STAFF: t("dashboard.complaints.target_STAFF"),
    })[type];
  const statusLabel = (status: ComplaintRow["status"]) =>
    ({
      OPEN: t("dashboard.complaints.status_OPEN"),
      IN_REVIEW: t("dashboard.complaints.status_IN_REVIEW"),
      RESOLVED: t("dashboard.complaints.status_RESOLVED"),
      REJECTED: t("dashboard.complaints.status_REJECTED"),
    })[status];

  return (
    <div className="flex h-full flex-col gap-4 rounded-2xl bg-card p-6 shadow-card">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-pastel-pink text-pastel-pink-foreground">
            <AlertTriangle className="h-5 w-5" strokeWidth={1.75} />
          </div>
          <h3 className="text-lg font-bold text-foreground">{t("dashboard.complaints.title")}</h3>
        </div>
        <button type="button" className="text-xs font-semibold text-primary hover:underline">{t("dashboard.complaints.view_all")}</button>
      </div>

      {rows.length === 0 ? (
        <p className="rounded-xl bg-muted/50 p-4 text-center text-xs text-muted-foreground">
          {t("dashboard.complaints.empty")}
        </p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border">
          <table className="w-full text-left text-xs">
            <thead className="bg-muted/50 text-[11px] uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">{t("dashboard.complaints.col_subject")}</th>
                <th className="px-3 py-2 font-medium">{t("dashboard.complaints.col_target")}</th>
                <th className="px-3 py-2 font-medium">{t("dashboard.complaints.col_status")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const targetName =
                  r.target_type === "STUDENT"
                    ? r.target_student?.full_name
                    : r.target_profile?.full_name;
                return (
                  <tr key={r.id} className="border-t border-border">
                    <td className="px-3 py-2">
                      <p className={cn("truncate text-sm font-semibold", severityClass[r.severity])}>
                        {r.subject}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        {new Date(r.created_at).toLocaleDateString(localeTag)}
                      </p>
                    </td>
                    <td className="px-3 py-2">
                      <p className="truncate text-sm text-foreground">{targetName ?? "—"}</p>
                      <p className="text-[11px] text-muted-foreground">{targetLabel(r.target_type)}</p>
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={cn(
                          "inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold",
                          statusClass[r.status],
                        )}
                      >
                        {statusLabel(r.status)}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
