-- Signed cart lines model the historical quantity-reconciliation defect.
-- Trusted PUT updates retain non-negative validation; only the deliberately
-- vulnerable customer POST add operation accepts a signed line.
ALTER TABLE store.cart_items DROP CONSTRAINT IF EXISTS cart_items_quantity_check;
ALTER TABLE store.cart_items ADD CONSTRAINT cart_items_quantity_check
  CHECK(quantity BETWEEN -99 AND 100000);
