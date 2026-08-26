import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_CONFIG, LINE_NAMES, type HudConfig } from "../src/config.ts";
import { PALETTE_NAMES } from "../src/palette.ts";
import {
  conflictMessage,
  formatConfigSummary,
  lineOptionLabel,
  lineOptions,
  menuEntries,
  parseLineOption,
  parsePositiveInt,
  runWizard,
  summaryLines,
  toggleLine,
  type WizardDeps,
  type WizardUI,
} from "../src/wizard.ts";

type Notice = { message: string; type: string | undefined };

interface Harness {
  deps: WizardDeps;
  notices: Notice[];
  saved: HudConfig[];
  prompts: string[];
  optionSets: string[][];
}

// The script maps a title to the values to return in order; undefined means the user pressed Esc.
function harness(
  script: Array<string | undefined>,
  options?: { packages?: unknown; config?: HudConfig; confirm?: boolean },
): Harness {
  const notices: Notice[] = [];
  const saved: HudConfig[] = [];
  const prompts: string[] = [];
  const optionSets: string[][] = [];
  let current = options?.config ?? { ...DEFAULT_CONFIG };
  let step = 0;
  const next = (): string | undefined => script[step++];
  const ui: WizardUI = {
    async select(title, opts) {
      prompts.push(title);
      optionSets.push(opts);
      return next();
    },
    async confirm(title) {
      prompts.push(title);
      return options?.confirm ?? false;
    },
    async input(title) {
      prompts.push(title);
      return next();
    },
    notify(message, type) {
      notices.push({ message, type });
    },
  };
  return {
    notices,
    saved,
    prompts,
    optionSets,
    deps: {
      ui,
      loadConfig: () => current,
      saveConfig: (config) => {
        current = config;
        saved.push(config);
      },
      readPackages: () => options?.packages,
    },
  };
}

test("parsePositiveInt accepts positive integer strings", () => {
  assert.equal(parsePositiveInt("7"), 7);
  assert.equal(parsePositiveInt("  42  "), 42);
  assert.equal(parsePositiveInt("1000000"), 1_000_000);
});

test("parsePositiveInt rejects zero, negatives, decimals and empties", () => {
  assert.equal(parsePositiveInt("0"), null);
  assert.equal(parsePositiveInt("-3"), null);
  assert.equal(parsePositiveInt("1.5"), null);
  assert.equal(parsePositiveInt(""), null);
  assert.equal(parsePositiveInt("   "), null);
  assert.equal(parsePositiveInt(undefined), null);
});

test("parsePositiveInt does not fall for parseInt's prefix trap", () => {
  assert.equal(parsePositiveInt("42abc"), null);
  assert.equal(parsePositiveInt("7 chairs"), null);
  assert.equal(parsePositiveInt("NaN"), null);
  assert.equal(parsePositiveInt("Infinity"), null);
});

test("toggleLine turns off a line that is on", () => {
  assert.deepEqual(toggleLine(["header", "repo", "tools"], "repo"), ["header", "tools"]);
});

test("toggleLine reinserts in the canonical order of the seven lines", () => {
  assert.deepEqual(toggleLine(["header", "tools"], "repo"), ["header", "repo", "tools"]);
  assert.deepEqual(toggleLine(["header"], "status"), ["header", "status"]);
  assert.deepEqual(toggleLine(["tools"], "header"), ["header", "tools"]);
});

test("toggleLine does not mutate the input array", () => {
  const lines = ["header", "tools"] as const;
  toggleLine(lines, "repo");
  assert.deepEqual(lines, ["header", "tools"]);
});

test("lineOptionLabel and parseLineOption round-trip", () => {
  for (const name of LINE_NAMES) {
    assert.equal(parseLineOption(lineOptionLabel(name, true)), name);
    assert.equal(parseLineOption(lineOptionLabel(name, false)), name);
  }
  assert.equal(parseLineOption("\u2190 Back"), null);
  assert.equal(parseLineOption("bogus  [on]"), null);
});

test("lineOptions marks the current state of each line", () => {
  const opts = lineOptions({ ...DEFAULT_CONFIG, lines: ["header", "tools"] });
  assert.equal(opts.length, LINE_NAMES.length);
  assert.ok(opts[0].includes("on"));
  assert.ok(opts[1].includes("off"));
});

test("formatConfigSummary covers all six keys", () => {
  const summary = formatConfigSummary(DEFAULT_CONFIG);
  for (const key of [
    "lines",
    "motto",
    "sessionBudget",
    "palettePreset",
    "maxToolEntries",
    "icons",
  ]) {
    assert.ok(summary.includes(key), key);
  }
});

test("menuEntries has ten items and carries the current values", () => {
  const entries = menuEntries({ ...DEFAULT_CONFIG, maxToolEntries: 3, palettePreset: "mono" });
  assert.equal(entries.length, 10);
  assert.deepEqual(
    entries.map((entry) => entry.key),
    [
      "lines",
      "motto",
      "budget",
      "palette",
      "tools",
      "icons",
      "sessionBar",
      "rainbow",
      "show",
      "exit",
    ],
  );
  assert.ok(entries[3].label.includes("mono"));
  assert.ok(entries[4].label.includes("3"));
});

