import test from "node:test";
import assert from "node:assert/strict";
import { money } from "../apps/web/src/api.ts";
import { products } from "../apps/api/src/seed.ts";
import { baseline, totalFor } from "../apps/api/src/policy.ts";

test("amounts are whole EGP pounds, not piasters", () => {
  assert.match(money(1), /1/);
  assert.doesNotMatch(money(1), /0[.,]01/);
  assert.match(money(100), /100/);
  assert.equal(baseline.openingCredit, 15000);
  assert.equal(products.find(p => p[0] === "gift-500")?.[4], 500);
  assert.equal(totalFor([{price:100,quantity:1,kind:"physical"}]).total, 100);
});
