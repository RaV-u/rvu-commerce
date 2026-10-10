import { useEffect, useState, useRef, type FormEvent } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  ShoppingBag,
  Search,
  UserRound,
  Wallet as WalletIcon,
  Plus,
  Minus,
  Check,
  Package,
  ShieldCheck,
  Truck,
  Mail,
  LogOut,
  Leaf,
  X,
  Menu,
} from "lucide-react";
import {
  api,
  money,
  setCsrf,
  type Product,
  type Cart,
  type Session,
  type Wallet,
  type Order,
  type Message,
} from "./api.ts";
import { Modal } from "./components/Modal.tsx";
const blankCart: Cart = {
  version: 0,
  items: [],
  subtotal: 0,
  discount: 0,
  total: 0,
  coupon: null,
  couponEligible: true,
};
type Panel =
  "login" | "register" | "bag" | "checkout" | "account" | "policy" | "quote" | null;
export function App() {
  const [products, setProducts] = useState<Product[]>([]),
    [session, setSession] = useState<Session>({ user: null }),
    [cart, setCart] = useState<Cart>(blankCart),
    [wallet, setWallet] = useState<Wallet>({ balance: 0, transactions: [] });
  const [promotions, setPromotions] = useState<{code:string;description:string}[]>([]),
    [menuOpen, setMenuOpen] = useState(false);
  const [category, setCategory] = useState("All products"),
    [query, setQuery] = useState(""),
    [sort, setSort] = useState("curated"),
    [panel, setPanel] = useState<Panel>(null),
    [product, setProduct] = useState<Product | null>(null),
    [selected, setSelected] = useState<Order | null>(null);
  const [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [ready, setReady] = useState(false),
    [coupon, setCoupon] = useState("");
  const [orders, setOrders] = useState<Order[]>([]),
    [messages, setMessages] = useState<Message[]>([]),
    [tab, setTab] = useState("orders");
  const checkoutKey = useRef("");
  async function refresh(s = session) {
    if (s.user?.verified) {
      const [c, w] = await Promise.all([
        api<Cart>("/cart"),
        api<Wallet>("/wallet"),
      ]);
      setCart(c);
      setWallet(w);
    } else {
      setCart(blankCart);
      setWallet({ balance: 0, transactions: [] });
    }
  }
  async function perform(fn: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function load() {
    setError("");
    try {
      const [c, s] = await Promise.all([
        api<{ products: Product[]; promotions: {code:string;description:string}[] }>("/catalog"),
        api<Session>("/session"),
      ]);
      setProducts(c.products);
      setPromotions(c.promotions);
      setSession(s);
      setCsrf(s.csrf);
      await refresh(s);
      setReady(true);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  useEffect(() => {
    void load();
  }, []);
  useEffect(() => {
    const expired = () => {
      setSession({ user: null });
      setCsrf();
      setCart(blankCart);
      setWallet({ balance: 0, transactions: [] });
      setOrders([]);
      setMessages([]);
      setSelected(null);
      setProduct(null);
      setPanel("login");
    };
    window.addEventListener("rvu:session-expired", expired);
    return () => window.removeEventListener("rvu:session-expired", expired);
  }, []);
  useEffect(() => {
    if (!notice) return;
    const id = setTimeout(() => setNotice(""), 4500);
    return () => clearTimeout(id);
  }, [notice]);
  async function account(nextTab = "orders") {
    setPanel("account");
    setTab(nextTab);
    if (session.user?.verified) {
      const [o, w, m] = await Promise.all([
        api<{ orders: Order[] }>("/orders"),
        api<Wallet>("/wallet"),
        api<{ messages: Message[] }>("/inbox"),
      ]);
      setOrders(o.orders);
      setWallet(w);
      setMessages(m.messages);
    } else {
      setMessages((await api<{ messages: Message[] }>("/inbox")).messages);
      setTab("inbox");
    }
  }
  function openAccount() {
    if (!session.user) setPanel("login");
    else void perform(() => account());
  }
  async function quantity(p: Product, n: number) {
    setCart(
      await api<Cart>("/cart/items", "PUT", { productId: p.id, quantity: n }),
    );
  }
  function add(p: Product) {
    if (!session.user) {
      setPanel("login");
      return;
    }
    if (!session.user.verified) {
      void perform(() => account("inbox"));
      return;
    }
    void perform(async () => {
      await quantity(
        p,
        (cart.items.find((i) => i.id === p.id)?.quantity ?? 0) + 1,
      );
      setNotice(`${p.name} added to your bag`);
    });
  }
  async function authenticate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.currentTarget));
    await perform(async () => {
      const s = await api<Session>(
        panel === "register" ? "/register" : "/login",
        "POST",
        data,
      );
      setSession(s);
      setCsrf(s.csrf);
      await refresh(s);
      setPanel(null);
      setNotice(
        s.user?.verified
          ? "Welcome back. Make yourself at home."
          : "Your account is ready. Open your inbox to verify your email.",
      );
    });
  }
  async function createQuote(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    await perform(async () => {
      const q = await api<{id:string;authorizedPrice:number}>("/quotes", "POST", {
        dock: data.has("dock"), support: data.has("support"),
      });
      const updated = await api<Cart>(`/quotes/${q.id}/accept`, "POST", {
        quotedTotal: q.authorizedPrice,
      });
      setCart(updated);
      setPanel("bag");
      setNotice("Your workstation quote has been added to your bag.");
    });
  }
  async function pay(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const delivery = Object.fromEntries(new FormData(e.currentTarget));
    await perform(async () => {
      const review = await api<{intentId:string,total:number}>(
        "/checkout/prepare", "POST", {cartVersion:cart.version,delivery},
      );
      if (review.total !== cart.total) throw new Error("Your bag has changed. Please review the total.");
      const o = await api<Order>(
        "/checkout/confirm", "POST", {intentId:review.intentId},
        { "Idempotency-Key": checkoutKey.current },
      );
      await refresh();
      setPanel(null);
      setSelected(o);
      setNotice("Payment complete. Your order is confirmed.");
    });
  }
  const filtered = products
    .filter(
      (p) =>
        (category === "All products" || p.category === category) &&
        `${p.name} ${p.description}`
          .toLowerCase()
          .includes(query.toLowerCase()),
    )
    .sort((a, b) =>
      sort === "low"
        ? Number(a.price) - Number(b.price)
        : sort === "high"
          ? Number(b.price) - Number(a.price)
          : 0,
    );
  const count = cart.items.reduce((n, p) => n + p.quantity, 0);
  return (
    <>
      <div className="announcement">
        A little more considered. A lot more you.{" "}
        <span>WELCOME10 · 10% off eligible orders</span>
      </div>
      <header className="site-header">
        <a className="brand" href="#" aria-label="RVU Commerce home">
          <img src="/brand/rvu-commerce.svg" alt="RVU Commerce" width="246" height="62" />
        </a>
        <nav aria-label="Main navigation">
          <a href="#collection">Shop the collection</a>
          <button
            onClick={() => {
              setCategory("Gift cards");
              document
                .getElementById("collection")
                ?.scrollIntoView({ behavior: "smooth" });
            }}
          >
            Gift cards
          </button>
          <button onClick={() => setPanel("policy")}>Our approach</button>
        </nav>
        <div className="header-actions">
          <button
            className="mobile-menu-toggle icon-btn"
            aria-label={menuOpen ? "Close navigation" : "Open navigation"}
            aria-expanded={menuOpen}
            aria-controls="mobile-navigation"
            onClick={() => setMenuOpen((v) => !v)}
          >
            {menuOpen ? <X size={21} /> : <Menu size={21} />}
          </button>
          <button
            className="icon-btn account-button"
            onClick={openAccount}
            aria-label="Your account"
          >
            <UserRound size={20} />
            <span>
              {session.user ? session.user.name.split(" ")[0] : "Sign in"}
            </span>
          </button>
          <button
            className="bag-button"
            onClick={() =>
              session.user?.verified ? setPanel("bag") : openAccount()
            }
            aria-label={`Shopping bag, ${count} items`}
          >
            <ShoppingBag size={18} />
            <span>Bag</span>
            <b>{count}</b>
          </button>
        </div>
      </header>
      {menuOpen && (
        <nav id="mobile-navigation" className="mobile-navigation" aria-label="Mobile navigation">
          <a href="#collection" onClick={() => setMenuOpen(false)}>Shop the collection</a>
          <button onClick={() => {setCategory("Gift cards");setMenuOpen(false);document.getElementById("collection")?.scrollIntoView({behavior:"smooth"});}}>Gift cards</button>
          <button onClick={() => {setPanel("quote");setMenuOpen(false);}}>Custom workstation</button>
          <button onClick={() => {setPanel("policy");setMenuOpen(false);}}>Our approach</button>
        </nav>
      )}
      <main>
        <section className="hero">
          <div className="hero-copy">
            <span className="eyebrow">
              <i /> THE EVERYDAY, RECONSIDERED
            </span>
            <h1>
              Good things.
              <br />
              Better <em>workdays.</em>
            </h1>
            <p>
              Thoughtful essentials for the space you make your own. Find your
              focus, settle in, and do your thing.
            </p>
            <a className="primary" href="#collection">
              Find your essentials <ArrowUpRight size={19} />
            </a>
            <button className="hero-quote-link" onClick={() => session.user?.verified ? setPanel("quote") : openAccount()}>
              Build your own workstation <ArrowRight size={16}/>
            </button>
            <div className="hero-note">
              <span className="tiny-line" /> Made for a more considered
              workspace.
            </div>
          </div>
          <div className="hero-art">
            <img
              src="/products/studio.svg"
              alt="A considered workspace with a studio display, keyboard and sculptural desk light"
            />
            <div className="art-label">
              <span>THE STUDIO EDIT</span>
              <strong>Room for your best ideas.</strong>
            </div>
            <span className="art-index">01 / EVERYDAY ESSENTIALS</span>
          </div>
        </section>
        <section className="benefits" aria-label="Store benefits">
          <span>
            <Truck size={19} /> Complimentary local delivery
          </span>
          <span>
            <ShieldCheck size={19} /> Secure wallet checkout
          </span>
          <span>
            <Leaf size={19} /> A thoughtfully edited collection
          </span>
        </section>
        <section id="collection" className="collection">
          <div className="section-top">
            <div>
              <span className="eyebrow">LESS NOISE. MORE PURPOSE.</span>
              <h2>Your next everyday favourite.</h2>
            </div>
            <span className="collection-count">
              {products.length} considered essentials <ArrowDownIcon />
            </span>
          </div>
          <div className="catalog-tools">
            <div className="categories" aria-label="Product categories">
              {[
                "All products",
                ...new Set(products.map((p) => p.category)),
              ].map((c) => (
                <button
                  key={c}
                  onClick={() => setCategory(c)}
                  className={category === c ? "active" : ""}
                >
                  {c}
                </button>
              ))}
            </div>
            <div className="search-sort">
              <label className="search">
                <Search size={17} />
                <input
                  aria-label="Search products"
                  placeholder="Find something good…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </label>
              <select
                aria-label="Sort products"
                value={sort}
                onChange={(e) => setSort(e.target.value)}
              >
                <option value="curated">Curated for you</option>
                <option value="low">Price: low to high</option>
                <option value="high">Price: high to low</option>
              </select>
            </div>
          </div>
          {!ready ? (
            <div className="empty">
              {error ? (
                <>
                  <p>We couldn’t load the collection.</p>
                  <button className="secondary" onClick={() => void load()}>
                    Try again
                  </button>
                </>
              ) : (
                <p>Getting the collection ready…</p>
              )}
            </div>
          ) : (
            <div className="product-grid">
              {filtered.map((p, i) => (
                <article className="product-card" key={p.id}>
                  <div className={`product-image tone-${i % 4}`}>
                    <button
                      className="image-open"
                      aria-label={`View ${p.name}`}
                      onClick={() => setProduct(p)}
                    >
                      <img src={p.image} alt={p.name} loading="lazy" />
                    </button>
                    {p.badge && <span className="badge">{p.badge}</span>}
                    <button
                      className="quick-add"
                      disabled={
                        busy ||
                        (cart.items.find((x) => x.id === p.id)?.quantity ??
                          0) >= 10
                      }
                      onClick={() => add(p)}
                      aria-label={`Add ${p.name} to bag`}
                    >
                      <Plus size={20} />
                    </button>
                  </div>
                  <span className="product-category">{p.category}</span>
                  <button
                    className="product-title"
                    onClick={() => setProduct(p)}
                  >
                    {p.name}
                  </button>
                  <p className="product-price">{money(p.price)}</p>
                </article>
              ))}
            </div>
          )}
          {ready && !filtered.length && (
            <div className="empty">
              <Search size={28} />
              <h3>No matches just yet.</h3>
              <p>Try another search or explore the full collection.</p>
              <button
                className="secondary"
                onClick={() => {
                  setQuery("");
                  setCategory("All products");
                }}
              >
                Show all products
              </button>
            </div>
          )}
        </section>
        <section className="gift-banner">
          <div className="gift-banner-art">
            <img src="/products/gift.svg" alt="The RVU gift card" />
          </div>
          <div>
            <span className="eyebrow">GOOD TASTE. THEIR CHOICE.</span>
            <h2>A little room to choose.</h2>
            <p>
              For a new desk, a new chapter, or just because.
              <br />
              Give them EGP 500 towards something they’ll love.
            </p>
            {promotions.some((p)=>p.code === "GIFT20") && <p className="promo-hint">Seasonal gift card promotion: use <strong>GIFT20</strong> at checkout.</p>}
            <button
              className="text-link"
              onClick={() => {
                const p = products.find((p) => p.kind === "gift_card");
                if (p) setProduct(p);
              }}
              disabled={!ready}
            >
              Explore the gift card <ArrowRight size={18} />
            </button>
          </div>
        </section>
      </main>
      <footer>
        <div className="footer-top">
          <a className="brand" href="#" aria-label="RVU Commerce home">
            <img src="/brand/rvu-commerce.svg" alt="RVU Commerce" width="230" height="58" />
          </a>
          <p>Make room for good things.</p>
          <button onClick={() => setPanel("policy")}>
            Delivery, returns & store information <ArrowUpRight size={16} />
          </button>
        </div>
        <div className="footer-bottom">
          <span>© RVU Commerce · Local training edition</span>
          <span>Fictional products. Virtual payments. Thoughtful design.</span>
        </div>
      </footer>
      {notice && (
        <div className="toast" role="status">
          <Check size={18} />
          {notice}
        </div>
      )}
      {error && (
        <div className="error-toast" role="alert">
          {error}
          <button aria-label="Dismiss error" onClick={() => setError("")}>
            <X size={18} />
          </button>
        </div>
      )}
      {(panel === "login" || panel === "register") && (
        <Modal
          error={error}
          title={panel === "login" ? "Welcome back." : "Make yourself at home."}
          close={() => setPanel(null)}
        >
          <p className="muted">
            Your essentials, orders and wallet. All in one place.
          </p>
          <form onSubmit={authenticate} className="form">
            {panel === "register" && (
              <label>
                Full name
                <input
                  name="name"
                  required
                  minLength={2}
                  maxLength={80}
                  autoComplete="name"
                />
              </label>
            )}
            <label>
              Email address
              <input
                name="email"
                type="email"
                required
                placeholder="you@learner.rvu.test"
                autoComplete="username"
              />
            </label>
            <label>
              Password
              <input
                name="password"
                type="password"
                required
                minLength={12}
                maxLength={128}
                autoComplete={
                  panel === "login" ? "current-password" : "new-password"
                }
              />
            </label>
            {panel === "register" && (
              <p className="form-note">
                Use a fictional @learner.rvu.test address. Your private in-app
                inbox receives the verification message. New accounts receive
                EGP 15,000 in virtual credit.
              </p>
            )}
            <button className="primary full" disabled={busy}>
              {busy
                ? "One moment…"
                : panel === "login"
                  ? "Sign in"
                  : "Create account"}
              <ArrowRight size={18} />
            </button>
          </form>
          <button
            className="switch-link"
            onClick={() => setPanel(panel === "login" ? "register" : "login")}
          >
            {panel === "login"
              ? "New here? Create an account"
              : "Already have an account? Sign in"}
          </button>
          <div className="demo-note">
            Explore the local demo
            <br />
            <strong>alex@learner.rvu.test</strong>
            <br />
            Password: Studio-Local-2026!
          </div>
        </Modal>
      )}
      {product && (
        <Modal
          error={error}
          title={product.name}
          wide
          close={() => setProduct(null)}
        >
          <div className="product-detail">
            <img src={product.image} alt={product.name} />
            <div>
              <span className="eyebrow">{product.category}</span>
              <p>{product.description}</p>
              <h3>{money(product.price)}</h3>
              <ul>
                {product.specs.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ul>
              <button
                className="primary full"
                disabled={busy}
                onClick={() => {
                  add(product);
                  setProduct(null);
                }}
              >
                Add to bag <Plus size={18} />
              </button>
              <p className="form-note">
                {product.kind === "gift_card"
                  ? promotions.some((p) => p.code === "GIFT20")
                    ? "Seasonal GIFT20 promotion can apply. Orders containing gift cards are final sale."
                    : "Full face value. Promotions do not apply. Orders containing gift cards are final sale."
                  : "Complimentary delivery. Return your order to your wallet from your account."}
              </p>
            </div>
          </div>
        </Modal>
      )}
      {panel === "quote" && (
        <Modal error={error} title="Your desk, your way." close={() => setPanel(null)}>
          <p className="muted">Build a personalised workstation with a clear, time-limited quote.</p>
          <form className="form" onSubmit={createQuote}>
            <div className="quote-line">
              <div><strong>Vista 27 Studio Display</strong><span>4K display · adjustable aluminium stand</span></div>
              <strong>{money(680000)}</strong>
            </div>
            <label className="quote-choice">
              <input name="dock" type="checkbox" defaultChecked />
              <span><strong>Pro docking bundle</strong><small>More connections, less clutter</small></span>
              <strong>+ {money(900000)}</strong>
            </label>
            <label className="quote-choice">
              <input name="support" type="checkbox" />
              <span><strong>Studio care package</strong><small>Priority service for your workspace</small></span>
              <strong>+ {money(250000)}</strong>
            </label>
            <button className="primary full" disabled={busy} type="submit">
              {busy ? "Preparing quote…" : "Accept quote and add to bag"} <ArrowRight size={18}/>
            </button>
            <p className="form-note">Prices are confirmed when you accept your quote. Quotes expire after one hour. Virtual payments only.</p>
          </form>
        </Modal>
      )}
      {panel === "bag" && (
        <Modal
          error={error}
          title={`Your bag (${count})`}
          close={() => setPanel(null)}
        >
          {!count ? (
            <div className="empty">
              <ShoppingBag size={32} />
              <h3>A little space for something good.</h3>
              <button className="primary" onClick={() => setPanel(null)}>
                Explore the collection
              </button>
            </div>
          ) : (
            <>
              {cart.items.map((p) => (
                <div className="bag-row" key={p.id}>
                  <img src={p.image} alt="" />
                  <div>
                    <strong>{p.name}</strong>
                    <span>{money(Number(p.price) * p.quantity)}</span>
                    <div className="quantity">
                      <button
                        aria-label={`Decrease ${p.name}`}
                        disabled={busy}
                        onClick={() =>
                          void perform(() => quantity(p, p.quantity - 1))
                        }
                      >
                        <Minus size={14} />
                      </button>
                      <span>{p.quantity}</span>
                      <button
                        aria-label={`Increase ${p.name}`}
                        disabled={busy || p.quantity >= 10}
                        onClick={() =>
                          void perform(() => quantity(p, p.quantity + 1))
                        }
                      >
                        <Plus size={14} />
                      </button>
                    </div>
                  </div>
                  <button
                    className="icon-btn"
                    aria-label={`Remove ${p.name}`}
                    disabled={busy}
                    onClick={() => void perform(() => quantity(p, 0))}
                  >
                    <X size={16} />
                  </button>
                </div>
              ))}
              <form
                className="inline-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  void perform(async () =>
                    setCart(
                      await api<Cart>("/cart/coupon", "POST", { code: coupon }),
                    ),
                  );
                }}
              >
                <input
                  aria-label="Promotion code"
                  placeholder="Promotion code"
                  value={coupon}
                  onChange={(e) => setCoupon(e.target.value)}
                  required
                />
                <button className="secondary" disabled={busy}>
                  Apply
                </button>
              </form>
              <form className="inline-form" onSubmit={(e) => {
                e.preventDefault();
                const code=String(new FormData(e.currentTarget).get("voucher"));
                void perform(async()=>setCart(await api<Cart>("/cart/voucher","POST",{code})));
              }}>
                <input name="voucher" aria-label="Store voucher" placeholder="Store voucher" required />
                <button className="secondary" disabled={busy}>Redeem</button>
              </form>
              <p className="form-note">Studio voucher: <strong>STUDIO300</strong> · EGP 300 off eligible orders. Limited to one use per order.</p>
              {!!cart.vouchers?.length && <div className="coupon-pill">
                {cart.vouchers.length} store voucher {cart.vouchers.length===1 ? "credit" : "credits"} applied
                <button aria-label="Remove store voucher" disabled={busy} onClick={() => void perform(async()=>setCart(await api<Cart>("/cart/voucher","DELETE")))}><X size={14}/></button>
              </div>}
              {cart.coupon && (
                <div className="coupon-pill">
                  {cart.coupon.code}
                  <button
                    disabled={busy}
                    onClick={() =>
                      void perform(async () =>
                        setCart(await api<Cart>("/cart/coupon", "DELETE")),
                      )
                    }
                    aria-label="Remove promotion"
                  >
                    <X size={14} />
                  </button>
                </div>
              )}
              {cart.applications && cart.applications.length > 0 && (
                <p className="form-note">{cart.applications.length} promotion {cart.applications.length === 1 ? "entry" : "entries"} on this bag.</p>
              )}
              <Totals cart={cart} />
              {!cart.couponEligible && (
                <p className="warning">
                  This bag no longer qualifies for the promotion. Remove it to
                  continue.
                </p>
              )}
              <button
                className="primary full"
                disabled={busy || !cart.couponEligible}
                onClick={() => {
                  checkoutKey.current = crypto.randomUUID();
                  setPanel("checkout");
                }}
              >
                Continue to checkout <ArrowRight size={18} />
              </button>
              <p className="form-note">
                Offer eligibility and exclusions depend on the promotion. All payments use virtual wallet funds.
              </p>
            </>
          )}
        </Modal>
      )}
      {panel === "checkout" && (
        <Modal
          error={error}
          title="A few details, then it’s yours."
          close={() => setPanel("bag")}
        >
          <form className="form" onSubmit={pay}>
            <label>
              Full name
              <input
                name="fullName"
                defaultValue={session.user?.name}
                required
                minLength={2}
                maxLength={80}
              />
            </label>
            <label>
              Delivery address
              <input
                name="address"
                placeholder="12 Fictional Studio Lane"
                required
                minLength={5}
                maxLength={160}
              />
            </label>
            <label>
              City
              <input
                name="city"
                placeholder="Sample City"
                required
                minLength={2}
                maxLength={80}
              />
            </label>
            <div className="wallet-summary">
              <WalletIcon size={23} />
              <div>
                <strong>RVU Wallet</strong>
                <span>{money(wallet.balance)} available</span>
              </div>
              <Check size={18} />
            </div>
            <Totals cart={cart} />
            <button
              className="primary full"
              disabled={busy || wallet.balance < cart.total}
            >
              {busy ? "Processing payment…" : `Pay ${money(cart.total)}`}
              <ShieldCheck size={18} />
            </button>
            <p className="form-note">
              Virtual wallet payment only. Use fictional delivery details. Your
              order is confirmed after payment settles.
            </p>
          </form>
        </Modal>
      )}
      {panel === "account" && (
        <Modal
          error={error}
          title={`Hello, ${session.user?.name.split(" ")[0]}.`}
          wide
          close={() => setPanel(null)}
        >
          <div className="account-top">
            <p className="muted">{session.user?.email}</p>
            <button
              className="text-link"
              disabled={busy}
              onClick={() =>
                void perform(async () => {
                  await api("/logout", "POST", {});
                  setSession({ user: null });
                  setCsrf();
                  setCart(blankCart);
                  setWallet({ balance: 0, transactions: [] });
                  setPanel(null);
                })
              }
            >
              <LogOut size={15} /> Sign out
            </button>
          </div>
          <div className="account-tabs">
            {[
              { id: "orders", icon: Package, label: "Orders" },
              { id: "wallet", icon: WalletIcon, label: "Wallet" },
              { id: "inbox", icon: Mail, label: "Inbox" },
            ].map((t) => (
              <button
                key={t.id}
                className={tab === t.id ? "active" : ""}
                disabled={!session.user?.verified && t.id !== "inbox"}
                onClick={() => setTab(t.id)}
              >
                <t.icon size={17} />
                {t.label}
              </button>
            ))}
          </div>
          {tab === "orders" && (
            <>
              {orders.length ? (
                orders.map((o) => (
                  <button
                    className="order-row"
                    key={o.id}
                    onClick={() =>
                      void perform(async () => {
                        setSelected(await api<Order>(`/orders/${o.id}`));
                        setPanel(null);
                      })
                    }
                  >
                    <div>
                      <strong>{o.order_number}</strong>
                      <span>
                        {new Date(o.created_at).toLocaleDateString()} ·{" "}
                        {o.state}
                      </span>
                    </div>
                    <strong>{money(o.total)}</strong>
                    <ArrowRight size={17} />
                  </button>
                ))
              ) : (
                <div className="empty">
                  <Package size={32} />
                  <h3>Your next favourite is waiting.</h3>
                  <p>Completed orders will appear here.</p>
                </div>
              )}
            </>
          )}
          {tab === "wallet" && (
            <>
              <div className="balance-card">
                <span>YOUR VIRTUAL BALANCE</span>
                <strong>{money(wallet.balance)}</strong>
                <small>Ready for something good.</small>
              </div>
              <form
                className="inline-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  const code = String(
                    new FormData(e.currentTarget).get("code"),
                  );
                  void perform(async () => {
                    await api("/gift-cards/redeem", "POST", { code });
                    await refresh();
                    setNotice("Gift card added to your wallet.");
                  });
                }}
              >
                <input
                  name="code"
                  aria-label="Gift card code"
                  placeholder="Enter a gift card code"
                  required
                />
                <button className="secondary" disabled={busy}>
                  Redeem
                </button>
              </form>
              <h3 className="small-heading">Wallet activity</h3>
              {wallet.transactions.map((t) => (
                <div className="transaction" key={t.id}>
                  <div>
                    <strong>
                      {t.kind === "opening"
                        ? "Welcome credit"
                        : t.kind === "purchase"
                          ? "Order payment"
                          : t.kind === "refund"
                            ? "Order refund"
                            : "Gift card redeemed"}
                    </strong>
                    <span>{new Date(t.created_at).toLocaleString()}</span>
                  </div>
                  <strong className={Number(t.amount) > 0 ? "positive" : ""}>
                    {Number(t.amount) > 0 ? "+" : ""}
                    {money(t.amount)}
                  </strong>
                </div>
              ))}
            </>
          )}
          {tab === "inbox" && (
            <>
              {!session.user?.verified && (
                <p className="warning">
                  Verify your email to unlock your wallet and shopping bag.
                </p>
              )}
              {messages.length ? (
                messages.map((m) => (
                  <article className="message" key={m.id}>
                    <span className="eyebrow">
                      RVU COMMERCE ·{" "}
                      {new Date(m.created_at).toLocaleDateString()}
                    </span>
                    <h3>{m.subject}</h3>
                    <p>
                      Your account is almost ready. Confirm this fictional email
                      address to start shopping.
                    </p>
                    {!session.user?.verified ? (
                      <button
                        className="primary"
                        disabled={busy}
                        onClick={() =>
                          void perform(async () => {
                            await api("/verify", "POST", {
                              code: m.body.split(": ")[1],
                            });
                            const s = await api<Session>("/session");
                            setSession(s);
                            setCsrf(s.csrf);
                            await refresh(s);
                            setNotice("Email verified. Welcome to RVU.");
                          })
                        }
                      >
                        Verify my email <Check size={17} />
                      </button>
                    ) : (
                      <span className="verified">
                        <Check size={16} /> Email verified
                      </span>
                    )}
                  </article>
                ))
              ) : (
                <div className="empty">
                  <Mail size={32} />
                  <h3>You’re all caught up.</h3>
                </div>
              )}
            </>
          )}
        </Modal>
      )}
      {selected && (
        <Modal
          error={error}
          title={selected.order_number}
          close={() => setSelected(null)}
        >
          <div className="order-status">
            <Check size={20} />
            <div>
              <strong>
                {selected.state === "refunded"
                  ? "Refund complete"
                  : "Order confirmed"}
              </strong>
              <span>
                {selected.state === "refunded"
                  ? "Your payment is back in your wallet."
                  : "Paid with your RVU Wallet."}
              </span>
            </div>
          </div>
          {selected.items.map((p) => (
            <div className="bag-row" key={p.id}>
              <img src={p.image} alt="" />
              <div>
                <strong>{p.name}</strong>
                <span>
                  Qty {p.quantity} · {money(Number(p.unit_price) * p.quantity)}
                </span>
              </div>
            </div>
          ))}
          <div className="total-line">
            <strong>Total paid</strong>
            <strong>{money(selected.total)}</strong>
          </div>
          {selected.giftCards.map((g) => (
            <div className="gift-code" key={g.id}>
              <strong>{money(g.face_value)} gift card</strong>
              <code>{g.code}</code>
              <span>
                {g.redeemed_at
                  ? "Redeemed"
                  : "Ready to gift or redeem in a wallet"}
              </span>
            </div>
          ))}
          {selected.state === "confirmed" &&
            !selected.items.some((p) => p.kind === "gift_card") && (
              <button
                className="secondary full"
                disabled={busy}
                onClick={() =>
                  void perform(async () => {
                    setSelected(
                      await api<Order>(
                        `/orders/${selected.id}/refund`,
                        "POST",
                        {},
                      ),
                    );
                    await refresh();
                    setNotice("Your payment has been refunded.");
                  })
                }
              >
                Return order & refund wallet
              </button>
            )}
          {selected.items.some((p) => p.kind === "gift_card") && (
            <p className="form-note">
              Orders containing gift cards are final sale.
            </p>
          )}
        </Modal>
      )}
      {panel === "policy" && (
        <Modal
          error={error}
          title="A more considered everyday."
          close={() => setPanel(null)}
        >
          <div className="policy">
            <p>
              RVU brings together a small collection of workspace essentials.
              Every product, company and payment in this local edition is
              fictional.
            </p>
            <h3>Delivery & returns</h3>
            <p>
              Delivery has no charge. This training edition records your order
              and fictional address; there is no physical fulfilment.
              Physical-product orders can be returned in full from your account
              for the exact amount paid. Orders containing gift cards are final
              sale.
            </p>
            <h3>Wallet & gift cards</h3>
            <p>
              New accounts receive EGP 15,000 of virtual credit. Gift cards cost
              their full face value and can be redeemed once. No real payment
              details are requested.
            </p>
            <h3>A little welcome</h3>
            <p>
              WELCOME10 gives 10% off eligible physical products on orders of
              EGP 1,000 or more. STUDIO15 gives 15% off eligible physical
              products of EGP 5,000 or more. Each code can be used once per
              account. Choose one code per order; gift cards do not qualify.
            </p>
          </div>
        </Modal>
      )}
    </>
  );
}
function Totals({ cart }: { cart: Cart }) {
  return (
    <div className="totals">
      <div>
        <span>Subtotal</span>
        <span>{money(cart.subtotal)}</span>
      </div>
      {cart.discount > 0 && (
        <div className="positive">
          <span>Promotion</span>
          <span>−{money(cart.discount)}</span>
        </div>
      )}
      <div>
        <span>Delivery</span>
        <span>Complimentary</span>
      </div>
      <div className="total-line">
        <strong>Total</strong>
        <strong>{money(cart.total)}</strong>
      </div>
    </div>
  );
}
function ArrowDownIcon() {
  return <span aria-hidden="true">↘</span>;
}
