import { randomBytes } from "node:crypto";
import { writeFile, access } from "node:fs/promises";
import { constants } from "node:fs";
try {
  await access(".env", constants.F_OK);
  console.log(".env already exists. Credentials were not changed.");
  process.exit(0);
} catch {}
const secret = () => randomBytes(24).toString("hex");
const instructor = secret();
await writeFile(
  ".env",
  `DB_PASSWORD=${secret()}\nSTORE_DB_PASSWORD=${secret()}\nCONTROL_DB_PASSWORD=${secret()}\nINSTRUCTOR_PASSWORD=${instructor}\n`,
  { mode: 0o600, flag: "wx" },
);
console.log("Local credentials generated in .env.");
console.log("Instructor username: instructor");
console.log("Instructor password: " + instructor);
console.log("Run: docker compose up --build -d");
