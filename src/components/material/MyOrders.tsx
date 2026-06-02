import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronDown, ChevronUp, AlertCircle, PackageSearch } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import type { MaterialOrder, OrderStatus } from "@/components/material/MaterialOrders";

const formatPrice = (v: number) =>
  v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

interface Props {
  orders: MaterialOrder[];
  loadError: boolean;
  onRetry: () => void;
}

export const MyOrders = ({ orders, loadError, onRetry }: Props) => {
  const { t, i18n } = useTranslation("pages", { keyPrefix: "material" });
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

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

  if (loadError) {
    return (
      <div className="flex flex-col items-center gap-4 rounded-2xl bg-card p-10 shadow-card text-center">
        <AlertCircle className="h-8 w-8 text-destructive" />
        <p className="text-sm text-muted-foreground">{t("my_orders_error")}</p>
        <Button variant="outline" onClick={onRetry}>{t("shop_retry")}</Button>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl bg-card shadow-card">
      <div className="flex items-center justify-between border-b border-border px-6 py-4">
        <h2 className="text-base font-bold text-foreground">{t("my_orders_title")}</h2>
        <span className="text-xs text-muted-foreground">{t("orders_count", { count: orders.length })}</span>
      </div>

      {orders.length === 0 ? (
        <div className="flex flex-col items-center gap-3 p-10 text-center">
          <PackageSearch className="h-10 w-10 text-muted-foreground/40" strokeWidth={1.5} />
          <p className="text-sm text-muted-foreground">{t("my_orders_empty")}</p>
        </div>
      ) : (
        <div className="divide-y divide-border">
          {orders.map((order) => {
            const expanded = expandedIds.has(order.id);
            return (
              <div key={order.id} className="px-6 py-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex flex-col gap-1">
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                      <span className="text-muted-foreground">{formatDate(order.created_at)}</span>
                      <span className="font-bold text-foreground">{formatPrice(order.total_amount)}</span>
                      <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-semibold", statusColor(order.status))}>
                        {statusLabel(order.status)}
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={() => toggleExpand(order.id)}
                    className="inline-flex h-8 items-center gap-1 self-start rounded-full border border-border px-3 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground sm:self-auto"
                  >
                    {expanded ? (
                      <><ChevronUp className="h-3.5 w-3.5" /> {t("order_collapse")}</>
                    ) : (
                      <><ChevronDown className="h-3.5 w-3.5" /> {t("order_expand")}</>
                    )}
                  </button>
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
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
