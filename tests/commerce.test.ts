import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { migrate } from "../apps/api/src/migrate.ts";
import { buildApp } from "../apps/api/src/app.ts";
import { transaction, createPool } from "../apps/api/src/db.ts";
import { SMTPServer } from "smtp-server";
import { deliverMail } from "../apps/api/src/mail.ts";
let wasm: PGlite | undefined, socket: PGLiteSocketServer | undefined;
let store: Awaited<ReturnType<typeof buildApp>>,
  control: Awaited<ReturnType<typeof buildApp>>;
let url = process.env.TEST_DATABASE_URL ?? "";
const origin = "http://localhost:8080",
  adminOrigin = "http://127.0.0.1:8081",
  password = "Local-Instructor-Test-2026!";
type Client = { cookie: string; csrf: string };
const alex: Client = { cookie: "", csrf: "" },
  bob: Client = { cookie: "", csrf: "" },
  admin: Client = { cookie: "", csrf: "" };
async function request(
  client: Client,
  method: string,
  path: string,
  body?: unknown,
  status = 200,
  extra: Record<string, string> = {},
) {
  const isAdmin = path.startsWith("/api/instructor"),
    app = isAdmin ? control.app : store.app;
  const r = await app.inject({
    method: method as "GET",
    url: path,
    headers: {
      origin: isAdmin ? adminOrigin : origin,
      cookie: client.cookie,
      "x-csrf-token": client.csrf,
      ...extra,
    },
    ...(body === undefined ? {} : { payload: body as object }),
  });
  assert.equal(r.statusCode, status, `${method} ${path}: ${r.body}`);
  const cookie = r.headers["set-cookie"];
  if (cookie)
    client.cookie = (Array.isArray(cookie) ? cookie[0] : cookie).split(";")[0];
  const data = r.json();
  if (data.csrf) client.csrf = data.csrf;
  return data;
}
before(async () => {
  if (!url) {
    wasm = await PGlite.create();
    socket = new PGLiteSocketServer({
      db: wasm,
      host: "127.0.0.1",
      port: 0,
      maxConnections: 10,
    });
    await socket.start();
    url =
      "postgresql://postgres:postgres@" + socket.getServerConn() + "/postgres";
  }
  const bootstrap = createPool(url);
  await bootstrap.query(
    "DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='rvu_store') THEN CREATE ROLE rvu_store; END IF; IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='rvu_control') THEN CREATE ROLE rvu_control; END IF; END $$",
  );
  await bootstrap.end();
  await migrate(url, password);
  await migrate(url, password);
  store = await buildApp({
    databaseUrl: url,
    origin,
    cookieSecure: false,
    mode: "store",
  });
  control = await buildApp({
    databaseUrl: url,
    origin: adminOrigin,
    cookieSecure: false,
    mode: "control",
  });
  store.pool.options.verify = (client, done) => {
    void client.query("SET ROLE rvu_store").then(() => done(), done);
  };
  control.pool.options.verify = (client, done) => {
    void client.query("SET ROLE rvu_control").then(() => done(), done);
  };

});
after(async () => {
  await store?.app.close();
  await control?.app.close();
  await socket?.stop();
  await wasm?.close();
});
test("catalog is reproducible and instructor routes are absent from student service", async () => {
  const c = await request(alex, "GET", "/api/catalog");
  assert.equal(c.products.length, 8);
  assert.equal(c.promotions.length, 2);
  const r = await store.app.inject({
    method: "POST",
    url: "/api/instructor/login",
    headers: { origin },
    payload: { username: "instructor", password },
  });
  assert.equal(r.statusCode, 404);
});
test("register → private inbox → email verification → wallet", async () => {
  await request(bob, "POST", "/api/register", {
    name: "Morgan Ellis",
    email: "morgan@learner.rvu.test",
    password: "Fictional-Pass-2026!",
  });
  await request(bob, "GET", "/api/cart", undefined, 403);
  const inbox = await request(bob, "GET", "/api/inbox");
  assert.equal(inbox.messages.length, 1);
  const code = inbox.messages[0].body.split(": ")[1];
  await request(bob, "POST", "/api/verify", { code });
  await request(bob, "POST", "/api/verify", { code }, 400);
  const wallet = await request(bob, "GET", "/api/wallet");
  assert.equal(wallet.balance, 1500000);
  assert.equal(wallet.transactions.length, 1);
  await request(alex, "POST", "/api/login", {
    email: "alex@learner.rvu.test",
    password: "Studio-Local-2026!",
  });
  assert.equal((await request(alex, "GET", "/api/inbox")).messages.length, 0);
});
test("origin, CSRF, server prices, quantity and strict body validation", async () => {
  await request(
    alex,
    "PUT",
    "/api/cart/items",
    { productId: "form-75", quantity: 1 },
    403,
    { origin: "http://untrusted.test" },
  );
  await request(
    alex,
    "PUT",
    "/api/cart/items",
    { productId: "form-75", quantity: 1 },
    403,
    { "x-csrf-token": "bad" },
  );
  await request(
    alex,
    "PUT",
    "/api/cart/items",
    { productId: "form-75", quantity: -1 },
    400,
  );
  await request(
    alex,
    "PUT",
    "/api/cart/items",
    { productId: "form-75", quantity: 1, price: 1 },
    400,
  );
  assert.equal((await request(alex, "GET", "/api/cart")).items.length, 0);
});
test("transactional outbox delivers a real SMTP message and marks it sent once", async () => {
  const received: string[] = [];
  const smtp = new SMTPServer({
    authOptional: true,
    disabledCommands: ["STARTTLS"],
    onData(stream, _session, callback) {
      let message = "";
      stream.on("data", (chunk) => (message += chunk));
      stream.on("end", () => {
        received.push(message);
        callback();
      });
    },
  });
  await new Promise<void>((resolve) => smtp.listen(0, "127.0.0.1", resolve));
  try {
    const address = smtp.server.address() as { port: number };
    assert.equal(await deliverMail(store.pool, "127.0.0.1", address.port), 1);
    assert.equal(await deliverMail(store.pool, "127.0.0.1", address.port), 0);
    assert.equal(received.length, 1);
    assert.match(received[0], /morgan@learner\.rvu\.test/);
    assert.match(received[0], /verification code/);
  } finally {
    await new Promise<void>((resolve) => smtp.close(resolve));
  }
});
let orderId = "";
test("cart → one coupon → checkout → one settlement → order → idempotent refund", async () => {
  await request(alex, "PUT", "/api/cart/items", {
    productId: "form-75",
    quantity: 1,
  });
  const c = await request(alex, "POST", "/api/cart/coupon", {
    code: "WELCOME10",
  });
  assert.equal(c.total, 198000);
  await request(alex, "POST", "/api/cart/coupon", { code: "STUDIO15" }, 409);
  const body = {
      cartVersion: c.version,
      delivery: {
        fullName: "Alex Rowan",
        address: "12 Fictional Studio Lane",
        city: "Sample City",
      },
    },
    key = randomUUID();
  const o = await request(alex, "POST", "/api/checkout", body, 200, {
    "idempotency-key": key,
  });
  orderId = o.id;
  assert.equal(Number(o.total), 198000);
  assert.equal(o.state, "confirmed");
  assert.equal(
    (
      await request(alex, "POST", "/api/checkout", body, 200, {
        "idempotency-key": key,
      })
    ).id,
    o.id,
  );
  await request(
    alex,
    "POST",
    "/api/checkout",
    { ...body, cartVersion: 999 },
    409,
    { "idempotency-key": key },
  );
  assert.equal((await request(alex, "GET", "/api/wallet")).balance, 1302000);
  await request(bob, "GET", `/api/orders/${o.id}`, undefined, 404);
  await request(bob, "POST", `/api/orders/${o.id}/refund`, {}, 404);
  await request(alex, "POST", `/api/orders/${o.id}/refund`, {});
  await request(alex, "POST", `/api/orders/${o.id}/refund`, {});
  assert.equal((await request(alex, "GET", "/api/wallet")).balance, 1500000);
  await request(alex, "PUT", "/api/cart/items", {
    productId: "form-75",
    quantity: 1,
  });
  await request(alex, "POST", "/api/cart/coupon", { code: "WELCOME10" }, 409);
  await request(alex, "PUT", "/api/cart/items", {
    productId: "form-75",
    quantity: 0,
  });
});
test("stale cart and insufficient wallet fail atomically", async () => {
  const c = await request(alex, "PUT", "/api/cart/items", {
    productId: "vista-27",
    quantity: 3,
  });
  const body = {
    cartVersion: c.version,
    delivery: {
      fullName: "Alex Rowan",
      address: "12 Fictional Studio Lane",
      city: "Sample City",
    },
  };
  await request(
    alex,
    "POST",
    "/api/checkout",
    { ...body, cartVersion: c.version - 1 },
    409,
    { "idempotency-key": randomUUID() },
  );
  await request(alex, "POST", "/api/checkout", body, 409, {
    "idempotency-key": randomUUID(),
  });
  assert.equal((await request(alex, "GET", "/api/orders")).orders.length, 1);
  assert.equal((await request(alex, "GET", "/api/wallet")).balance, 1500000);
  await request(alex, "PUT", "/api/cart/items", {
    productId: "vista-27",
    quantity: 0,
  });
});
test("gift card face value → purchase → different owner redemption exactly once", async () => {
  const c = await request(alex, "PUT", "/api/cart/items", {
    productId: "gift-500",
    quantity: 1,
  });
  await request(alex, "POST", "/api/cart/coupon", { code: "WELCOME10" }, 409);
  const o = await request(
    alex,
    "POST",
    "/api/checkout",
    {
      cartVersion: c.version,
      delivery: {
        fullName: "Alex Rowan",
        address: "12 Fictional Studio Lane",
        city: "Sample City",
      },
    },
    200,
    { "idempotency-key": randomUUID() },
  );
  const code = o.giftCards[0].code;
  assert.equal(Number(o.total), 50000);
  await request(alex, "POST", `/api/orders/${o.id}/refund`, {}, 409);
  await request(bob, "POST", "/api/gift-cards/redeem", { code });
  await request(alex, "POST", "/api/gift-cards/redeem", { code }, 409);
  assert.equal((await request(bob, "GET", "/api/wallet")).balance, 1550000);
  assert.equal((await request(alex, "GET", "/api/wallet")).balance, 1450000);
});
test("database ledger is balanced, immutable and rejects incomplete journals", async () => {
  const q = await store.pool.query(
    "SELECT journal_id FROM store.entries GROUP BY journal_id HAVING sum(amount)!=0",
  );
  assert.equal(q.rowCount, 0);
  const mismatch = await store.pool.query(
    "SELECT a.id FROM store.accounts a LEFT JOIN store.entries e ON e.run_id=a.run_id AND e.account_id=a.id GROUP BY a.run_id,a.id HAVING a.balance!=coalesce(sum(e.amount),0)",
  );
  assert.equal(mismatch.rowCount, 0);
  await assert.rejects(
    store.pool.query("UPDATE store.entries SET amount=amount+1"),
    /append-only|permission denied/,
  );
  await assert.rejects(
    transaction(store.pool, async (db) => {
      await db.query(
        "INSERT INTO store.journals(id,run_id,kind,reference) SELECT $1,active_run,'purchase','invalid' FROM store.runtime",
        [randomUUID()],
      );
    }),
    /Unbalanced journal/,
  );
});
test("instructor database role cannot modify catalog or student orders", async () => {
  await assert.rejects(
    control.pool.query("UPDATE store.products SET price=price WHERE id='vista-27'"),
    /permission denied/,
  );
  await assert.rejects(
    control.pool.query("UPDATE store.orders SET state=state"),
    /permission denied/,
  );
});
test("database role cannot read instructor credentials or change catalog prices", async () => {
  await assert.rejects(
    store.pool.query("SELECT * FROM control.instructors"),
    /permission denied/,
  );
  await assert.rejects(
    store.pool.query("UPDATE store.products SET price=1"),
    /permission denied/,
  );
  await assert.rejects(
    store.pool.query("UPDATE store.runtime SET active_run=active_run"),
    /permission denied/,
  );
});
test(
  "native PostgreSQL gate: two HTTP requests hold independent simultaneous transactions",
  {
    skip: !process.env.TEST_DATABASE_URL
      ? "PGlite is not evidence of independent PostgreSQL sessions"
      : false,
  },
  async () => {
    let arrivals = 0;
    let unlock!: () => void;
    const barrier = new Promise<void>((r) => (unlock = r));
    // Separate test server; never installed in the shipped application.
    const fastify = (await import("fastify")).default;
    const probe = fastify();
    probe.get("/probe", () =>
      transaction(store.pool, async (db) => {
        const p = (await db.query("SELECT pg_backend_pid() AS pid")).rows[0]
          .pid;
        arrivals++;
        if (arrivals === 2) unlock();
        await Promise.race([
          barrier,
          new Promise((_, reject) =>
            setTimeout(
              () => reject(new Error("Transactions were serialized")),
              2000,
            ),
          ),
        ]);
        return { pid: p };
      }),
    );
    await probe.listen({ host: "127.0.0.1", port: 0 });
    try {
      const addr = probe.server.address() as { port: number };
      const responses = await Promise.all([
        fetch(`http://127.0.0.1:${addr.port}/probe`),
        fetch(`http://127.0.0.1:${addr.port}/probe`),
      ]);
      assert.ok(responses.every((r) => r.ok));
      const [a, b] = (await Promise.all(responses.map((r) => r.json()))) as {
        pid: number;
      }[];
      assert.notEqual(a.pid, b.pid);
    } finally {
      await probe.close();
    }
  },
);
test("instructor boundary and reset invalidate every old run session and object", async () => {
  await request(admin, "POST", "/api/instructor/login", {
    username: "instructor",
    password,
  });
  await request(
    alex,
    "POST",
    "/api/instructor/reset",
    { confirm: "RESET" },
    401,
  );
  const old = (await request(admin, "GET", "/api/instructor/session")).run;
  const next = await request(admin, "POST", "/api/instructor/reset", {
    confirm: "RESET",
  });
  assert.notEqual(next.run, old);
  assert.equal((await request(alex, "GET", "/api/session")).user, null);
  await request(bob, "GET", "/api/inbox", undefined, 401);
  await request(alex, "POST", "/api/login", {
    email: "alex@learner.rvu.test",
    password: "Studio-Local-2026!",
  });
  assert.equal((await request(alex, "GET", "/api/wallet")).balance, 1500000);
  await request(alex, "GET", `/api/orders/${orderId}`, undefined, 404);
});
test(
  "native PostgreSQL gate: parallel coupons and checkout settle once",
  {
    skip: !process.env.TEST_DATABASE_URL ? "Requires native PostgreSQL" : false,
  },
  async () => {
    await request(alex, "PUT", "/api/cart/items", {
      productId: "vista-27",
      quantity: 1,
    });
    await store.app.listen({ host: "127.0.0.1", port: 0 });
    const addr = store.app.server.address() as { port: number };
    const post = (
      path: string,
      body: unknown,
      headers: Record<string, string> = {},
    ) =>
      fetch(`http://127.0.0.1:${addr.port}${path}`, {
        method: "POST",
        headers: {
          origin,
          cookie: alex.cookie,
          "x-csrf-token": alex.csrf,
          "content-type": "application/json",
          ...headers,
        },
        body: JSON.stringify(body),
      });
    const coupons = await Promise.all(
      Array.from({ length: 12 }, () =>
        post("/api/cart/coupon", { code: "STUDIO15" }),
      ),
    );
    assert.equal(coupons.filter((r) => r.status === 200).length, 1);
    assert.equal(coupons.filter((r) => r.status === 409).length, 11);
    const c = await request(alex, "GET", "/api/cart"),
      key = randomUUID();
    const checkouts = await Promise.all(
      Array.from({ length: 12 }, () =>
        post(
          "/api/checkout",
          {
            cartVersion: c.version,
            delivery: {
              fullName: "Alex Rowan",
              address: "12 Fictional Studio Lane",
              city: "Sample City",
            },
          },
          { "idempotency-key": key },
        ),
      ),
    );
    assert.ok(checkouts.every((r) => r.status === 200));
    const values = (await Promise.all(checkouts.map((r) => r.json()))) as {
      id: string;
    }[];
    assert.equal(new Set(values.map((v) => v.id)).size, 1);
    assert.equal((await request(alex, "GET", "/api/wallet")).balance, 922000);
  },
);

