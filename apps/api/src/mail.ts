import nodemailer from "nodemailer";
import type pg from "pg";
import { activeRun, transaction } from "./db.ts";
export async function deliverMail(
  pool: pg.Pool,
  host = "mailpit",
  port = 1025,
) {
  const transport = nodemailer.createTransport({
    host,
    port,
    secure: false,
    connectionTimeout: 3000,
    socketTimeout: 3000,
  });
  // SMTP stays on the internal network. Only the scoped database inbox is student-visible.
  return transaction(pool, async (db) => {
    const run = await activeRun(db);
    const messages = (
      await db.query(
        "SELECT * FROM store.outbox WHERE run_id=$1 AND sent_at IS NULL ORDER BY created_at LIMIT 10 FOR UPDATE SKIP LOCKED",
        [run],
      )
    ).rows;
    for (const m of messages) {
      await transport.sendMail({
        from: "RVU Commerce <hello@commerce.rvu.test>",
        to: m.recipient,
        subject: m.subject,
        text: m.body,
        messageId: `<${m.id}@commerce.rvu.test>`,
      });
      await db.query(
        "UPDATE store.outbox SET sent_at=now(),attempts=attempts+1 WHERE id=$1",
        [m.id],
      );
    }
    return messages.length;
  });
}
