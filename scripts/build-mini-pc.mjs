import { build } from "esbuild";
import fs from "node:fs";
fs.mkdirSync(".vercel/mini-pc-release", { recursive: true });
await build({
  entryPoints: [
    "mini-pc/server.mjs",
    "mini-pc/worker.mjs",
    "mini-pc/operator.mjs",
  ],
  outdir: ".vercel/mini-pc-release",
  bundle: true,
  platform: "node",
  target: "node22",
  format: "esm",
  packages: "external",
  outExtension: { ".js": ".mjs" },
  logLevel: "info",
});
fs.copyFileSync("package.json", ".vercel/mini-pc-release/package.json");
fs.copyFileSync(
  "package-lock.json",
  ".vercel/mini-pc-release/package-lock.json",
);
