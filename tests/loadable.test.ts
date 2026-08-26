import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, statSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";

// Every file under src must be loadable in strip-only mode.
//
// The trigger: settings-menu.ts used a TypeScript parameter property
// (constructor(private readonly x)), which strip-only cannot parse — the whole module explodes
// at import. tsc --noEmit says nothing, so it passed type-checking and CI while that file could
// not even be loaded in a test.
//
// The result was that both bugs in that file could only be found by eye inside a real pi.
//
// The same class of mine includes enum, namespace, decorators and `import x = require(...)`.
// This test does not care which is which; it asks one thing: does it import?

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..", "src");

function tsFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) tsFiles(full, out);
    else if (entry.endsWith(".ts")) out.push(full);
  }
  return out;
}

const FILES = tsFiles(SRC);

test("at least ten files are found under src — a guard that finds nothing is no guard", () => {
  assert.ok(FILES.length >= 10, `only ${FILES.length} files found`);
});

for (const file of FILES) {
  const name = file.slice(SRC.length + 1).replace(/\\/g, "/");
  test(`src/${name} loads in strip-only mode`, async () => {
    await assert.doesNotReject(
      () => import(pathToFileURL(file).href),
      `src/${name} failed to load — most likely syntax strip-only does not support (parameter properties, enum, namespace, decorators)`,
    );
  });
}
