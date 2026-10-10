import { useEffect, useState, type FormEvent } from "react";
import { createRoot } from "react-dom/client";
import { ShieldCheck, RefreshCw, LogOut } from "lucide-react";
import { api, setCsrf } from "../../web/src/api.ts";
import "./style.css";
function Control() {
  const [session, setSession] = useState<{
      csrf: string;
      run: string;
      users: number;
      profile: string;
    } | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [confirm, setConfirm] = useState(""),
    [ready, setReady] = useState(false),
    [nextProfile, setNextProfile] = useState("secure-baseline"),
    [evidence, setEvidence] = useState<{B01:number;B04:number;B08:number;B10:number;R01:number}|null>(null);
  async function refresh() {
    const s = await api<{ csrf: string; run: string; users: number; profile: string }>(
      "/instructor/session",
    );
    setCsrf(s.csrf);
    setSession(s);
    const status = await api<{metrics:{B01:number;B04:number;B08:number;B10:number;R01:number}}>("/instructor/evidence");
    setEvidence(status.metrics);
  }
  useEffect(() => {
    const expired = () => {
      setSession(null);
      setCsrf();
    };
    window.addEventListener("rvu:instructor-expired", expired);
    void refresh()
      .catch(() => setSession(null))
      .finally(() => setReady(true));
    return () => window.removeEventListener("rvu:instructor-expired", expired);
  }, []);
  async function perform(fn: () => Promise<void>) {
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
  function login(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const body = Object.fromEntries(new FormData(e.currentTarget));
    void perform(async () => {
      await api("/instructor/login", "POST", body);
      await refresh();
    });
  }
  return (
    <main>
      <header>
        <a href="/" className="logo">
          <img src="/brand/rvu-instructor.svg" alt="RVU instructor console" width="250" height="63"/>
        </a>
        <ShieldCheck size={25} />
      </header>
      {!ready ? (
        <p>Loading console…</p>
      ) : !session ? (
        <section>
          <span className="eyebrow">SEPARATE BY DESIGN</span>
          <h1>Welcome, instructor.</h1>
          <p>
            Sign in with the credentials generated for this local installation.
          </p>
          <form onSubmit={login}>
            <label>
              Username
              <input
                name="username"
                autoComplete="username"
                defaultValue="instructor"
                required
              />
            </label>
            <label>
              Password
              <input
                name="password"
                type="password"
                autoComplete="current-password"
                required
              />
            </label>
            <button disabled={busy}>
              {busy ? "Signing in…" : "Sign in to console"}
            </button>
          </form>
        </section>
      ) : (
        <>
          <section>
            <div className="section-title">
              <span className="eyebrow">LOCAL TRAINING ENVIRONMENT</span>
              <button
                className="subtle"
                disabled={busy}
                onClick={() =>
                  void perform(async () => {
                    await api("/instructor/logout", "POST", {});
                    setCsrf();
                    setSession(null);
                  })
                }
              >
                <LogOut size={15} /> Sign out
              </button>
            </div>
            <h1>{session.profile === "secure-baseline" ? "A clean foundation." : "Scenario in progress."}</h1>
            <p>
              {session.profile === "secure-baseline"
                ? "This run uses validated server-side commerce controls. Training vulnerabilities are disabled."
                : `The ${session.profile} teaching profile is isolated to this run. Students see the normal store, not this configuration.`}
            </p>
            <dl>
              <div>
                <dt>Profile</dt>
                <dd>{session.profile}</dd>
              </div>
              <div>
                <dt>Accounts in current run</dt>
                <dd>{session.users}</dd>
              </div>
              <div>
                <dt>Active run</dt>
                <dd className="run">{session.run}</dd>
              </div>
            </dl>
          </section>
          <section>
            <span className="eyebrow">INSTRUCTOR-ONLY OBSERVABILITY</span>
            <h2>Validated training evidence</h2>
            <p>Counts refer to this run only. Evidence is computed from persisted orders, quotes, discount applications and wallet movements—not screenshots.</p>
            <dl>
              <div><dt>B01 · Underpaid customised order</dt><dd>{evidence?.B01 ?? "…"}</dd></div>
              <div><dt>B04 · Repeated promotion in one paid order</dt><dd>{evidence?.B04 ?? "…"}</dd></div>
              <div><dt>B08 · Confirmed orders without settled payment</dt><dd>{evidence?.B08 ?? "…"}</dd></div>
              <div><dt>R01 · Overlapping voucher claims on one order</dt><dd>{evidence?.R01 ?? "…"}</dd></div>
              <div><dt>B10 · Net-positive discounted gift card redemptions</dt><dd>{evidence?.B10 ?? "…"}</dd></div>
            </dl>
            <button className="evidence-refresh" disabled={busy} onClick={() => void perform(refresh)}>Refresh evidence</button>
          </section>
          <section className="reset">
            <RefreshCw size={24} />
            <h2>Start a fresh, isolated training run.</h2>
            <p>
              Reset creates a new run with the demo account and opening balance.
              Existing student sessions stop working; orders, wallets, inboxes
              and gift cards from previous runs remain inaccessible to students.
              Instructor access is retained.
            </p>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void perform(async () => {
                  await api("/instructor/reset", "POST", { confirm,profile: nextProfile });
                  setConfirm("");
                  await refresh();
                });
              }}
            >
              <label className="profile-select">
                Training profile
                <select value={nextProfile} onChange={(e) => setNextProfile(e.target.value)}>
                  <option value="secure-baseline">Secure baseline · patched</option>
                  <option value="B01">B01 · Custom quote pricing trust</option>
                  <option value="B04">B04 · Discount application history</option>
                  <option value="B08">B08 · Returning-customer order confirmation</option>
                  <option value="R01">R01 · Concurrent one-use voucher claims</option>
                  <option value="B10">B10 · Stored-value promotion loop</option>
                </select>
              </label>
              <label>
                Type RESET to confirm
                <input
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  placeholder="RESET"
                  required
                  autoComplete="off"
                />
              </label>
              <button disabled={busy || confirm !== "RESET"}>
                {busy ? "Resetting…" : "Reset current run"}
              </button>
            </form>
            <p className="roadmap-note">Available to test: B01, B04, B08, B10 and R01. Remaining 13 scenarios are specified in the research blueprint but are not yet implemented or selectable.</p>
          </section>
        </>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <footer>RVU Commerce · Fictional data · Local access only</footer>
    </main>
  );
}
createRoot(document.getElementById("root")!).render(<Control />);
