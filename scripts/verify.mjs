import { spawnSync } from "node:child_process";
for (const args of [["run", "typecheck"], ["test"], ["run", "test:ui"]]) {
  const result = spawnSync("npm", args, {
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
