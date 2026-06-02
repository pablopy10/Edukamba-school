-- ============================================================
-- Migration: Material Sales Feature
-- Adds for_sale, purchase_price, sale_price to materials
-- Creates material_orders and material_order_items tables
-- ============================================================

-- 1. Extend materials table with sales fields
ALTER TABLE materials
  ADD COLUMN IF NOT EXISTS for_sale        BOOLEAN       NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS purchase_price  NUMERIC(10,2) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS sale_price      NUMERIC(10,2) DEFAULT NULL;

-- Constraint: if for_sale, both prices must be positive
ALTER TABLE materials
  DROP CONSTRAINT IF EXISTS materials_sale_prices_check;
ALTER TABLE materials
  ADD CONSTRAINT materials_sale_prices_check CHECK (
    (for_sale = FALSE)
    OR (
      for_sale = TRUE
      AND purchase_price IS NOT NULL AND purchase_price > 0
      AND sale_price IS NOT NULL AND sale_price > 0
      AND sale_price >= purchase_price
    )
  );

-- 2. Create material_orders table
CREATE TABLE IF NOT EXISTS material_orders (
  id                  UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id           UUID          NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  buyer_profile_id    UUID          NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  buyer_role          TEXT          NOT NULL CHECK (buyer_role IN ('PARENT', 'STUDENT')),
  status              TEXT          NOT NULL DEFAULT 'pending'
                                    CHECK (status IN ('pending', 'processing', 'completed', 'cancelled')),
  total_amount        NUMERIC(10,2) NOT NULL CHECK (total_amount >= 0),
  cancellation_reason TEXT          DEFAULT NULL,
  created_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS material_orders_school_id_idx         ON material_orders(school_id);
CREATE INDEX IF NOT EXISTS material_orders_buyer_profile_id_idx  ON material_orders(buyer_profile_id);
CREATE INDEX IF NOT EXISTS material_orders_status_idx            ON material_orders(status);

-- 3. Create material_order_items table
CREATE TABLE IF NOT EXISTS material_order_items (
  id          UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id    UUID          NOT NULL REFERENCES material_orders(id) ON DELETE CASCADE,
  material_id UUID          NOT NULL REFERENCES materials(id) ON DELETE RESTRICT,
  quantity    INTEGER       NOT NULL CHECK (quantity >= 1 AND quantity <= 999),
  unit_price  NUMERIC(10,2) NOT NULL CHECK (unit_price > 0),
  created_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS material_order_items_order_id_idx    ON material_order_items(order_id);
CREATE INDEX IF NOT EXISTS material_order_items_material_id_idx ON material_order_items(material_id);

-- 4. RLS Policies for material_orders
ALTER TABLE material_orders ENABLE ROW LEVEL SECURITY;

-- School management can see all orders for their school
DROP POLICY IF EXISTS "material_orders_school_select" ON material_orders;
CREATE POLICY "material_orders_school_select"
  ON material_orders FOR SELECT
  USING (
    school_id IN (
      SELECT COALESCE(support_context_school_id, school_id)
      FROM profiles WHERE id = auth.uid()
    )
  );

-- Buyers can see their own orders
DROP POLICY IF EXISTS "material_orders_buyer_select" ON material_orders;
CREATE POLICY "material_orders_buyer_select"
  ON material_orders FOR SELECT
  USING (buyer_profile_id = auth.uid());

-- Buyers can create orders for their own school
DROP POLICY IF EXISTS "material_orders_buyer_insert" ON material_orders;
CREATE POLICY "material_orders_buyer_insert"
  ON material_orders FOR INSERT
  WITH CHECK (
    buyer_profile_id = auth.uid()
    AND school_id IN (
      SELECT COALESCE(support_context_school_id, school_id)
      FROM profiles WHERE id = auth.uid()
    )
  );

-- School management can update orders (change status)
DROP POLICY IF EXISTS "material_orders_school_update" ON material_orders;
CREATE POLICY "material_orders_school_update"
  ON material_orders FOR UPDATE
  USING (
    school_id IN (
      SELECT COALESCE(support_context_school_id, school_id)
      FROM profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('ADMIN','SUPER_ADMIN','DIRECTOR','SECRETARY','TREASURER','STOCK_MANAGER')
    )
  );

-- 5. RLS Policies for material_order_items
ALTER TABLE material_order_items ENABLE ROW LEVEL SECURITY;

-- Anyone who can see the order can see its items
DROP POLICY IF EXISTS "material_order_items_select" ON material_order_items;
CREATE POLICY "material_order_items_select"
  ON material_order_items FOR SELECT
  USING (
    order_id IN (
      SELECT id FROM material_orders
      WHERE school_id IN (
        SELECT COALESCE(support_context_school_id, school_id)
        FROM profiles WHERE id = auth.uid()
      )
      OR buyer_profile_id = auth.uid()
    )
  );

-- Only the buyer can insert items (via order creation)
DROP POLICY IF EXISTS "material_order_items_insert" ON material_order_items;
CREATE POLICY "material_order_items_insert"
  ON material_order_items FOR INSERT
  WITH CHECK (
    order_id IN (
      SELECT id FROM material_orders
      WHERE buyer_profile_id = auth.uid()
    )
  );
