// @vitest-environment node
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import ts from "typescript";

describe("deployed Node entrypoints", () => {
  it("imports transpiled server code using real ESM resolution without browser bundling", () => {
    fs.mkdirSync("artifacts", { recursive: true });
    const output = fs.mkdtempSync(path.resolve("artifacts/server-import-"));
    const visited = new Set<string>();
    const compile = (source: string) => {
      if (visited.has(source)) return;
      visited.add(source);
      const text = fs.readFileSync(source, "utf8");
      const emitted = ts.transpileModule(text, {
        compilerOptions: {
          target: ts.ScriptTarget.ES2022,
          module: ts.ModuleKind.ESNext,
        },
      }).outputText;
      const destination = path.join(output, source.replace(/\.ts$/, ".js"));
      fs.mkdirSync(path.dirname(destination), { recursive: true });
      fs.writeFileSync(destination, emitted);
      const module = ts.createSourceFile(
        source,
        emitted,
        ts.ScriptTarget.ES2022,
        true,
        ts.ScriptKind.JS,
      );
      for (const statement of module.statements) {
        if (
          !ts.isImportDeclaration(statement) &&
          !ts.isExportDeclaration(statement)
        )
          continue;
        const specifier = statement.moduleSpecifier;
        if (
          !specifier ||
          !ts.isStringLiteral(specifier) ||
          !specifier.text.startsWith(".")
        )
          continue;
        expect(specifier.text, `Node import in ${source}`).toMatch(/\.js$/);
        compile(
          path.normalize(
            path.join(
              path.dirname(source),
              specifier.text.replace(/\.js$/, ".ts"),
            ),
          ),
        );
      }
    };
    try {
      for (const entry of [
        "api/cron/insights.ts",
        "api/cron/oura-sync.ts",
        "api/webhook/oura.ts",
      ]) {
        compile(entry);
        expect(() =>
          execFileSync(
            process.execPath,
            [path.join(output, entry.replace(/\.ts$/, ".js"))],
            { stdio: "pipe", timeout: 10000 },
          ),
        ).not.toThrow();
      }
    } finally {
      fs.rmSync(output, { recursive: true, force: true });
    }
  });
});
