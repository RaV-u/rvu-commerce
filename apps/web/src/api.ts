export type Money = number | string;
export type Product = {
  id: string;
  name: string;
  description: string;
  category: string;
  price: Money;
  image: string;
  badge: string;
  kind: string;
  specs: string[];
};
export type Cart = {
  version: number;
  items: (Product & { quantity: number })[];
  subtotal: number;
  discount: number;
  total: number;
  coupon: { code: string } | null;
  couponEligible: boolean;
  applications?: {id:string;code:string;amount:number}[];
  vouchers?: {id:string;code:string;amount:number}[];
};
export type User = {
  id: string;
  name: string;
  email: string;
  verified: boolean;
};
export type Session = { user: User | null; csrf?: string };
export type Order = {
  id: string;
  order_number: string;
  state: string;
  subtotal: Money;
  discount: Money;
  total: Money;
  created_at: string;
  items: {
    id: string;
    name: string;
    image: string;
    unit_price: Money;
    quantity: number;
    kind: string;
  }[];
  giftCards: {
    id: string;
    code: string;
    face_value: Money;
    redeemed_at: string | null;
  }[];
};
export type Wallet = {
  balance: number;
  transactions: {
    id: string;
    amount: Money;
    kind: string;
    created_at: string;
  }[];
};
export type Message = {
  id: string;
  subject: string;
  body: string;
  created_at: string;
};
let csrf = "";
export function setCsrf(value = "") {
  csrf = value;
}
export async function api<T>(
  path: string,
  method = "GET",
  body?: unknown,
  extra: Record<string, string> = {},
): Promise<T> {
  const response = await fetch("/api" + path, {
    method,
    credentials: "same-origin",
    headers: {
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      "X-CSRF-Token": csrf,
      ...extra,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const data = await response.json();
  if (
    response.status === 401 &&
    path !== "/login" &&
    path !== "/instructor/login"
  ) {
    window.dispatchEvent(
      new window.Event(
        path.startsWith("/instructor/")
          ? "rvu:instructor-expired"
          : "rvu:session-expired",
      ),
    );
  }
  if (!response.ok)
    throw new Error(data.error ?? "Something went wrong. Please try again.");
  return data as T;
}
export const money = (value: Money) =>
  new Intl.NumberFormat("en-EG", {
    style: "currency",
    currency: "EGP",
    maximumFractionDigits: 2,
  }).format(Number(value) / 100);
