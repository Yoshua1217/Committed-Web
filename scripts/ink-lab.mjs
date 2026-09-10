import { copyFileSync, existsSync, mkdirSync, readFileSync, unlinkSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
const root = new URL("../", import.meta.url);
const fixture = new URL("tests/fixtures/ink-lab.tsx", root);
const route = new URL("src/app/ink-lab/page.tsx", root);
if (existsSync(route) && readFileSync(route, "utf8") !== readFileSync(fixture, "utf8")) throw new Error("The ink-lab route has local edits. Keep them before starting the fixture.");
mkdirSync(new URL("src/app/ink-lab/", root), { recursive: true });
copyFileSync(fixture, route);
const child = spawn(process.execPath, [fileURLToPath(new URL("node_modules/next/dist/bin/next", root)), "dev", "--port", process.env.INK_LAB_PORT || "3012"], {
  cwd: fileURLToPath(root), stdio: "inherit", env: { ...process.env, NEXT_PUBLIC_FIREBASE_EMULATORS: "1", NEXT_TEST_DIST_DIR: ".next-ink-test" },
});
const cleanup = () => { if (existsSync(route) && readFileSync(route, "utf8") === readFileSync(fixture, "utf8")) unlinkSync(route); };
child.on("exit", code => { cleanup(); process.exitCode = code ?? 0; });
process.on("exit", cleanup);
process.on("SIGINT", () => child.kill("SIGINT"));
process.on("SIGTERM", () => child.kill("SIGTERM"));
