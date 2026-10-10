export interface Config {
  databaseUrl: string;
  origin: string;
  cookieSecure: boolean;
  mode: "store" | "control";
  webRoot?: string;
  logger?: boolean;
}
export function envConfig(): Config {
  const mode = process.env.APP_MODE === "control" ? "control" : "store";
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
  return {
    databaseUrl: process.env.DATABASE_URL,
    origin:
      process.env.APP_ORIGIN ??
      (mode === "store" ? "http://localhost:8080" : "http://127.0.0.1:8081"),
    cookieSecure: process.env.COOKIE_SECURE === "true",
    mode,
    webRoot: process.env.WEB_ROOT,
    logger: true,
  };
}