test("B01 scenario is instructor-selected: secure quote rejects tampering, lab quote can underpay and records evidence", async () => {
  const safeQuote = await request(alex,"POST","/api/quotes",{dock:true,support:true});
  assert.equal(safeQuote.authorizedPrice,1830000);
  await request(alex,"POST",`/api/quotes/${safeQuote.id}/accept`,{quotedTotal:90000},409);
  await request(admin,"POST","/api/instructor/reset",{confirm:"RESET",profile:"B01"});
  await request(alex,"POST","/api/login",{email:"alex@learner.rvu.test",password:"Studio-Local-2026!"});
  const q = await request(alex,"POST","/api/quotes",{dock:true,support:true});
  const c = await request(alex,"POST",`/api/quotes/${q.id}/accept`,{quotedTotal:90000});
  assert.equal(c.total,90000);
  assert.equal(c.items[0].quote_id,q.id);
  const receipt = await request(alex,"POST","/api/checkout",{
    cartVersion:c.version,
    delivery:{fullName:"Alex Rowan",address:"12 Fictional Studio Lane",city:"Sample City"},
  },200,{"idempotency-key":randomUUID()});
  assert.equal(Number(receipt.total),90000);
  assert.equal(receipt.items[0].quote_id,q.id);
  const evidence = await request(admin,"GET","/api/instructor/evidence");
  assert.equal(evidence.profile,"B01");
  assert.equal(evidence.metrics.B01,1);
});