test("conflictMessage names the packages and explains how to remove them", () => {
  const message = conflictMessage(["npm:@narumitw/pi-statusline"]);
  assert.ok(message.includes("npm:@narumitw/pi-statusline"));
  assert.ok(message.includes("packages"));
  assert.ok(message.includes("settings.json"));
  assert.ok(message.includes("restart"));
});

test("the wizard checks footer conflicts first; with none it reports info and opens the main menu", async () => {
  const h = harness([undefined], { packages: ["npm:pi-statusline-hud"] });
  await runWizard(h.deps);
  assert.equal(h.notices[0].type, "info");
  assert.ok(h.notices[0].message.includes("No other footer-grabbing"));
  assert.equal(h.prompts[0], "pi-statusline-hud settings");
});

test("a conflict warns first, and declining ends without opening the main menu", async () => {
  const h = harness([], { packages: ["npm:@narumitw/pi-statusline"], confirm: false });
  await runWizard(h.deps);
  assert.equal(h.notices[0].type, "warning");
  assert.ok(h.notices[0].message.includes("npm:@narumitw/pi-statusline"));
  assert.deepEqual(h.prompts, ["Footer conflict"]);
  assert.equal(h.saved.length, 0);
});

test("a conflict the user chooses to continue past still opens the main menu", async () => {
  const h = harness([undefined], {
    packages: ["npm:@narumitw/pi-statusline"],
    confirm: true,
  });
  await runWizard(h.deps);
  assert.equal(h.prompts[1], "pi-statusline-hud settings");
});

test("an unreadable settings.json counts as no conflict and does not throw", async () => {
  const h = harness([undefined], { packages: undefined });
  await assert.doesNotReject(runWizard(h.deps));
  assert.ok(h.notices[0].message.includes("No other footer-grabbing"));
});

test("choosing exit in the main menu finishes without writing", async () => {
  const h = harness(["Exit"]);
  await runWizard(h.deps);
  assert.equal(h.saved.length, 0);
});

test("Esc in the main menu breaks the loop instead of asking forever", async () => {
  const h = harness([undefined, undefined, undefined]);
  await runWizard(h.deps);
  assert.equal(h.prompts.filter((p) => p === "pi-statusline-hud settings").length, 1);
});

test("toggling a line saves immediately and says it is already in effect", async () => {
  const h = harness([
    menuEntries(DEFAULT_CONFIG)[0].label,
    lineOptionLabel("repo", true),
    "\u2190 Back",
    "Exit",
  ]);
  await runWizard(h.deps);
  assert.equal(h.saved.length, 1);
  assert.deepEqual(h.saved[0].lines, ["header", "meters", "cache", "env", "tools", "status"]);
  assert.ok(h.notices.at(-1)?.message.includes("Applied immediately"));
});

test("turning off the last line is refused and the config is kept", async () => {
  const only: HudConfig = { ...DEFAULT_CONFIG, lines: ["header"] };
  const h = harness(
    [menuEntries(only)[0].label, lineOptionLabel("header", true), "\u2190 Back", "Exit"],
    { config: only },
  );
  await runWizard(h.deps);
  assert.equal(h.saved.length, 0);
  assert.equal(h.notices.at(-1)?.type, "warning");
});

// pi's input dialog cannot receive a prefilled value (ExtensionInputComponent names the
// parameter _placeholder and then never uses it), so the user always sees an empty box and
// cannot see the current motto. Pressing Enter straight away submits an empty string — Esc
// preserved data while Enter destroyed it, the opposite way round. Now clearing asks first,
// and the title carries the current value.

test("clearing the motto by leaving it empty asks first, and declining does not save", async () => {
  const started: HudConfig = { ...DEFAULT_CONFIG, motto: "keep going" };
  const h = harness([menuEntries(started)[1].label, "", "Exit"], {
    config: started,
    confirm: false,
  });
  await runWizard(h.deps);
  assert.equal(h.saved.length, 0);
  assert.equal(h.notices.at(-1)?.type, "info");
});

test("leaving it empty and confirming really clears it", async () => {
  const started: HudConfig = { ...DEFAULT_CONFIG, motto: "keep going" };
  const h = harness([menuEntries(started)[1].label, "", "Exit"], {
    config: started,
    confirm: true,
  });
  await runWizard(h.deps);
  assert.equal(h.saved.length, 1);
  assert.equal(h.saved[0].motto, "");
});

test("an already empty motto left empty needs no confirmation and does not save", async () => {
  const h = harness([menuEntries(DEFAULT_CONFIG)[1].label, "", "Exit"], { confirm: false });
  await runWizard(h.deps);
  assert.equal(h.saved.length, 0);
});

