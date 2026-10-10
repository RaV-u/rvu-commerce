import { randomUUID } from "node:crypto";
import type { DB } from "./db.ts";
import { passwordHash } from "./security.ts";
import { baseline, type TrainingProfile } from "./policy.ts";
export const products = [
  [
    "vista-27",
    "Vista 27 Studio Display",
    "Displays",
    "A quiet canvas for your best work. A crisp 27-inch 4K display with an adjustable aluminium stand.",
    6800,
    "physical",
    "monitor",
    "The studio essential",
    ["27-inch 4K panel", "USB-C connectivity", "Height-adjustable stand"],
  ],
  [
    "form-75",
    "Form 75 Mechanical Keyboard",
    "Desk essentials",
    "A compact layout, tactile switches and warm, considered details. Made for the hours that matter.",
    2200,
    "physical",
    "keyboard",
    "Bestseller",
    ["75% layout", "Hot-swappable switches", "USB-C wired connection"],
  ],
  [
    "hush-pro",
    "Hush Pro Headphones",
    "Audio",
    "Find your focus. Over-ear comfort and a balanced sound for the working day.",
    5200,
    "physical",
    "headphones",
    "New arrival",
    ["Over-ear design", "Wireless audio", "USB-C charging"],
  ],
  [
    "arc-light",
    "Arc Task Light",
    "Desk essentials",
    "A sculptural pool of warm light. Adjust the angle and make a little room for focus.",
    1400,
    "physical",
    "lamp",
    "",
    ["Warm adjustable light", "Aluminium construction", "Weighted base"],
  ],
  [
    "bridge-8",
    "Bridge 8 USB-C Hub",
    "Connectivity",
    "One small hub. A tidier desk. Connect the essentials and get back to what you do best.",
    1650,
    "physical",
    "hub",
    "",
    ["8 connection ports", "HDMI output", "USB-C pass-through"],
  ],
  [
    "lift-stand",
    "Lift Laptop Stand",
    "Desk essentials",
    "A better angle for everyday work. Folded aluminium with a soft, protective finish.",
    950,
    "physical",
    "stand",
    "",
    ["Aluminium frame", "Non-slip pads", "Fits up to 16-inch laptops"],
  ],
  [
    "field-pack",
    "Field Everyday Backpack",
    "On the move",
    "For the commute, the coffee shop and everything between. Thoughtful storage in a clean silhouette.",
    1900,
    "physical",
    "bag",
    "",
    ["18-litre capacity", "Padded laptop sleeve", "Water-resistant fabric"],
  ],
  [
    "gift-500",
    "The RVU Gift Card",
    "Gift cards",
    "Give someone room to choose. EGP 500 of store value, delivered to your account after purchase.",
    500,
    "gift_card",
    "gift",
    "A thoughtful choice",
    [
      "EGP 500 face value",
      "Redeem once to a wallet",
      "No expiry on store credit",
    ],
  ],
] as const;
export async function seedCatalog(db: DB) {
  for (const p of products)
    await db.query(
      "INSERT INTO store.products(id,name,category,description,price,kind,image,badge,specs) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT(id) DO UPDATE SET price=EXCLUDED.price",
      [
        ...p.slice(0, 6),
        "/products/" + p[6] + ".svg",
        p[7],
        JSON.stringify(p[8]),
      ],
    );
  await db.query(
    "INSERT INTO store.promotions VALUES('WELCOME10',10,1000,'10% off physical products on an eligible order of EGP 1,000 or more. Once per account.'),('STUDIO15',15,5000,'15% off physical products on an eligible order of EGP 5,000 or more. Once per account.') ON CONFLICT(code) DO UPDATE SET minimum=EXCLUDED.minimum",
  );
}
export async function transfer(
  db: DB,
  run: string,
  kind: string,
  reference: string,
  from: string,
  to: string,
  amount: number,
) {
  const id = randomUUID();
  await db.query(
    "INSERT INTO store.journals(id,run_id,kind,reference) VALUES($1,$2,$3,$4)",
    [id, run, kind, reference],
  );
  await db.query(
    "UPDATE store.accounts SET balance=balance-$3 WHERE run_id=$1 AND id=$2",
    [run, from, amount],
  );
  await db.query(
    "UPDATE store.accounts SET balance=balance+$3 WHERE run_id=$1 AND id=$2",
    [run, to, amount],
  );
  await db.query(
    "INSERT INTO store.entries(run_id,journal_id,account_id,amount) VALUES($1,$2,$3,$5),($1,$2,$4,-$5)",
    [run, id, to, from, amount],
  );
  return id;
}
export async function createCustomer(
  db: DB,
  run: string,
  name: string,
  email: string,
  password: string,
  verified = false,
) {
  const id = randomUUID(),
    wallet = randomUUID();
  await db.query(
    "INSERT INTO store.users(id,run_id,name,email,password_hash,verified) VALUES($1,$2,$3,$4,$5,$6)",
    [id, run, name, email, password, verified],
  );
  await db.query("INSERT INTO store.mailboxes VALUES($1,$2,$3)", [
    run,
    id,
    email,
  ]);
  await db.query(
    "INSERT INTO store.accounts(id,run_id,user_id,purpose) VALUES($1,$2,$3,'wallet')",
    [wallet, run, id],
  );
  await db.query(
    "INSERT INTO store.carts(id,run_id,user_id) VALUES($1,$2,$3)",
    [randomUUID(), run, id],
  );
  const treasury = (
    await db.query(
      "SELECT id FROM store.accounts WHERE run_id=$1 AND purpose='treasury'",
      [run],
    )
  ).rows[0].id;
  await transfer(
    db,
    run,
    "opening",
    id,
    treasury,
    wallet,
    baseline.openingCredit,
  );
  return { id, name, email, verified };
}
export async function newRun(db: DB, profile: TrainingProfile = "secure-baseline") {
  const id = randomUUID();
  await db.query("INSERT INTO store.runs(id,profile) VALUES($1,$2)", [
    id,
    profile,
  ]);
  for (const purpose of ["treasury", "merchant"])
    await db.query(
      "INSERT INTO store.accounts(id,run_id,purpose) VALUES($1,$2,$3)",
      [randomUUID(), id, purpose],
    );
  await createCustomer(
    db,
    id,
    "Alex Rowan",
    "alex@learner.rvu.test",
    await passwordHash("Studio-Local-2026!"),
    true,
  );
  if (["B07", "R02", "R05", "open-playground"].includes(profile)) {
    await createCustomer(
      db, id, "Training Target", "target@learner.rvu.test",
      await passwordHash("Target-Only-2026!"), true,
    );
  }
  await db.query(
    "INSERT INTO store.runtime(singleton,active_run) VALUES(true,$1) ON CONFLICT(singleton) DO UPDATE SET active_run=excluded.active_run",
    [id],
  );
  return id;
}