test("B04 scenario enforces immediate duplicate but loses history across alternating codes", async () => {
  await request(admin,"POST","/api/instructor/reset",{confirm:"RESET",profile:"B04"});
  await request(alex,"POST","/api/login",{email:"alex@learner.rvu.test",password:"Studio-Local-2026!"});
  await request(alex,"PUT","/api/cart/items",{productId:"vista-27",quantity:1});
  await request(alex,"POST","/api/cart/coupon",{code:"WELCOME10"});
  await request(alex,"POST","/api/cart/coupon",{code:"WELCOME10"},409);
  await request(alex,"POST","/api/cart/coupon",{code:"STUDIO15"});
  const c = await request(alex,"POST","/api/cart/coupon",{code:"WELCOME10"});
  assert.equal(c.applications.length,3);
  assert.equal(c.total,442000);
  const receipt = await request(alex,"POST","/api/checkout",{
    cartVersion:c.version,
    delivery:{fullName:"Alex Rowan",address:"12 Fictional Studio Lane",city:"Sample City"},
  },200,{"idempotency-key":randomUUID()});
  assert.equal(Number(receipt.discount),238000);
  assert.equal((await request(admin,"GET","/api/instructor/evidence")).metrics.B04,1);
});

test("B10 scenario allows repeat gift card promotion, once-only redemption and net positive wallet value", async () => {
  await request(admin,"POST","/api/instructor/reset",{confirm:"RESET",profile:"B10"});
  await request(alex,"POST","/api/login",{email:"alex@learner.rvu.test",password:"Studio-Local-2026!"});
  const catalog = await request(alex,"GET","/api/catalog");
  assert.ok(catalog.promotions.some((p: {code:string})=>p.code==="GIFT20"));
  for (let i=0;i<2;i++) {
    await request(alex,"PUT","/api/cart/items",{productId:"gift-500",quantity:1});
    const c=await request(alex,"POST","/api/cart/coupon",{code:"GIFT20"});
    assert.equal(c.total,40000);
    const receipt=await request(alex,"POST","/api/checkout",{
      cartVersion:c.version,
      delivery:{fullName:"Alex Rowan",address:"12 Fictional Studio Lane",city:"Sample City"},
    },200,{"idempotency-key":randomUUID()});
    const code=receipt.giftCards[0].code;
    assert.equal((await request(alex,"POST","/api/gift-cards/redeem",{code})).amount,50000);
    await request(alex,"POST","/api/gift-cards/redeem",{code},409);
  }
  assert.equal((await request(alex,"GET","/api/wallet")).balance,1520000);
  assert.equal((await request(admin,"GET","/api/instructor/evidence")).metrics.B10,1);
  await request(admin,"POST","/api/instructor/reset",{confirm:"RESET",profile:"secure-baseline"});
  await request(alex,"POST","/api/login",{email:"alex@learner.rvu.test",password:"Studio-Local-2026!"});
  await request(alex,"PUT","/api/cart/items",{productId:"gift-500",quantity:1});
  await request(alex,"POST","/api/cart/coupon",{code:"GIFT20"},404);
  assert.equal((await request(admin,"GET","/api/instructor/evidence")).metrics.B10,0);
});

