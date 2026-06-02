import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronDown, ChevronUp, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

export type OrderStatus = "pending" | "processing" | "completed" | "cancelled";

export type MaterialOrderItem = {
  id: string;
  order_id: string;
  material_id: string;
  quantity: number;
  unit_price: number;
  material_name?: string;
};

export type MaterialOrder = {
  id: string;
  school_id: string;
  buyer_profile_id: string;
  buyer_role: "PARENT" | "STUDENT";
  status: OrderStatus;
  total_amount: number;
  created_at: string;
  updated_at: string | null;
  cancellation_reason: string | null;
  buyer_name?: string;
  items?: MaterialOrderItem[];
};

const VALID_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  pending: ["processing", "cancelled"],
  processing: ["completed", "cancelled"],
  completed: [],
  cancelled: [],
};

const formatPrice = (v: number) =>
  v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

interface Props {
  orders: MaterialOrder[];
  loadError: boolean;
  onRetry: () => void;
  onOrderUpdated: () => void;
}

export const MaterialOrders = ({ orders, loadError, onRetry, onOrderUpdated }: Props) => {
  const { t, i18n } = useTranslation("pages", { keyPrefix: "material" });
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [cancelDialog, setCancelDialog] = useState<MaterialOrder | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [saving, setSaving] = useState(false);

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString(i18n.language, {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });

  const statusLabel = (s: OrderStatus) => {
    const map: Record<OrderStatus, string> = {
      pending: t("order_status_pending"),
      processing: t("order_status_processing"),
      completed: t("order_status_completed"),
      cancelled: t("order_status_cancelled"),
    };
    return map[s] ?? s;
  };

  const statusColor = (s: OrderStatus) => {
    const map: Record<OrderStatus, string> = {
      pending: "bg-pastel-yellow text-pastel-yellow-foreground",
      processing: "bg-pastel-blue text-pastel-blue-foreground",
      completed: "bg-pastel-green text-pastel-green-foreground",
      cancelled: "bg-pastel-pink text-pastel-pink-foreground",
    };
    return map[s] ?? "bg-muted text-foreground";
  };

  const changeStatus = async (order: MaterialOrder, newStatus: OrderStatus) => {
    if (newStatus === "cancelled") {
      setCancelDialog(order);
      return;
    }
    const allowed = VALID_TRANSITIONS[order.status];
    if (!allowed.includes(newStatus)) {
      toast({
        title: t("invalid_transition", { allowed: allowed.map(statusLabel).join(", ") }),
        variant: "destructive",
      });
      return;
    }
    setSaving(true);
    const { error } = await supabase
      .from("material_orders")
      .update({ status: newStatus, updated_at: new Date().toISOString() })
      .eq("id", order.id);
    setSaving(false);
    if (error) {
      toast({ title: t("status_update_error"), variant: "destructive" });
      return;
    }
    onOrderUpdated();
  };

  const confirmCancel = async () => {
    if (!cancelDialog || !cancelReason.trim()) return;
    setSaving(true);
    const { error } = await supabase
      .from("material_orders")
      .update({
        status: "cancelled",
        cancellation_reason: cancelReason.trim(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", cancelDialog.id);
    setSaving(false);
    if (error) {
      toast({ title: t("status_update_error"), variant: "destructive" });
      return;
    }
    setCancelDialog(null);
    setCancelReason("");
    onOrderUpdated();
  };

  if (loadError) {
    return (
      <div className="flex flex-col items-center gap-4 rounded-2xl bg-card p-10 shadow-card text-center">
        <AlertCircle className="h-8 w-8 text-destructive" />
        <p className="text-sm text-muted-foreground">{t("orders_error")}</p>
        <Button variant="outline" onClick={onRetry}>{t("shop_retry")}</Button>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl bg-card shadow-card">
      <div className="flex items-center justify-between border-b border-border px-6 py-4">
        <h2 className="text-base font-bold text-foreground">{t("orders_title")}</h2>
        <span className="text-xs text-muted-foreground">{t("orders_count", { count: orders.length })}</span>
      </div>

      {orders.length === 0 ? (
        <div className="p-10 text-center text-sm text-muted-foreground">{t("orders_empty")}</div>
      ) : (
        <div className="divide-y divide-border">
          {orders.map((order) => {
            const expanded = expandedIds.has(order.id);
            const allowedTransitions = VALID_TRANSITIONS[order.status];
            return (
              <div key={order.id} className="px-6 py-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex flex-col gap-1">
                    <p className="font-semibold text-foreground">{order.buyer_name ?? order.buyer_profile_id}</p>
                    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <span>{formatDate(order.created_at)}</span>
                      <span>·</span>
                      <span className="font-semibold text-foreground">{formatPrice(order.total_amount)}</span>
                      <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-semibold", statusColor(order.status))}>
                        {statusLabel(order.status)}
                      </span>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {allowedTransitions.length > 0 && (
                      <Select
                        value=""
                        onValueChange={(v) => changeStatus(order, v as OrderStatus)}
                        disabled={saving}
                      >
                        <SelectTrigger className="h-8 w-44 rounded-full text-xs">
                          <SelectValue placeholder={t("order_change_status")} />
                        </SelectTrigger>
                        <SelectContent>
                          {allowedTransitions.map((s) => (
                            <SelectItem key={s} value={s}>{statusLabel(s)}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                    <button
                      onClick={() => toggleExpand(order.id)}
                      className="inline-flex h-8 items-center gap-1 rounded-full border border-border px-3 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
                    >
                      {expanded ? (
                        <><ChevronUp className="h-3.5 w-3.5" /> {t("order_collapse")}</>
                      ) : (
                        <><ChevronDown className="h-3.5 w-3.5" /> {t("order_expand")}</>
                      )}
                    </button>
                  </div>
                </div>

                {expanded && order.items && (
                  <div className="mt-3 overflow-hidden rounded-xl border border-border">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border bg-muted/30 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                          <th className="px-4 py-2 text-left">{t("col_material")}</th>
                          <th className="px-4 py-2 text-right">{t("col_unit_price")}</th>
                          <th className="px-4 py-2 text-right">{t("col_quantity")}</th>
                          <th className="px-4 py-2 text-right">{t("col_subtotal")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {order.items.map((item) => (
                          <tr key={item.id} className="border-b border-border/60 last:border-0">
                            <td className="px-4 py-2 text-foreground">{item.material_name ?? item.material_id}</td>
                            <td className="px-4 py-2 text-right text-muted-foreground">{formatPrice(item.unit_price)}</td>
                            <td className="px-4 py-2 text-right text-foreground">{item.quantity}</td>
                            <td className="px-4 py-2 text-right font-semibold text-foreground">
                              {formatPrice(item.unit_price * item.quantity)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {order.cancellation_reason && (
                      <div className="border-t border-border px-4 py-2 text-xs text-muted-foreground">
                        <span className="font-semibold">{t("cancel_reason_label").replace(" *", "")}:</span>{" "}
                        {order.cancellation_reason}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Cancel confirmation dialog */}
      <Dialog open={!!cancelDialog} onOpenChange={(o) => { if (!o) { setCancelDialog(null); setCancelReason(""); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t("cancel_dialog_title")}</DialogTitle>
            <DialogDescription>{t("cancel_dialog_desc")}</DialogDescription>
          </DialogHeader>
          <div className="py-2">
            <Label>{t("cancel_reason_label")}</Label>
            <Textarea
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              placeholder={t("cancel_reason_placeholder")}
              rows={3}
              className="mt-1"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setCancelDialog(null); setCancelReason(""); }}>
              {t("form.cancel")}
            </Button>
            <Button
              variant="destructive"
              onClick={confirmCancel}
              disabled={saving || !cancelReason.trim()}
            >
              {saving ? "..." : t("cancel_confirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
