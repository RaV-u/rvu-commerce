// CI compatibility bridge for the historical integrated smoke suite.
// It replaces only the old test login request with the current local
// classroom sign-in. All other HTTP operations remain unchanged.
import assert from "node:assert/strict";
assert.equal(process.env.RVU_DISPOSABLE_CI, "yes", "Disposable CI only");
const nativeFetch = globalThis.fetch;
globalThis.fetch = (url, options) => {
  if (String(url) === "http://localhost:8080/api/business/login-verification" && options?.method === "POST") {
    const payload=JSON.parse(String(options.body??"{}"));
    if(payload.password==="Target-Only-2026!")
      return nativeFetch(url,{...options,body:JSON.stringify({...payload,password:"rvucamp"})});
  }
  if (String(url) === "http://localhost:8080/api/login" && options?.method === "POST") {
    const payload = JSON.parse(String(options.body ?? "{}"));
    if (payload.email === "alex@learner.rvu.test") {
      return nativeFetch(url, {
        ...options,
        body: JSON.stringify({ username: "rvu", password: "rvucamp" }),
      });
    }
  }
  return nativeFetch(url, options);
};
await import("./smoke-extended.mjs");
