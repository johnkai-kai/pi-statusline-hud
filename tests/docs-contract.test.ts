import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { DEFAULT_CONFIG, LINE_NAMES, serialisableConfig } from "../src/config.ts";
import { PALETTE_NAMES } from "../src/palette.ts";

// Contract tests for what the docs promise.
//
// This project hit "the docs say X, the code does Y" three times in one week: the README's
// layout sketch showed ░ while both code paths emitted █; the README and SKILL said the default
// palette was contra while DEFAULT_CONFIG said tokyo-night; the config written on first install
// was "icons": true while the docs claimed on/off.
//
// All three passed green — because the tests only read src, and the docs were another universe.
// And SKILL.md is the only thing an agent answers users from, so a wrong doc gets repeated as
// fact and travels further than wrong code.
//
// Only the key and default columns are locked; prose is not compared. Comparing prose means
// fixing the test on every layout change, and that kind of test gets commented out within months.

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DOCS = {
  README: "README.md",
  "configure SKILL": join("skills", "pi-statusline-hud", "SKILL.md"),
  "setup SKILL": join("skills", "pi-statusline-hud-setup", "SKILL.md"),
} as const;

function read(relative: string): string {
  return readFileSync(join(ROOT, relative), "utf-8");
}

/** Picks out `| \`key\` | ... |` table rows and returns key -> columns. */
function tableRows(markdown: string): Map<string, string[]> {
  const rows = new Map<string, string[]>();
  for (const line of markdown.split(/\r?\n/)) {
    const match = /^\|\s*`([A-Za-z]+)`\s*\|(.*)\|\s*$/.exec(line);
    if (!match) continue;
    rows.set(
      match[1],
      match[2].split("|").map((cell) => cell.trim()),
    );
  }
  return rows;
}

/** Extracts the literal from a cell like `` `"on"` ``; returns null if it is not a code literal. */
function literal(cell: string | undefined): string | null {
  if (cell === undefined) return null;
  const match = /^`([^`]+)`$/.exec(cell);
  if (!match) return null;
  return match[1];
}

const CONFIG_KEYS = Object.keys(DEFAULT_CONFIG);
const SERIALISED = serialisableConfig(DEFAULT_CONFIG);

test("the README and configure SKILL tables cover every config key", () => {
  for (const doc of ["README", "configure SKILL"] as const) {
    const rows = tableRows(read(DOCS[doc]));
    for (const key of CONFIG_KEYS) {
      assert.ok(rows.has(key), `${doc} has no ${key} in its table`);
    }
  }
});

test("a default written as a code literal in the docs must equal the real default", () => {
  for (const doc of ["README", "configure SKILL"] as const) {
    const rows = tableRows(read(DOCS[doc]));
    for (const key of CONFIG_KEYS) {
      const cells = rows.get(key);
      if (cells === undefined) continue;
      // The README is key | default | meaning; the SKILL is key | type | default | meaning.
      const candidates = cells.slice(0, 2).map(literal).filter((v): v is string => v !== null);
      if (candidates.length === 0) continue;

      const actual = SERIALISED[key];
      // String() of an array is a comma list, which nobody would write in a doc — use JSON.
      const expected = Array.isArray(actual)
        ? [JSON.stringify(actual)]
        : typeof actual === "string"
          ? [`"${actual}"`, actual]
          : [String(actual)];
      assert.ok(
        candidates.some((c) => expected.includes(c)),
        `${doc} writes ${key} as ${JSON.stringify(candidates)}; it is really ${JSON.stringify(actual)}`,
      );
    }
  }
});

test("line and palette names listed in the docs must actually exist", () => {
  // The setup SKILL covers failed installs and lists no line names — only these two describe the look.
  for (const doc of ["README", "configure SKILL"] as const) {
    const text = read(DOCS[doc]);
    for (const name of LINE_NAMES) {
      assert.ok(text.includes(`\`${name}\``), `${doc} never mentions the line ${name}`);
    }
  }
  const configure = read(DOCS["configure SKILL"]);
  for (const name of PALETTE_NAMES) {
    assert.ok(configure.includes(`\`${name}\``), `configure SKILL does not list the palette ${name}`);
  }
});

test("the docs must not mention things that no longer exist", () => {
  const gone = ["hasAlwaysVisibleLine", "renderMeter", "supportsTrueColor", "falls back to mono when COLORTERM"];
  for (const [doc, path] of Object.entries(DOCS)) {
    const text = read(path);
    for (const dead of gone) {
      assert.ok(!text.includes(dead), `${doc} still talks about the removed ${dead}`);
    }
  }
});