test("B08 scenario: legitimate payment proof for one order is wrongly reused to confirm another", async () => {
  await request(admin,"POST","/api/instructor/reset",{confirm:"RESET",profile:"B08"});
  await request(alex,"POST","/api/login",{email:"alex@learner.rvu.test",password:"Studio-Local-2026!"});
  const first=await request(alex,"PUT","/api/cart/items",{productId:"arc-light",quantity:1});
  await request(alex,"POST","/api/checkout",{
    cartVersion:first.version,
    delivery:{fullName:"Alex Rowan",address:"12 Fictional Studio Lane",city:"Sample City"},
  },200,{"idempotency-key":randomUUID()});
  const before=(await request(alex,"GET","/api/wallet")).balance;
  assert.equal(before,1360000);
  const expensive=await request(alex,"PUT","/api/cart/items",{productId:"vista-27",quantity:3});
  const intent=await request(alex,"POST","/api/checkout/prepare",{
    cartVersion:expensive.version,
    delivery:{fullName:"Alex Rowan",address:"12 Fictional Studio Lane",city:"Sample City"},
  });
  const order=await request(alex,"POST","/api/checkout/confirm",{
    intentId:intent.intentId,
  },200,{"idempotency-key":randomUUID()});
  assert.equal(Number(order.total),2040000);
  assert.equal(order.payment_state,"unsettled");
  assert.equal((await request(alex,"GET","/api/wallet")).balance,before);
  await request(alex,"POST",`/api/orders/${order.id}/refund`,{},409);
  assert.equal((await request(admin,"GET","/api/instructor/evidence")).metrics.B08,1);
  await request(admin,"POST","/api/instructor/reset",{confirm:"RESET",profile:"secure-baseline"});
  await request(alex,"POST","/api/login",{email:"alex@learner.rvu.test",password:"Studio-Local-2026!"});
  const safe=await request(alex,"PUT","/api/cart/items",{productId:"arc-light",quantity:1});
  const safeIntent=await request(alex,"POST","/api/checkout/prepare",{
    cartVersion:safe.version,
    delivery:{fullName:"Alex Rowan",address:"12 Fictional Studio Lane",city:"Sample City"},
  });
  assert.equal((await request(alex,"POST","/api/checkout/confirm",{
    intentId:safeIntent.intentId,
  },200,{"idempotency-key":randomUUID()})).payment_state,"settled");
});

