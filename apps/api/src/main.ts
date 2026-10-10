import { resolve } from "node:path";
import { buildApp } from "./app.ts";
import { envConfig } from "./config.ts";
import { deliverMail } from "./mail.ts";
const config = envConfig();
const { app, pool } = await buildApp({
  ...config,
  webRoot: resolve(config.mode === "store" ? "dist/web" : "dist/control"),
  logger: true,
});
let sending = false;
const timer =
  config.mode === "store"
    ? setInterval(async () => {
        if (sending) return;
        sending = true;
        try {
          await deliverMail(pool);
        } catch {
          app.log.warn(
            "Mail delivery will retry; scoped inbox remains available",
          );
        } finally {
          sending = false;
        }
      }, 3000)
    : undefined;
app.addHook("onClose", async () => {
  if (timer) clearInterval(timer);
});
await app.listen({ port: Number(process.env.PORT ?? 3000), host: "0.0.0.0" });
for (const signal of ["SIGTERM", "SIGINT"])
  process.on(signal, async () => {
    await app.close();
    process.exit(0);
  });
