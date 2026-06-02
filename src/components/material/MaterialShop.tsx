import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ShoppingCart, Search, Plus, Minus, Trash2, AlertCircle, BookOpen, Beaker, Palette, Dumbbell, Laptop, Package, ShoppingBag } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import type { MaterialRow } from "@/components/material/MaterialFormDialog";

type CartItem = {
  material: MaterialRow;
  quantity: number;
};

const categoryMeta: Record<string, { color: string; icon: typeof BookOpen }> = {
  papelaria: { color: "bg-pastel-blue text-pastel-blue-foreground", icon: BookOpen },
  laboratorio: { color: "bg-pastel-green text-pastel-green-foreground", icon: Beaker },
  artes: { color: "bg-pastel-pink text-pastel-pink-foreground", icon: Palette },
  desporto: { color: "bg-pastel-yellow text-pastel-yellow-foreground", icon: Dumbbell },
  tecnologia: { color: "bg-pastel-lilac text-pastel-lilac-foreground", icon: Laptop },
};
const catFallbackMeta = { color: "bg-muted text-foreground", icon: Package };
const categoryVisual = (c: string) => categoryMeta[c] ?? catFallbackMeta;

const formatPrice = (v: number) =>
  v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

interface Props {
  items: MaterialRow[];
  schoolId: string | null;
  buyerProfileId: string | null;
  buyerRole: "PARENT" | "STUDENT";
  native: boolean;
  loadError: boolean;
  onRetry: () => void;
  onOrderPlaced: () => void;
}

