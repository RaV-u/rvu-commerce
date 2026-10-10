-- Older bulk-order handling allows large item counts in a single order line.
ALTER TABLE store.order_items DROP CONSTRAINT IF EXISTS order_items_quantity_check;
ALTER TABLE store.order_items ADD CONSTRAINT order_items_quantity_check
  CHECK(quantity BETWEEN 1 AND 100000);
