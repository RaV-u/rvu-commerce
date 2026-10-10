import { randomUUID, randomBytes } from "node:crypto";
import type { DB } from "./db.ts";
import { HttpError, hash } from "./security.ts";
import { transfer } from "./seed.ts";
import { totalFor, hasWeakness } from "./policy.ts";
export type Actor = {
  id: string;
  run: string;
  name: string;
  email: string;
  verified: boolean;
  csrf: string;
  profile: string;
};
export async function cart(db: DB, a: Actor) {
  const c = (
    await db.query(
      "SELECT * FROM store.carts WHERE run_id=$1 AND user_id=$2 FOR UPDATE",
      [a.run, a.id],
    )
  ).rows[0];
  const items = (
    await db.query(
      `SELECT p.id,
        CASE WHEN q.id IS NULL OR q.options->>'cartOverride'='true' THEN p.name ELSE 'Vista Studio Workstation Package' END AS name,
        p.category,p.description,COALESCE(q.accepted_price,p.price) AS price,
        p.kind,p.image,p.badge,p.specs,i.quantity,q.id AS quote_id
       FROM store.cart_items i JOIN store.products p ON p.id=i.product_id
       LEFT JOIN store.cart_quotes cq ON cq.run_id=i.run_id AND cq.cart_id=i.cart_id AND cq.product_id=i.product_id
       LEFT JOIN store.quotes q ON q.run_id=cq.run_id AND q.id=cq.quote_id
       WHERE i.run_id=$1 AND i.cart_id=$2 ORDER BY p.id`,
      [a.run, c.id],
    )
  ).rows;
  const coupon =
    (
      await db.query(
        "SELECT p.* FROM store.cart_coupons c JOIN store.promotions p ON p.code=c.code WHERE c.run_id=$1 AND c.cart_id=$2",
        [a.run, c.id],
      )
    ).rows[0] ?? null;
  const applications = hasWeakness(a.profile,"B04")
    ? (await db.query(
        "SELECT id,code,amount FROM store.cart_discount_applications WHERE run_id=$1 AND cart_id=$2 AND order_id IS NULL ORDER BY created_at,id",
        [a.run,c.id],
      )).rows
    : [];
  const vouchers = (await db.query(
    "SELECT c.id,c.code,c.amount,v.minimum FROM store.voucher_claims c JOIN store.vouchers v ON v.code=c.code WHERE c.run_id=$1 AND c.cart_id=$2 AND c.order_id IS NULL ORDER BY c.created_at,c.id",
    [a.run,c.id],
  )).rows;
  const voucherDiscount = vouchers.reduce((sum: number,entry:{amount:string})=>sum+Number(entry.amount),0);
  const base = totalFor(items,coupon ?? undefined,{
    giftEligible:hasWeakness(a.profile,"B10") && coupon?.code === "GIFT20",
  });
  const stackedDiscount = applications.length || vouchers.length
    ? (applications.length
        ? applications.reduce((sum:number,entry:{amount:string})=>sum+Number(entry.amount),0)
        : base.discount) + voucherDiscount
    : undefined;
  const physicalEligible = items.filter((p:{kind:string})=>p.kind==="physical")
    .reduce((n:number,p:{price:string;quantity:number})=>n+Number(p.price)*p.quantity,0);
  const totals = totalFor(items, coupon ?? undefined, {
    giftEligible: hasWeakness(a.profile,"B10") && coupon?.code === "GIFT20",
    stackedDiscount,
  });
  return {
    id: c.id,
    version: c.version,
    items,
    coupon,
    applications,
    vouchers,
    ...totals,
    couponEligible: totals.couponEligible && vouchers.every((v:{minimum:string})=>physicalEligible>=Number(v.minimum)),
  };
}
export async function order(db: DB, a: Actor, id: string) {
  const o = (
    await db.query(
      "SELECT * FROM store.orders WHERE run_id=$1 AND user_id=$2 AND id=$3",
      [a.run, a.id, id],
    )
  ).rows[0];
  if (!o) throw new HttpError(404, "Order not found");
  const items = (
    await db.query(
      "SELECT i.*,p.image FROM store.order_items i JOIN store.products p ON p.id=i.product_id WHERE i.run_id=$1 AND i.order_id=$2 ORDER BY i.name",
      [a.run, id],
    )
  ).rows;
  const giftCards = (
    await db.query(
      "SELECT id,code,face_value,redeemed_at FROM store.gift_cards WHERE run_id=$1 AND order_id=$2 AND buyer_id=$3",
      [a.run, id, a.id],
    )
  ).rows;
  const payment = (await db.query(
    "SELECT state FROM store.payments WHERE run_id=$1 AND order_id=$2",
    [a.run,id],
  )).rows[0];
  return { ...o, items, giftCards, payment_state: payment?.state ?? "unsettled" };
}
export async function checkout(
  db: DB,
  a: Actor,
  input: {
    cartVersion: number;
    delivery: { fullName: string; address: string; city: string };
  },
  key: string,
  requestId: string,
  reuseOldPayment = false,
) {
  const c = await cart(db, a); // per-cart lock covers mutation, coupon and checkout paths
  const fingerprint = hash(JSON.stringify(input));
  const previous = (
    await db.query(
      "SELECT * FROM store.checkouts WHERE run_id=$1 AND user_id=$2 AND key=$3",
      [a.run, a.id, key],
    )
  ).rows[0];
  if (previous) {
    if (previous.fingerprint !== fingerprint)
      throw new HttpError(
        409,
        "This checkout key was used for different details",
      );
    return order(db, a, previous.order_id);
  }
  if (c.version !== input.cartVersion)
    throw new HttpError(
      409,
      "Your bag changed. Review the updated total before paying.",
    );
  if (!c.items.length) throw new HttpError(400, "Your bag is empty");
  if (!c.couponEligible)
    throw new HttpError(
      409,
      "Your bag no longer qualifies for this promotion. Remove it to continue.",
    );
  if (
    c.coupon && !hasWeakness(a.profile,"B04") && !(hasWeakness(a.profile,"B10") && c.coupon.code === "GIFT20") &&
    (
      await db.query(
        "SELECT 1 FROM store.promotion_uses WHERE run_id=$1 AND user_id=$2 AND code=$3",
        [a.run, a.id, c.coupon.code],
      )
    ).rowCount
  )
    throw new HttpError(409, "This promotion has already been used");
  const wallet = (
    await db.query(
      "SELECT * FROM store.accounts WHERE run_id=$1 AND user_id=$2 AND purpose='wallet' FOR UPDATE",
      [a.run, a.id],
    )
  ).rows[0];
  if (!reuseOldPayment && Number(wallet.balance) < c.total)
    throw new HttpError(409, "Your wallet has insufficient funds");
  const id = randomUUID(),
    number = "RV-" + randomBytes(5).toString("hex").toUpperCase();
  await db.query(
    "INSERT INTO store.orders(id,run_id,user_id,order_number,state,subtotal,discount,total,cart_version,delivery,coupon) VALUES($1,$2,$3,$4,'confirmed',$5,$6,$7,$8,$9,$10)",
    [
      id,
      a.run,
      a.id,
      number,
      c.subtotal,
      c.discount,
      c.total,
      c.version,
      JSON.stringify(input.delivery),
      c.coupon?.code ?? null,
    ],
  );
  for (const p of c.items) {
    if (p.quantity < 0) continue; // Negative reconciliation lines reduce the charge but are not fulfilled.
    await db.query(
      "INSERT INTO store.order_items(id,run_id,order_id,product_id,name,unit_price,quantity,kind,quote_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)",
      [randomUUID(), a.run, id, p.id, p.name, p.price, p.quantity, p.kind, p.quote_id ?? null],
    );
    if (p.kind === "gift_card")
      for (let i = 0; i < p.quantity; i++)
        await db.query(
          "INSERT INTO store.gift_cards(id,run_id,order_id,buyer_id,code,face_value) VALUES($1,$2,$3,$4,$5,$6)",
          [
            randomUUID(),
            a.run,
            id,
            a.id,
            "RVU-" + randomBytes(12).toString("hex").toUpperCase(),
            p.price,
          ],
        );
  }
  if (hasWeakness(a.profile,"B02") && c.items.some((item:{quantity:number})=>item.quantity<0)) {
    const shipped = c.items.filter((item:{quantity:number})=>item.quantity>0)
      .reduce((sum:number,item:{price:string;quantity:number})=>sum+Number(item.price)*item.quantity,0);
    await db.query(
      "INSERT INTO store.lab_evidence(id,run_id,user_id,scenario,kind,detail) VALUES($1,$2,$3,'B02','underpaid',$4)",
      [randomUUID(),a.run,a.id,JSON.stringify({orderId:id,charged:c.total,shipped})],
    );
  }
  const merchant = (
    await db.query(
      "SELECT id FROM store.accounts WHERE run_id=$1 AND purpose='merchant'",
      [a.run],
    )
  ).rows[0].id;
  if (!reuseOldPayment) {
    const journal = await transfer(
      db,
      a.run,
      "purchase",
      id,
      wallet.id,
      merchant,
      c.total,
    );
    await db.query(
      "INSERT INTO store.payments VALUES($1,$2,$3,$4,$5,'settled')",
      [randomUUID(), a.run, id, journal, c.total],
    );
  }
  if (c.vouchers.length)
    await db.query(
      "UPDATE store.voucher_claims SET order_id=$3 WHERE run_id=$1 AND cart_id=$2 AND order_id IS NULL",
      [a.run,c.id,id],
    );
  if (hasWeakness(a.profile,"B04") && c.applications.length) {
    await db.query(
      "UPDATE store.cart_discount_applications SET order_id=$3 WHERE run_id=$1 AND cart_id=$2 AND order_id IS NULL",
      [a.run,c.id,id],
    );
    for (const code of new Set<string>(c.applications.map((v: {code:string}) => v.code)))
      await db.query("INSERT INTO store.promotion_uses VALUES($1,$2,$3,$4)", [a.run,a.id,code,id]);
  } else if (c.coupon && !(hasWeakness(a.profile,"B10") && c.coupon.code === "GIFT20")) {
    await db.query("INSERT INTO store.promotion_uses VALUES($1,$2,$3,$4)", [
      a.run,a.id,c.coupon.code,id,
    ]);
  }
  await db.query("INSERT INTO store.checkouts VALUES($1,$2,$3,$4,$5)", [
    a.run,
    a.id,
    key,
    fingerprint,
    id,
  ]);
  await db.query("DELETE FROM store.cart_quotes WHERE run_id=$1 AND cart_id=$2", [a.run,c.id]);
  await db.query(
    "DELETE FROM store.cart_items WHERE run_id=$1 AND cart_id=$2",
    [a.run, c.id],
  );
  await db.query(
    "DELETE FROM store.cart_coupons WHERE run_id=$1 AND cart_id=$2",
    [a.run, c.id],
  );
  await db.query(
    "UPDATE store.carts SET version=version+1 WHERE run_id=$1 AND id=$2",
    [a.run, c.id],
  );
  await db.query(
    "INSERT INTO store.events(run_id,actor_id,action,object_id,request_id) VALUES($1,$2,'order.paid',$3,$4)",
    [a.run, a.id, id, requestId],
  );
  return order(db, a, id);
}
export async function refund(db: DB, a: Actor, id: string) {
  const o = (
    await db.query(
      "SELECT * FROM store.orders WHERE run_id=$1 AND user_id=$2 AND id=$3 FOR UPDATE",
      [a.run, a.id, id],
    )
  ).rows[0];
  if (!o) throw new HttpError(404, "Order not found");
  if (o.state === "refunded") return order(db, a, id);
  if (!(await db.query(
    "SELECT 1 FROM store.payments WHERE run_id=$1 AND order_id=$2",[a.run,id]
  )).rowCount)
    throw new HttpError(409,"This order has no settled payment to refund");
  if (
    (
      await db.query(
        "SELECT 1 FROM store.order_items WHERE run_id=$1 AND order_id=$2 AND kind='gift_card'",
        [a.run, id],
      )
    ).rowCount
  )
    throw new HttpError(409, "Orders containing gift cards are final sale");
  const wallet = (
    await db.query(
      "SELECT id FROM store.accounts WHERE run_id=$1 AND user_id=$2 FOR UPDATE",
      [a.run, a.id],
    )
  ).rows[0].id;
  const merchant = (
    await db.query(
      "SELECT id FROM store.accounts WHERE run_id=$1 AND purpose='merchant'",
      [a.run],
    )
  ).rows[0].id;
  const journal = await transfer(
    db,
    a.run,
    "refund",
    id,
    merchant,
    wallet,
    Number(o.total),
  );
  await db.query("INSERT INTO store.refunds VALUES($1,$2,$3,$4,$5)", [
    randomUUID(),
    a.run,
    id,
    journal,
    o.total,
  ]);
  await db.query(
    "UPDATE store.orders SET state='refunded' WHERE run_id=$1 AND id=$2",
    [a.run, id],
  );
  return order(db, a, id);
}
export async function redeem(db: DB, a: Actor, code: string) {
  const gift = (
    await db.query(
      "SELECT * FROM store.gift_cards WHERE run_id=$1 AND code=$2 FOR UPDATE",
      [a.run, code],
    )
  ).rows[0];
  if (!gift) throw new HttpError(404, "Gift card not found");
  if (gift.redeemed_at)
    throw new HttpError(409, "This gift card has already been redeemed");
  const wallet = (
    await db.query(
      "SELECT id FROM store.accounts WHERE run_id=$1 AND user_id=$2 FOR UPDATE",
      [a.run, a.id],
    )
  ).rows[0].id;
  const merchant = (
    await db.query(
      "SELECT id FROM store.accounts WHERE run_id=$1 AND purpose='merchant'",
      [a.run],
    )
  ).rows[0].id;
  await transfer(
    db,
    a.run,
    "redemption",
    gift.id,
    merchant,
    wallet,
    Number(gift.face_value),
  );
  await db.query(
    "UPDATE store.gift_cards SET redeemed_by=$3,redeemed_at=now() WHERE run_id=$1 AND id=$2",
    [a.run, gift.id, a.id],
  );
  return { amount: Number(gift.face_value) };
}