test("every input title carries the current value — the dialog cannot prefill", async () => {
  const started: HudConfig = { ...DEFAULT_CONFIG, motto: "keep going", sessionBudget: 5_000_000 };
  const h = harness([menuEntries(started)[1].label, "x", "Exit"], { config: started });
  await runWizard(h.deps);
  assert.ok(
    h.prompts.some((t) => t.includes("keep going")),
    `title did not carry the current value: ${JSON.stringify(h.prompts)}`,
  );

  const h2 = harness([menuEntries(started)[2].label, "123", "Exit"], { config: started });
  await runWizard(h2.deps);
  assert.ok(
    h2.prompts.some((t) => t.includes("5000000")),
    `title did not carry the current value: ${JSON.stringify(h2.prompts)}`,
  );
});

test("Esc at the motto input does not save", async () => {
  const h = harness([menuEntries(DEFAULT_CONFIG)[1].label, undefined, "Exit"]);
  await runWizard(h.deps);
  assert.equal(h.saved.length, 0);
});

test("Session budget accepts a positive integer", async () => {
  const h = harness([menuEntries(DEFAULT_CONFIG)[2].label, "500000", "Exit"]);
  await runWizard(h.deps);
  assert.equal(h.saved.at(-1)?.sessionBudget, 500_000);
});

test("an illegal Session budget warns and keeps the old value", async () => {
  const h = harness([menuEntries(DEFAULT_CONFIG)[2].label, "-5", "Exit"]);
  await runWizard(h.deps);
  assert.equal(h.saved.length, 0);
  assert.equal(h.notices.at(-1)?.type, "warning");
});

test("the tool line limit accepts a positive integer", async () => {
  const h = harness([menuEntries(DEFAULT_CONFIG)[4].label, "3", "Exit"]);
  await runWizard(h.deps);
  assert.equal(h.saved.at(-1)?.maxToolEntries, 3);
});

test("the palette menu lists the presets and can switch to mono", async () => {
  const h = harness([menuEntries(DEFAULT_CONFIG)[3].label, "mono", "Exit"]);
  await runWizard(h.deps);
  // What it lists is what really exists, with no second copy of the list — a copy means two
  // places to edit per new palette, and the time one is forgotten no test would catch it.
  assert.deepEqual(h.optionSets[1], [...PALETTE_NAMES]);
  assert.equal(h.optionSets[1].at(-1), "mono", "mono is the fallback and goes last");
  assert.ok(h.optionSets[1].length >= 10, "the palette count must not quietly shrink");
  assert.equal(h.saved.at(-1)?.palettePreset, "mono");
});

test("the emoji switch can be turned off", async () => {
  const h = harness([menuEntries(DEFAULT_CONFIG)[5].label, "off", "Exit"]);
  await runWizard(h.deps);
  assert.equal(h.saved.at(-1)?.icons, false);
});

test("showing the current settings uses select, does not save, and stays in the main menu", async () => {
  const h = harness(["Show current settings", "Back", "Exit"]);
  await runWizard(h.deps);
  assert.equal(h.saved.length, 0);
  // notify cannot be used: the next frame repaints the menu over it, and it looks like nothing happened.
  const shown = h.optionSets.at(-2) ?? [];
  assert.ok(shown.some((line) => line.startsWith("sessionBudget: ")));
  assert.ok(shown.some((line) => line.startsWith("lines: ")));
  assert.equal(shown.at(-1), "\u2190 Back");
  assert.equal(h.prompts.filter((p) => p === "pi-statusline-hud settings").length, 2);
});

test("main menu labels reflect a value that was just changed", async () => {
  const h = harness([menuEntries(DEFAULT_CONFIG)[4].label, "2", "Exit"]);
  await runWizard(h.deps);
  assert.ok(h.optionSets.at(-1)?.some((label) => label.includes("Tool line limit  [2]")));
});

test("an object-form packages entry also counts as a footer conflict", async () => {
  const h = harness([], {
    packages: [{ source: "npm:@narumitw/pi-statusline", extensions: ["./x.ts"] }],
    confirm: false,
  });
  await runWizard(h.deps);
  assert.equal(h.notices[0].type, "warning");
  assert.ok(h.notices[0].message.includes("npm:@narumitw/pi-statusline"));
  assert.deepEqual(h.prompts, ["Footer conflict"]);
});


test("keeping header or status raises no blank warning", async () => {
  const config = { ...DEFAULT_CONFIG, lines: ["header", "tools"] as const };
  const h = harness(
    [menuEntries({ ...config, lines: [...config.lines] })[0].label, lineOptionLabel("tools", true), undefined, undefined],
    { config: { ...config, lines: [...config.lines] } },
  );
  await runWizard(h.deps);
  assert.deepEqual(h.saved.at(-1)?.lines, ["header"]);
  assert.equal(h.notices.filter((notice) => notice.type === "warning").length, 0);
});

test("the session rule can be turned off from the wizard", async () => {
  const h = harness([menuEntries(DEFAULT_CONFIG)[6].label, "off", "Exit"]);
  await runWizard(h.deps);
  assert.equal(h.saved.at(-1)?.sessionBar, false);
});

test("the summary lists sessionBar as on / off", () => {
  assert.ok(summaryLines({ ...DEFAULT_CONFIG, sessionBar: false }).includes("sessionBar: off"));
});
