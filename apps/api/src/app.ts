import Fastify, { type FastifyRequest, type FastifyReply } from "fastify";
import cookie from "@fastify/cookie";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import serveStatic from "@fastify/static";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { Config } from "./config.ts";
import { createPool, transaction, activeRun, type DB } from "./db.ts";
import {
  hash,
  token,
  passwordHash,
  passwordValid,
  HttpError,
} from "./security.ts";
import { createCustomer, newRun } from "./seed.ts";
import { activeTrainingProfiles } from "./policy.ts";
import { registerExtendedLabs, extendedLabels } from "./extendedLabs.ts";
import {
  cart,
  checkout,
  order,
  refund,
  redeem,
  type Actor,
} from "./commerce.ts";

const email = z
  .string()
  .trim()
  .toLowerCase()
  .email()
  .max(120)
  .regex(
    /^[a-z0-9._-]+@learner\.rvu\.test$/,
    "Use your fictional @learner.rvu.test address",
  );
const credentials = z
  .object({ email, password: z.string().min(12).max(128) })
  .strict();
const uuid = z.string().uuid();
export async function buildApp(config: Config) {
  const app = Fastify({ logger: config.logger ?? false, bodyLimit: 16384 });
  const pool = createPool(config.databaseUrl);
  await app.register(cookie);
  await app.register(helmet, {
    strictTransportSecurity: false, // This installation is intentionally loopback HTTP.
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        imgSrc: ["'self'", "data:"],
        styleSrc: ["'self'"],
        scriptSrc: ["'self'"],
        connectSrc: ["'self'"],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
        upgradeInsecureRequests: null,
      },
    },
  });
  await app.register(rateLimit, { max: 300, timeWindow: "1 minute" });
  const cname = config.mode === "store" ? "rvu_store" : "rvu_instructor";
  function setSession(reply: FastifyReply, value: string) {
    reply.setCookie(cname, value, {
      httpOnly: true,
      sameSite: "strict",
      secure: config.cookieSecure,
      path: "/",
      maxAge: 28800,
    });
  }
  app.addHook("onRequest", async (req, reply) => {
    reply.header("Cache-Control", "no-store");
    if (
      ["POST", "PUT", "PATCH", "DELETE"].includes(req.method) &&
      req.headers.origin !== config.origin
    )
      throw new HttpError(403, "Invalid request origin");
  });
  app.setErrorHandler((err, req, reply) => {
    if (err instanceof z.ZodError)
      return reply
        .code(400)
        .send({ error: err.issues[0]?.message ?? "Invalid input" });
    if (err instanceof HttpError)
      return reply.code(err.statusCode).send({ error: err.message });
    const e = err as { code?: string; statusCode?: number };
    if (e.code === "23505")
      return reply
        .code(409)
        .send({ error: "That value has already been used" });
    if (e.statusCode && e.statusCode < 500)
      return reply.code(e.statusCode).send({ error: "Request rejected" });
    req.log.error(err);
    if (process.env.RVU_TEST_DIAGNOSTICS === "1" && process.env.NODE_ENV === "test") {
      const detail = err as { code?: string; message?: string; detail?: string; constraint?: string };
      process.stderr.write(`[RVU test diagnostic] ${req.method} ${req.url}: ${JSON.stringify({ code: detail.code, message: detail.message, detail: detail.detail, constraint: detail.constraint })}\n`);
    }
    return reply
      .code(500)
      .send({ error: "The request could not be completed" });
  });
  app.get("/api/health", async () => {
    await pool.query("SELECT 1");
    return { status: "ok", service: config.mode };
  });
  async function actor(
    db: DB,
    req: FastifyRequest,
    verified = false,
  ): Promise<Actor> {
    const run = await activeRun(db);
    const a = (
      await db.query(
        "SELECT u.id,u.name,u.email,u.verified,s.csrf,r.profile FROM store.sessions s JOIN store.users u ON u.run_id=s.run_id AND u.id=s.user_id JOIN store.runs r ON r.id=s.run_id WHERE s.token_hash=$1 AND s.run_id=$2 AND s.expires_at>now()",
        [hash(req.cookies[cname] ?? ""), run],
      )
    ).rows[0];
    if (!a) throw new HttpError(401, "Please sign in");
    if (verified && !a.verified)
      throw new HttpError(403, "Verify your email in your inbox first");
    if (
      !["GET", "HEAD"].includes(req.method) &&
      req.headers["x-csrf-token"] !== a.csrf
    )
      throw new HttpError(403, "Invalid session token");
    return { ...a, run };
  }
  const userRoute = (
    method: "GET" | "POST" | "PUT" | "DELETE",
    url: string,
    fn: (db: DB, a: Actor, req: FastifyRequest) => Promise<unknown>,
    verified = true,
  ) =>
    app.route({
      method,
      url,
      handler: (req) =>
        transaction(pool, async (db) =>
          fn(db, await actor(db, req, verified), req),
        ),
    });
  async function session(db: DB, reply: FastifyReply, run: string, id: string) {
    const raw = token(),
      csrf = token();
    await db.query(
      "INSERT INTO store.sessions VALUES($1,$2,$3,$4,now()+interval '8 hours')",
      [hash(raw), run, id, csrf],
    );
    setSession(reply, raw);
    return { csrf };
  }
  if (config.mode === "store") {
    app.get("/api/catalog", () =>
      transaction(pool, async (db) => ({
        products: (await db.query("SELECT * FROM store.products ORDER BY id")).rows,
        promotions: (await db.query(
          "SELECT * FROM store.promotions WHERE code!='GIFT20' OR EXISTS(SELECT 1 FROM store.runs WHERE id=(SELECT active_run FROM store.runtime) AND profile='B10') ORDER BY code"
        )).rows,
      })),
    );
    app.get("/api/session", (req) =>
      transaction(pool, async (db) => {
        try {
          const a = await actor(db, req);
          return {
            user: {
              id: a.id,
              name: a.name,
              email: a.email,
              verified: a.verified,
            },
            csrf: a.csrf,
          };
        } catch (e) {
          if (e instanceof HttpError && e.statusCode === 401)
            return { user: null };
          throw e;
        }
      }),
    );
    app.post(
      "/api/register",
      { config: { rateLimit: { max: 12, timeWindow: "1 minute" } } },
      async (req, reply) => {
        const input = credentials
            .extend({ name: z.string().trim().min(2).max(80) })
            .parse(req.body),
          pw = await passwordHash(input.password);
        return transaction(pool, async (db) => {
          const run = await activeRun(db),
            u = await createCustomer(db, run, input.name, input.email, pw),
            v = token();
          await db.query(
            "INSERT INTO store.verifications VALUES($1,$2,$3,$4,now()+interval '30 minutes',NULL)",
            [hash(v), run, u.id, input.email],
          );
          await db.query(
            "INSERT INTO store.outbox(id,run_id,user_id,recipient,subject,body) VALUES($1,$2,$3,$4,$5,$6)",
            [
              randomUUID(),
              run,
              u.id,
              input.email,
              "Welcome to RVU. Verify your email.",
              `Your verification code: ${v}`,
            ],
          );
          return {
            ...(await session(db, reply, run, u.id)),
            user: {
              id: u.id,
              name: input.name,
              email: input.email,
              verified: false,
            },
          };
        });
      },
    );
    app.post(
      "/api/login",
      { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } },
      async (req, reply) => {
        const input = credentials.parse(req.body);
        return transaction(pool, async (db) => {
          const run = await activeRun(db),
            u = (
              await db.query(
                "SELECT * FROM store.users WHERE run_id=$1 AND email=$2",
                [run, input.email],
              )
            ).rows[0];
          if (!u || !(await passwordValid(input.password, u.password_hash)))
            throw new HttpError(401, "Email or password is incorrect");
          await db.query("DELETE FROM store.sessions WHERE token_hash=$1", [
            hash(req.cookies[cname] ?? ""),
          ]);
          return {
            ...(await session(db, reply, run, u.id)),
            user: {
              id: u.id,
              name: u.name,
              email: u.email,
              verified: u.verified,
            },
          };
        });
      },
    );
    userRoute(
      "POST",
      "/api/logout",
      async (db, a, req) => {
        await db.query("DELETE FROM store.sessions WHERE token_hash=$1", [
          hash(req.cookies[cname] ?? ""),
        ]);
        return { signedOut: true };
      },
      false,
    );
    userRoute(
      "GET",
      "/api/inbox",
      async (db, a) => ({
        messages: (
          await db.query(
            "SELECT o.id,o.subject,o.body,o.created_at FROM store.outbox o JOIN store.mailboxes m ON m.run_id=o.run_id AND m.user_id=o.user_id AND m.address=o.recipient WHERE o.run_id=$1 AND o.user_id=$2 ORDER BY o.created_at DESC",
            [a.run, a.id],
          )
        ).rows,
      }),
      false,
    );
    userRoute(
      "POST",
      "/api/verify",
      async (db, a, req) => {
        const input = z
          .object({ code: z.string().length(64) })
          .strict()
          .parse(req.body);
        const v = await db.query(
          "UPDATE store.verifications SET used_at=now() WHERE token_hash=$1 AND run_id=$2 AND user_id=$3 AND address=$4 AND used_at IS NULL AND expires_at>now() RETURNING token_hash",
          [hash(input.code), a.run, a.id, a.email],
        );
        if (!v.rowCount)
          throw new HttpError(400, "Verification code is invalid or expired");
        await db.query(
          "UPDATE store.users SET verified=true WHERE run_id=$1 AND id=$2",
          [a.run, a.id],
        );
        return { verified: true };
      },
      false,
    );
    userRoute("GET", "/api/cart", (db, a) => cart(db, a));
    userRoute("PUT", "/api/cart/items", async (db, a, req) => {
      const input = z
          .object({
            productId: z.string().max(40),
            quantity: z.number().int().min(0).max(10),
          })
          .strict()
          .parse(req.body),
        c = await cart(db, a);
      if (
        !(
          await db.query("SELECT 1 FROM store.products WHERE id=$1", [
            input.productId,
          ])
        ).rowCount
      )
        throw new HttpError(404, "Product not found");
      if (a.profile === "B04") {
        await db.query("DELETE FROM store.cart_discount_applications WHERE run_id=$1 AND cart_id=$2 AND order_id IS NULL",[a.run,c.id]);
        await db.query("DELETE FROM store.cart_coupons WHERE run_id=$1 AND cart_id=$2",[a.run,c.id]);
      }
      await db.query(
        "DELETE FROM store.cart_quotes WHERE run_id=$1 AND cart_id=$2 AND product_id=$3",
        [a.run,c.id,input.productId],
      );
      if (input.quantity === 0)
        await db.query(
          "DELETE FROM store.cart_items WHERE run_id=$1 AND cart_id=$2 AND product_id=$3",
          [a.run, c.id, input.productId],
        );
      else
        await db.query(
          "INSERT INTO store.cart_items VALUES($1,$2,$3,$4) ON CONFLICT(run_id,cart_id,product_id) DO UPDATE SET quantity=excluded.quantity",
          [a.run, c.id, input.productId, input.quantity],
        );
      await db.query(
        "UPDATE store.carts SET version=version+1 WHERE run_id=$1 AND id=$2",
        [a.run, c.id],
      );
      return cart(db, a);
    });
    userRoute("POST", "/api/cart/coupon", async (db, a, req) => {
      const { code } = z
          .object({ code: z.string().trim().toUpperCase().max(30) })
          .strict()
          .parse(req.body),
        c = await cart(db, a);
      const p = (
        await db.query("SELECT * FROM store.promotions WHERE code=$1", [code])
      ).rows[0];
      if (!p) throw new HttpError(404, "Promotion not found");
      if (c.coupon && a.profile !== "B04")
        throw new HttpError(
          409,
          "Remove the current promotion before applying another",
        );
      if (code === "GIFT20" && a.profile !== "B10")
        throw new HttpError(404, "Promotion not found");
      if (a.profile === "B04" && c.coupon?.code === code)
        throw new HttpError(409, "This promotion is already applied");
      const eligible = a.profile === "B10" && code === "GIFT20" ? c.subtotal : c.eligible;
      if (eligible < Number(p.minimum))
        throw new HttpError(
          409,
          "Your eligible items do not meet the promotion minimum",
        );
      if (
        !(a.profile === "B10" && code === "GIFT20") &&
        (
          await db.query(
            "SELECT 1 FROM store.promotion_uses WHERE run_id=$1 AND user_id=$2 AND code=$3",
            [a.run, a.id, code],
          )
        ).rowCount
      )
        throw new HttpError(409, "This promotion has already been used");
      if (a.profile === "B04") {
        const amount = Math.floor(eligible * p.percent / 100);
        if (amount <= 0 || c.discount + amount >= c.subtotal)
          throw new HttpError(409, "Promotion exceeds the eligible order value");
        await db.query(
          "INSERT INTO store.cart_discount_applications(id,run_id,cart_id,code,amount) VALUES($1,$2,$3,$4,$5)",
          [randomUUID(),a.run,c.id,code,amount],
        );
      }
      await db.query(
        "INSERT INTO store.cart_coupons VALUES($1,$2,$3) ON CONFLICT(run_id,cart_id) DO UPDATE SET code=excluded.code",
        [a.run,c.id,code],
      );
      await db.query(
        "UPDATE store.carts SET version=version+1 WHERE run_id=$1 AND id=$2",
        [a.run, c.id],
      );
      return cart(db, a);
    });
    userRoute("DELETE", "/api/cart/coupon", async (db, a) => {
      const c = await cart(db, a);
      if (a.profile === "B04")
        await db.query(
          "DELETE FROM store.cart_discount_applications WHERE run_id=$1 AND cart_id=$2 AND order_id IS NULL",
          [a.run,c.id],
        );
      await db.query(
        "DELETE FROM store.cart_coupons WHERE run_id=$1 AND cart_id=$2",
        [a.run, c.id],
      );
      await db.query(
        "UPDATE store.carts SET version=version+1 WHERE run_id=$1 AND id=$2",
        [a.run, c.id],
      );
      return cart(db, a);
    });
    // Voucher redemption uses an atomic check and insert in every profile
    // except R01, which intentionally separates the check from the claim.
    app.post("/api/cart/voucher", async (req) => {
      const {code} = z.object({code:z.string().trim().toUpperCase().max(40)}).strict().parse(req.body);
      const check = async (db:DB, a:Actor, takeCartLock:boolean) => {
        const c = takeCartLock
          ? await cart(db,a)
          : await (async()=>{
              const row=(await db.query("SELECT id FROM store.carts WHERE run_id=$1 AND user_id=$2",[a.run,a.id])).rows[0];
              const items=(await db.query(
                "SELECT p.price,p.kind,i.quantity FROM store.cart_items i JOIN store.products p ON p.id=i.product_id WHERE i.run_id=$1 AND i.cart_id=$2",[a.run,row.id]
              )).rows;
              return {id:row.id,eligible:items.filter((p:{kind:string})=>p.kind==='physical').reduce((n:number,p:{price:string;quantity:number})=>n+Number(p.price)*p.quantity,0)};
            })();
        const voucher=(await db.query("SELECT * FROM store.vouchers WHERE code=$1",[code])).rows[0];
        if (!voucher) throw new HttpError(404,"Store voucher not found");
        if (c.eligible<Number(voucher.minimum)) throw new HttpError(409,"Your bag does not qualify for this voucher");
        if (takeCartLock && "total" in c && typeof c.total === "number" && c.total<=Number(voucher.amount))
          throw new HttpError(409,"The voucher exceeds the current order value");
        if ((await db.query(
          "SELECT 1 FROM store.voucher_claims WHERE run_id=$1 AND cart_id=$2 AND code=$3 AND order_id IS NULL",
          [a.run,c.id,code],
        )).rowCount) throw new HttpError(409,"Voucher already applied to this order");
        return {cartId:c.id,amount:Number(voucher.amount),run:a.run};
      };
      const claim = async (db:DB,a:Actor,checked:{cartId:string;amount:number;run:string}) => {
        // Lock the cart before inserting child claims. PostgreSQL FK checks
        // otherwise acquire KEY SHARE on the cart in multiple transactions,
        // then deadlock when each tries to upgrade to UPDATE.
        // R01 remains vulnerable: the uniqueness check happened in a previous
        // transaction, so serializing this *write* does not re-check the claim.
        await db.query("UPDATE store.carts SET version=version+1 WHERE run_id=$1 AND id=$2",[a.run,checked.cartId]);
        await db.query(
          "INSERT INTO store.voucher_claims(id,run_id,cart_id,code,amount) VALUES($1,$2,$3,$4,$5)",
          [randomUUID(),a.run,checked.cartId,code,checked.amount],
        );
        return cart(db,a);
      };
      const prepared=await transaction(pool,async db=>{
        const a=await actor(db,req,true);
        if(a.profile!=="R01") {
          const checked=await check(db,a,true);
          return {result:await claim(db,a,checked)};
        }
        return {checked:await check(db,a,false)};
      });
      if("result" in prepared) return prepared.result;
      // Intentionally vulnerable race window only in instructor-selected R01.
      await new Promise<void>((resolve)=>setTimeout(resolve,80));
      return transaction(pool,async db=>{
        const a=await actor(db,req,true);
        if(a.profile!=="R01" || a.run!==prepared.checked!.run)
          throw new HttpError(409,"Training run changed during voucher claim");
        return claim(db,a,prepared.checked!);
      });
    });
    userRoute("DELETE","/api/cart/voucher",async(db,a)=>{
      const c=await cart(db,a);
      await db.query("DELETE FROM store.voucher_claims WHERE run_id=$1 AND cart_id=$2 AND order_id IS NULL",[a.run,c.id]);
      await db.query("UPDATE store.carts SET version=version+1 WHERE run_id=$1 AND id=$2",[a.run,c.id]);
      return cart(db,a);
    });
    // A real server-priced quote workflow; the B01 training profile intentionally
    // accepts the amount supplied by the client at the acceptance boundary.
    userRoute("POST", "/api/quotes", async (db, a, req) => {
      const options = z.object({ dock: z.boolean(), support: z.boolean() }).strict().parse(req.body);
      const authorizedPrice = 680000 + (options.dock ? 900000 : 0) + (options.support ? 250000 : 0);
      const id = randomUUID();
      await db.query(
        "INSERT INTO store.quotes(id,run_id,user_id,options,authorized_price) VALUES($1,$2,$3,$4,$5)",
        [id,a.run,a.id,JSON.stringify(options),authorizedPrice],
      );
      return { id, options, authorizedPrice, expiresInSeconds: 3600 };
    });
    userRoute("POST", "/api/quotes/:id/accept", async (db, a, req) => {
      const id = uuid.parse((req.params as {id:string}).id);
      const { quotedTotal } = z.object({quotedTotal:z.number().int().min(1).max(100000000)}).strict().parse(req.body);
      const quote = (await db.query(
        "SELECT * FROM store.quotes WHERE run_id=$1 AND user_id=$2 AND id=$3 FOR UPDATE",
        [a.run,a.id,id],
      )).rows[0];
      if (!quote) throw new HttpError(404, "Quote not found");
      if (quote.accepted_at || new Date(quote.expires_at).getTime() <= Date.now())
        throw new HttpError(409, "Quote expired or already accepted");
      if (a.profile !== "B01" && quotedTotal !== Number(quote.authorized_price))
        throw new HttpError(409, "The quote has changed. Please request a fresh price.");
      const c = await cart(db,a);
      if(a.profile === "B04") {
        await db.query("DELETE FROM store.cart_discount_applications WHERE run_id=$1 AND cart_id=$2 AND order_id IS NULL",[a.run,c.id]);
        await db.query("DELETE FROM store.cart_coupons WHERE run_id=$1 AND cart_id=$2",[a.run,c.id]);
      }
      await db.query("UPDATE store.quotes SET accepted_price=$3,accepted_at=now() WHERE run_id=$1 AND id=$2",
        [a.run,id,quotedTotal]);
      await db.query(
        "INSERT INTO store.cart_items(run_id,cart_id,product_id,quantity) VALUES($1,$2,'vista-27',1) ON CONFLICT(run_id,cart_id,product_id) DO UPDATE SET quantity=1",
        [a.run,c.id],
      );
      await db.query(
        "INSERT INTO store.cart_quotes(run_id,cart_id,product_id,quote_id) VALUES($1,$2,'vista-27',$3) ON CONFLICT(run_id,cart_id,product_id) DO UPDATE SET quote_id=excluded.quote_id",
        [a.run,c.id,id],
      );
      await db.query("UPDATE store.carts SET version=version+1 WHERE run_id=$1 AND id=$2",[a.run,c.id]);
      return cart(db,a);
    });
    const deliverySchema = z.object({
      fullName:z.string().trim().min(2).max(80),
      address:z.string().trim().min(5).max(160),
      city:z.string().trim().min(2).max(80),
    }).strict();
    userRoute("POST","/api/checkout/prepare",async (db,a,req) => {
      const input = z.object({cartVersion:z.number().int().min(0),delivery:deliverySchema}).strict().parse(req.body);
      const c = await cart(db,a);
      if(c.version!==input.cartVersion) throw new HttpError(409,"Your bag changed. Review the updated total.");
      if(!c.items.length || c.total<=0 || !c.couponEligible) throw new HttpError(409,"Your bag is not ready for checkout");
      const id=randomUUID();
      await db.query(
        "INSERT INTO store.checkout_intents(id,run_id,user_id,cart_version,quoted_total,delivery) VALUES($1,$2,$3,$4,$5,$6)",
        [id,a.run,a.id,c.version,c.total,JSON.stringify(input.delivery)],
      );
      return {intentId:id,total:c.total,expiresInSeconds:1800};
    });
    userRoute("POST","/api/checkout/confirm",async (db,a,req)=>{
      const {intentId}=z.object({intentId:uuid}).strict().parse(req.body);
      const intent=(await db.query(
        "SELECT * FROM store.checkout_intents WHERE run_id=$1 AND user_id=$2 AND id=$3 FOR UPDATE",
        [a.run,a.id,intentId],
      )).rows[0];
      if(!intent) throw new HttpError(404,"Checkout request not found");
      if(intent.confirmed_order_id) return order(db,a,intent.confirmed_order_id);
      if(new Date(intent.expires_at).getTime()<=Date.now()) throw new HttpError(409,"Checkout request expired");
      const c=await cart(db,a);
      if(c.version!==intent.cart_version || c.total!==Number(intent.quoted_total))
        throw new HttpError(409,"The checkout details no longer match your bag");
      const previousPaid = a.profile === "B08" && !!(await db.query(
        "SELECT 1 FROM store.payments p JOIN store.orders o ON o.run_id=p.run_id AND o.id=p.order_id WHERE p.run_id=$1 AND o.user_id=$2 LIMIT 1",
        [a.run,a.id],
      )).rowCount;
      // The B08 teaching variant incorrectly equates any previously settled order
      // with payment proof for the *current* intent. All other profiles settle this intent.
      const receipt=await checkout(db,a,{
        cartVersion:intent.cart_version,delivery:intent.delivery,
      },uuid.parse(req.headers["idempotency-key"]),req.id,previousPaid);
      await db.query(
        "UPDATE store.checkout_intents SET confirmed_order_id=$4 WHERE run_id=$1 AND user_id=$2 AND id=$3",
        [a.run,a.id,intentId,receipt.id],
      );
      return receipt;
    });
    userRoute("POST", "/api/checkout", (db, a, req) =>
      checkout(
        db,
        a,
        z
          .object({
            cartVersion: z.number().int().min(0),
            delivery: z
              .object({
                fullName: z.string().trim().min(2).max(80),
                address: z.string().trim().min(5).max(160),
                city: z.string().trim().min(2).max(80),
              })
              .strict(),
          })
          .strict()
          .parse(req.body),
        uuid.parse(req.headers["idempotency-key"]),
        req.id,
      ),
    );
    userRoute("GET", "/api/orders", async (db, a) => ({
      orders: (
        await db.query(
          "SELECT id,order_number,state,total,created_at FROM store.orders WHERE run_id=$1 AND user_id=$2 ORDER BY created_at DESC",
          [a.run, a.id],
        )
      ).rows,
    }));
    userRoute("GET", "/api/orders/:id", (db, a, req) =>
      order(db, a, uuid.parse((req.params as { id: string }).id)),
    );
    userRoute("POST", "/api/orders/:id/refund", (db, a, req) =>
      refund(db, a, uuid.parse((req.params as { id: string }).id)),
    );
    userRoute("GET", "/api/wallet", async (db, a) => {
      const account = (
        await db.query(
          "SELECT id,balance FROM store.accounts WHERE run_id=$1 AND user_id=$2",
          [a.run, a.id],
        )
      ).rows[0];
      return {
        balance: Number(account.balance),
        transactions: (
          await db.query(
            "SELECT e.id,e.amount,j.kind,j.reference,j.created_at FROM store.entries e JOIN store.journals j ON j.run_id=e.run_id AND j.id=e.journal_id WHERE e.run_id=$1 AND e.account_id=$2 ORDER BY e.id DESC",
            [a.run, account.id],
          )
        ).rows,
      };
    });
    userRoute("POST", "/api/gift-cards/redeem", (db, a, req) =>
      redeem(
        db,
        a,
        z
          .object({
            code: z
              .string()
              .trim()
              .toUpperCase()
              .regex(/^RVU-[A-F0-9]{24}$/),
          })
          .strict()
          .parse(req.body).code,
      ),
    );
    registerExtendedLabs({app,pool,userRoute,actor});
  } else {
    async function instructor(db: DB, req: FastifyRequest) {
      const s = (
        await db.query(
          "SELECT * FROM control.sessions WHERE token_hash=$1 AND expires_at>now()",
          [hash(req.cookies[cname] ?? "")],
        )
      ).rows[0];
      if (!s) throw new HttpError(401, "Instructor sign-in required");
      if (req.method !== "GET" && req.headers["x-csrf-token"] !== s.csrf)
        throw new HttpError(403, "Invalid session token");
      return s;
    }
    app.post(
      "/api/instructor/login",
      { config: { rateLimit: { max: 5, timeWindow: "1 minute" } } },
      async (req, reply) => {
        const input = z
          .object({
            username: z.string().max(80),
            password: z.string().max(128),
          })
          .strict()
          .parse(req.body);
        return transaction(pool, async (db) => {
          const u = (
            await db.query(
              "SELECT * FROM control.instructors WHERE username=$1",
              [input.username],
            )
          ).rows[0];
          if (!u || !(await passwordValid(input.password, u.password_hash)))
            throw new HttpError(401, "Invalid instructor credentials");
          const raw = token(),
            csrf = token();
          await db.query(
            "INSERT INTO control.sessions VALUES($1,$2,$3,now()+interval '2 hours')",
            [hash(raw), u.id, csrf],
          );
          setSession(reply, raw);
          return { csrf };
        });
      },
    );
    app.get("/api/instructor/session", (req) =>
      transaction(pool, async (db) => {
        const s = await instructor(db, req);
        return {
          csrf: s.csrf,
          run: await activeRun(db),
          profile: (await db.query("SELECT profile FROM store.runs WHERE id=$1",[await activeRun(db)])).rows[0].profile,
          users: Number(
            (
              await db.query(
                "SELECT count(*) FROM store.users WHERE run_id=$1",
                [await activeRun(db)],
              )
            ).rows[0].count,
          ),
        };
      }),
    );
    app.get("/api/instructor/evidence", (req) =>
      transaction(pool, async (db) => {
        await instructor(db,req);
        const run = await activeRun(db);
        const profile = (await db.query("SELECT profile FROM store.runs WHERE id=$1",[run])).rows[0].profile;
        const quoteMismatch = Number((await db.query(
          "SELECT count(DISTINCT i.order_id) AS n FROM store.order_items i JOIN store.quotes q ON q.run_id=i.run_id AND q.id=i.quote_id WHERE i.run_id=$1 AND i.unit_price<>q.authorized_price",
          [run],
        )).rows[0].n);
        const repeatedPromotion = Number((await db.query(
          "SELECT count(*) AS n FROM (SELECT order_id,code FROM store.cart_discount_applications WHERE run_id=$1 AND order_id IS NOT NULL GROUP BY order_id,code HAVING count(*)>1) misuse",
          [run],
        )).rows[0].n);
        const repeatedVoucher = Number((await db.query(
          "SELECT count(*) AS n FROM (SELECT order_id,code FROM store.voucher_claims WHERE run_id=$1 AND order_id IS NOT NULL GROUP BY order_id,code HAVING count(*)>1) repeated",
          [run],
        )).rows[0].n);
        const unpaidConfirmed = Number((await db.query(
          "SELECT count(*) AS n FROM store.orders o LEFT JOIN store.payments p ON p.run_id=o.run_id AND p.order_id=o.id WHERE o.run_id=$1 AND o.state='confirmed' AND p.id IS NULL",
          [run],
        )).rows[0].n);
        const giftProfit = Number((await db.query(
          `SELECT count(DISTINCT a.user_id) AS n FROM store.accounts a
           WHERE a.run_id=$1 AND a.purpose='wallet' AND a.balance>1500000
           AND EXISTS(SELECT 1 FROM store.gift_cards g JOIN store.orders o ON o.run_id=g.run_id AND o.id=g.order_id
                      WHERE g.run_id=$1 AND g.redeemed_by=a.user_id AND o.discount>0)`,
          [run],
        )).rows[0].n);
        const extra=(await db.query(
          "SELECT scenario,count(DISTINCT user_id)::int AS solved FROM store.lab_evidence WHERE run_id=$1 AND kind<>'partial-confirm' GROUP BY scenario",
          [run],
        )).rows as {scenario:string;solved:number}[];
        const training=Object.fromEntries(Object.keys(extendedLabels).map(k=>[k,0])) as Record<string,number>;
        for(const row of extra)if(row.scenario in training)training[row.scenario]=Number(row.solved);
        return {run,profile,metrics:{B01:quoteMismatch,B04:repeatedPromotion,B08:unpaidConfirmed,B10:giftProfit,R01:repeatedVoucher,...training}};
      }),
    );
    app.get("/api/instructor/evidence/events", (req) =>
      transaction(pool,async db=>{
        await instructor(db,req);
        const run=await activeRun(db);
        const events=(await db.query(
          "SELECT scenario,kind,detail,created_at FROM store.lab_evidence WHERE run_id=$1 ORDER BY created_at DESC,id DESC LIMIT 100",
          [run],
        )).rows;
        return {run,events};
      }),
    );
    app.post("/api/instructor/reset", (req) =>
      transaction(
        pool,
        async (db) => {
          await instructor(db, req);
          const options = z.object({
            confirm: z.literal("RESET"),
            profile: z.enum(activeTrainingProfiles).default("secure-baseline"),
          }).strict().parse(req.body);
          await db.query("UPDATE store.runs SET closed_at=now() WHERE id=$1", [
            await activeRun(db),
          ]);
          const run = await newRun(db,options.profile);
          return { run, profile: options.profile };
        },
        true,
      ),
    );
    app.post("/api/instructor/logout", (req) =>
      transaction(pool, async (db) => {
        await instructor(db, req);
        await db.query("DELETE FROM control.sessions WHERE token_hash=$1", [
          hash(req.cookies[cname] ?? ""),
        ]);
        return { signedOut: true };
      }),
    );
  }
  if (config.webRoot) {
    await app.register(serveStatic, { root: config.webRoot });
    app.setNotFoundHandler((req, reply) =>
      req.url.startsWith("/api/")
        ? reply.code(404).send({ error: "Not found" })
        : reply.sendFile("index.html"),
    );
  }
  app.addHook("onClose", () => pool.end());
  return { app, pool };
}
