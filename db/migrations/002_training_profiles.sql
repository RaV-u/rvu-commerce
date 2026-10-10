-- Training scenarios are selected exclusively by the instructor and scoped to a run.
ALTER TABLE store.runs DROP CONSTRAINT runs_profile_check;
ALTER TABLE store.runs ADD CONSTRAINT runs_profile_check
  CHECK (profile IN ('secure-baseline','B01','B04','B08','B10','R01'));

CREATE TABLE store.quotes (
  id uuid NOT NULL,
  run_id uuid NOT NULL REFERENCES store.runs,
  user_id uuid NOT NULL,
  options jsonb NOT NULL,
  authorized_price bigint NOT NULL CHECK(authorized_price > 0 AND authorized_price <= 100000000),
  accepted_price bigint CHECK(accepted_price > 0 AND accepted_price <= 100000000),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '1 hour'),
  accepted_at timestamptz,
  PRIMARY KEY(run_id,id),
  FOREIGN KEY(run_id,user_id) REFERENCES store.users(run_id,id),
  CHECK ((accepted_at IS NULL) = (accepted_price IS NULL))
);
CREATE TABLE store.cart_quotes (
  run_id uuid NOT NULL,
  cart_id uuid NOT NULL,
  product_id text NOT NULL REFERENCES store.products(id),
  quote_id uuid NOT NULL,
  PRIMARY KEY(run_id,cart_id,product_id),
  UNIQUE(run_id,quote_id),
  FOREIGN KEY(run_id,cart_id) REFERENCES store.carts(run_id,id),
  FOREIGN KEY(run_id,quote_id) REFERENCES store.quotes(run_id,id)
);
ALTER TABLE store.order_items ADD COLUMN quote_id uuid;
ALTER TABLE store.order_items ADD CONSTRAINT order_item_quote_fk
 FOREIGN KEY(run_id,quote_id) REFERENCES store.quotes(run_id,id);

CREATE TABLE store.cart_discount_applications (
  id uuid NOT NULL PRIMARY KEY,
  run_id uuid NOT NULL,
  cart_id uuid NOT NULL,
  code text NOT NULL REFERENCES store.promotions(code),
  amount bigint NOT NULL CHECK(amount > 0),
  order_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(run_id,cart_id) REFERENCES store.carts(run_id,id),
  FOREIGN KEY(run_id,order_id) REFERENCES store.orders(run_id,id)
);
CREATE INDEX cart_discounts_active ON store.cart_discount_applications(run_id,cart_id) WHERE order_id IS NULL;
INSERT INTO store.promotions(code,percent,minimum,description)
VALUES('GIFT20',20,10000,'20% off selected gift cards, subject to the current promotional terms.')
ON CONFLICT(code) DO NOTHING;

-- Returning-customer confirmation boundary: a review intent is always bound to
-- one cart version, but the B08 profile permits proof from an unrelated order.
CREATE TABLE store.checkout_intents (
  id uuid NOT NULL,
  run_id uuid NOT NULL,
  user_id uuid NOT NULL,
  cart_version int NOT NULL,
  quoted_total bigint NOT NULL CHECK(quoted_total>0),
  delivery jsonb NOT NULL,
  confirmed_order_id uuid,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '30 minutes'),
  PRIMARY KEY(run_id,id),
  FOREIGN KEY(run_id,user_id) REFERENCES store.users(run_id,id),
  FOREIGN KEY(run_id,confirmed_order_id) REFERENCES store.orders(run_id,id)
);

-- Single-use store voucher. Claims are separate ledger-like benefit facts; the
-- R01 profile deliberately omits atomic check-and-claim for this entity.
CREATE TABLE store.vouchers (
  code text PRIMARY KEY,
  amount bigint NOT NULL CHECK(amount>0),
  minimum bigint NOT NULL CHECK(minimum>0)
);
INSERT INTO store.vouchers(code,amount,minimum) VALUES('STUDIO300',30000,100000);
CREATE TABLE store.voucher_claims (
  id uuid PRIMARY KEY,
  run_id uuid NOT NULL,
  cart_id uuid NOT NULL,
  code text NOT NULL REFERENCES store.vouchers(code),
  amount bigint NOT NULL CHECK(amount>0),
  order_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(run_id,cart_id) REFERENCES store.carts(run_id,id),
  FOREIGN KEY(run_id,order_id) REFERENCES store.orders(run_id,id)
);
CREATE INDEX voucher_claims_active ON store.voucher_claims(run_id,cart_id,code) WHERE order_id IS NULL;