test("Baseline voucher claim is atomic for consecutive requests", async () => {
  const c=await request(alex,"PUT","/api/cart/items",{productId:"form-75",quantity:1});
  const voucher=await request(alex,"POST","/api/cart/voucher",{code:"STUDIO300"});
  assert.equal(voucher.total,190000);
  assert.equal(voucher.vouchers.length,1);
  await request(alex,"POST","/api/cart/voucher",{code:"STUDIO300"},409);
  await request(admin,"POST","/api/instructor/reset",{confirm:"RESET",profile:"secure-baseline"});
});

test("Native PostgreSQL R01 gate: parallel claims beat the sequential voucher check",{
  skip:!process.env.TEST_DATABASE_URL ? "Requires native PostgreSQL; not inferable from the PGlite socket" : false,
},async()=>{
  await request(admin,"POST","/api/instructor/reset",{confirm:"RESET",profile:"R01"});
  await request(alex,"POST","/api/login",{email:"alex@learner.rvu.test",password:"Studio-Local-2026!"});
  const c=await request(alex,"PUT","/api/cart/items",{productId:"vista-27",quantity:1});
  const voucherRequests=await Promise.all(Array.from({length:4},()=>store.app.inject({
    method:"POST",url:"/api/cart/voucher",
    headers:{origin,cookie:alex.cookie,"x-csrf-token":alex.csrf},
    payload:{code:"STUDIO300"},
  })));
  assert.ok(voucherRequests.filter((r)=>r.statusCode===200).length>1,
    "Expected at least two claims within the intentional R01 overlap window");
  const bag=await request(alex,"GET","/api/cart");
  assert.ok(bag.discount>=60000);
  const purchase=await request(alex,"POST","/api/checkout",{
    cartVersion:bag.version,
    delivery:{fullName:"Alex Rowan",address:"12 Fictional Studio Lane",city:"Sample City"},
  },200,{"idempotency-key":randomUUID()});
  assert.ok(Number(purchase.discount)>=60000);
  assert.equal((await request(admin,"GET","/api/instructor/evidence")).metrics.R01,1);
});