export const MaterialShop = ({
  items,
  schoolId,
  buyerProfileId,
  buyerRole,
  native,
  loadError,
  onRetry,
  onOrderPlaced,
}: Props) => {
  const { t } = useTranslation("pages", { keyPrefix: "material" });
  const { t: tCat } = useTranslation("pages", { keyPrefix: "material" });
  const categoryLabel = (key: string) =>
    tCat(`categories.${key}`, { defaultValue: tCat("categories.other") });

  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [showCart, setShowCart] = useState(false);
  const [placing, setPlacing] = useState(false);

  const saleItems = items.filter((m) => m.for_sale && m.sale_price != null);

  const filteredItems = saleItems.filter((m) => {
    if (categoryFilter !== "all" && m.category !== categoryFilter) return false;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      if (!m.name.toLowerCase().includes(q) && !(m.description ?? "").toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const cartTotal = cart.reduce((acc, item) => acc + (item.material.sale_price ?? 0) * item.quantity, 0);
  const cartCount = cart.reduce((acc, item) => acc + item.quantity, 0);

  const addToCart = (material: MaterialRow, qty: number) => {
    if (qty < 1 || qty > 999) return;
    setCart((prev) => {
      const existing = prev.find((i) => i.material.id === material.id);
      if (existing) {
        const newQty = Math.min(existing.quantity + qty, 999);
        return prev.map((i) => i.material.id === material.id ? { ...i, quantity: newQty } : i);
      }
      return [...prev, { material, quantity: qty }];
    });
  };

  const updateCartQty = (materialId: string, delta: number) => {
    setCart((prev) => {
      const updated = prev.map((i) => {
        if (i.material.id !== materialId) return i;
        const newQty = Math.max(1, Math.min(999, i.quantity + delta));
        return { ...i, quantity: newQty };
      });
      return updated;
    });
  };

  const removeFromCart = (materialId: string) => {
    setCart((prev) => prev.filter((i) => i.material.id !== materialId));
  };

  const placeOrder = async () => {
    if (cart.length === 0) {
      toast({ title: t("order_empty_error"), variant: "destructive" });
      return;
    }
    if (!schoolId || !buyerProfileId) return;

    setPlacing(true);
    const totalAmount = cart.reduce(
      (acc, item) => acc + (item.material.sale_price ?? 0) * item.quantity,
      0,
    );

    const { data: orderData, error: orderError } = await supabase
      .from("material_orders")
      .insert({
        school_id: schoolId,
        buyer_profile_id: buyerProfileId,
        buyer_role: buyerRole,
        status: "pending",
        total_amount: totalAmount,
      })
      .select("id")
      .single();

    if (orderError || !orderData) {
      setPlacing(false);
      toast({ title: t("order_error"), variant: "destructive" });
      return;
    }

    const items = cart.map((i) => ({
      order_id: orderData.id,
      material_id: i.material.id,
      quantity: i.quantity,
      unit_price: i.material.sale_price ?? 0,
    }));

    const { error: itemsError } = await supabase.from("material_order_items").insert(items);

    if (itemsError) {
      // Rollback the order
      await supabase.from("material_orders").delete().eq("id", orderData.id);
      setPlacing(false);
      toast({ title: t("order_error"), variant: "destructive" });
      return;
    }

    setPlacing(false);
    setCart([]);
    setShowCart(false);
    toast({
      title: t("order_success", { total: formatPrice(totalAmount) }),
    });
    onOrderPlaced();
  };

  if (loadError) {
    return (
      <div className="flex flex-col items-center gap-4 rounded-2xl bg-card p-10 shadow-card text-center">
        <AlertCircle className="h-8 w-8 text-destructive" />
        <p className="text-sm text-muted-foreground">{t("shop_error")}</p>
        <Button variant="outline" onClick={onRetry}>{t("shop_retry")}</Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Header with search, filter and cart button */}
      <div className="flex flex-col gap-3 rounded-2xl bg-card p-4 shadow-card">
        <div className={cn("flex flex-col gap-3", !native && "sm:flex-row sm:items-center")}>
          <div className="relative w-full sm:max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" strokeWidth={1.75} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("search_stock")}
              className="h-10 w-full rounded-full border border-border bg-background pl-10 pr-4 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-pastel-blue/40"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="h-10 w-44 rounded-full"><SelectValue placeholder={t("filter_category")} /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("all_categories")}</SelectItem>
                {Object.keys(categoryMeta).map((c) => <SelectItem key={c} value={c}>{categoryLabel(c)}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="ml-auto">
            <button
              onClick={() => setShowCart(true)}
              className="relative flex h-10 items-center gap-2 rounded-full bg-pastel-blue px-4 text-sm font-semibold text-pastel-blue-foreground shadow-soft hover:opacity-90"
            >
              <ShoppingCart className="h-4 w-4" strokeWidth={2} />
              {t("cart_title")}
              {cartCount > 0 && (
                <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-pastel-pink text-[10px] font-bold text-pastel-pink-foreground">
                  {cartCount > 99 ? "99+" : cartCount}
                </span>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Items list */}
      <div className="overflow-hidden rounded-2xl bg-card shadow-card">
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <h2 className="text-base font-bold text-foreground">{t("shop_title")}</h2>
          <span className="text-xs text-muted-foreground">{t("shop_count", { count: filteredItems.length })}</span>
        </div>

        {saleItems.length === 0 ? (
          <div className="flex flex-col items-center gap-3 p-10 text-center">
            <ShoppingBag className="h-10 w-10 text-muted-foreground/40" strokeWidth={1.5} />
            <p className="text-sm text-muted-foreground">{t("shop_empty")}</p>
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="p-10 text-center text-sm text-muted-foreground">{t("stock_empty")}</div>
        ) : native ? (
          <div className="flex flex-col gap-3 p-4">
            {filteredItems.map((m) => (
              <ShopItemCard key={m.id} material={m} onAddToCart={addToCart} t={t} categoryLabel={categoryLabel} />
            ))}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[700px]">
              <thead>
                <tr className="border-b border-border bg-muted/30 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  <th className="px-6 py-3">{t("col_material")}</th>
                  <th className="px-6 py-3">{t("col_category")}</th>
                  <th className="px-6 py-3 text-right">{t("col_sale_price")}</th>
                  <th className="px-6 py-3 text-right">{t("col_actions")}</th>
                </tr>
              </thead>
              <tbody>
                {filteredItems.map((m) => (
                  <ShopItemRow key={m.id} material={m} onAddToCart={addToCart} t={t} categoryLabel={categoryLabel} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Cart dialog */}
      <Dialog open={showCart} onOpenChange={setShowCart}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShoppingCart className="h-5 w-5" strokeWidth={2} />
              {t("cart_title")}
            </DialogTitle>
            <DialogDescription>{t("cart_total")} {formatPrice(cartTotal)}</DialogDescription>
          </DialogHeader>

          {cart.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">{t("cart_empty")}</p>
          ) : (
            <div className="flex flex-col gap-2 my-2">
              {cart.map((item) => (
                <div key={item.material.id} className="flex items-center gap-3 rounded-xl border border-border bg-background p-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-foreground truncate">{item.material.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatPrice(item.material.sale_price ?? 0)} × {item.quantity} = <strong>{formatPrice((item.material.sale_price ?? 0) * item.quantity)}</strong>
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => updateCartQty(item.material.id, -1)}
                      className="flex h-7 w-7 items-center justify-center rounded-full border border-border text-muted-foreground hover:bg-muted"
                    >
                      <Minus className="h-3 w-3" />
                    </button>
                    <span className="w-8 text-center text-sm font-medium">{item.quantity}</span>
                    <button
                      onClick={() => updateCartQty(item.material.id, 1)}
                      className="flex h-7 w-7 items-center justify-center rounded-full border border-border text-muted-foreground hover:bg-muted"
                    >
                      <Plus className="h-3 w-3" />
                    </button>
                    <button
                      onClick={() => removeFromCart(item.material.id)}
                      className="ml-1 flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground hover:bg-pastel-pink hover:text-pastel-pink-foreground"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))}
              <div className="mt-2 flex items-center justify-between rounded-xl bg-muted/50 px-4 py-3">
                <span className="font-semibold text-foreground">{t("cart_total")}</span>
                <span className="text-lg font-bold text-foreground">{formatPrice(cartTotal)}</span>
              </div>
            </div>
          )}

          <DialogFooter className="gap-2">
            {cart.length > 0 && (
              <Button variant="outline" size="sm" onClick={() => setCart([])}>{t("cart_clear")}</Button>
            )}
            <Button variant="outline" onClick={() => setShowCart(false)}>{t("form.cancel")}</Button>
            <Button onClick={placeOrder} disabled={placing || cart.length === 0}>
              {placing ? "..." : t("cart_checkout")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

/* ---- Shop item card (native/mobile) ---- */
const ShopItemCard = ({
  material,
  onAddToCart,
  t,
  categoryLabel,
}: {
  material: MaterialRow;
  onAddToCart: (m: MaterialRow, qty: number) => void;
  t: (k: string, opts?: Record<string, unknown>) => string;
  categoryLabel: (k: string) => string;
}) => {
  const [qty, setQty] = useState(1);
  const m = categoryVisual(material.category);
  const Icon = m.icon;
  return (
    <div className="rounded-2xl border border-border bg-background p-4 shadow-soft">
      <div className="flex gap-3">
        <span className={cn("flex h-12 w-12 shrink-0 items-center justify-center rounded-full", m.color)}>
          <Icon className="h-5 w-5" strokeWidth={2} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-foreground">{material.name}</p>
          {material.description && (
            <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2">{material.description}</p>
          )}
          <div className="mt-2 flex flex-wrap gap-2">
            <span className={cn("rounded-full px-2.5 py-1 text-xs font-medium", m.color)}>{categoryLabel(material.category)}</span>
            <span className="rounded-full bg-pastel-green px-2.5 py-1 text-xs font-semibold text-pastel-green-foreground">
              {t("sale_price_label")} {formatPrice(material.sale_price ?? 0)}
            </span>
          </div>
          <div className="mt-3 flex items-center gap-2">
            <button onClick={() => setQty((q) => Math.max(1, q - 1))} className="flex h-7 w-7 items-center justify-center rounded-full border border-border text-muted-foreground hover:bg-muted">
              <Minus className="h-3 w-3" />
            </button>
            <span className="w-8 text-center text-sm font-medium">{qty}</span>
            <button onClick={() => setQty((q) => Math.min(999, q + 1))} className="flex h-7 w-7 items-center justify-center rounded-full border border-border text-muted-foreground hover:bg-muted">
              <Plus className="h-3 w-3" />
            </button>
            <button
              onClick={() => { onAddToCart(material, qty); setQty(1); }}
              className="ml-2 flex h-8 items-center gap-1.5 rounded-full bg-pastel-blue px-3 text-xs font-semibold text-pastel-blue-foreground hover:opacity-90"
            >
              <ShoppingCart className="h-3.5 w-3.5" strokeWidth={2} />
              {t("add_to_cart")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

/* ---- Shop item row (desktop) ---- */
const ShopItemRow = ({
  material,
  onAddToCart,
  t,
  categoryLabel,
}: {
  material: MaterialRow;
  onAddToCart: (m: MaterialRow, qty: number) => void;
  t: (k: string, opts?: Record<string, unknown>) => string;
  categoryLabel: (k: string) => string;
}) => {
  const [qty, setQty] = useState(1);
  const m = categoryVisual(material.category);
  const Icon = m.icon;
  return (
    <tr className="border-b border-border/60 text-sm transition-colors hover:bg-muted/30">
      <td className="px-6 py-4">
        <div className="flex items-center gap-3">
          <span className={cn("flex h-9 w-9 items-center justify-center rounded-full", m.color)}>
            <Icon className="h-4 w-4" strokeWidth={2} />
          </span>
          <div>
            <p className="font-semibold text-foreground">{material.name}</p>
            {material.description && (
              <p className="max-w-xs text-xs text-muted-foreground line-clamp-1">{material.description}</p>
            )}
          </div>
        </div>
      </td>
      <td className="px-6 py-4">
        <span className={cn("rounded-full px-3 py-1 text-xs font-medium", m.color)}>{categoryLabel(material.category)}</span>
      </td>
      <td className="px-6 py-4 text-right font-semibold text-foreground">
        {formatPrice(material.sale_price ?? 0)}
      </td>
      <td className="px-6 py-4">
        <div className="flex items-center justify-end gap-2">
          <button onClick={() => setQty((q) => Math.max(1, q - 1))} className="flex h-7 w-7 items-center justify-center rounded-full border border-border text-muted-foreground hover:bg-muted">
            <Minus className="h-3 w-3" />
          </button>
          <span className="w-8 text-center text-sm font-medium">{qty}</span>
          <button onClick={() => setQty((q) => Math.min(999, q + 1))} className="flex h-7 w-7 items-center justify-center rounded-full border border-border text-muted-foreground hover:bg-muted">
            <Plus className="h-3 w-3" />
          </button>
          <button
            onClick={() => { onAddToCart(material, qty); setQty(1); }}
            className="flex h-8 items-center gap-1.5 rounded-full bg-pastel-blue px-3 text-xs font-semibold text-pastel-blue-foreground hover:opacity-90"
          >
            <ShoppingCart className="h-3.5 w-3.5" strokeWidth={2} />
            {t("add_to_cart")}
          </button>
        </div>
      </td>
    </tr>
  );
};


