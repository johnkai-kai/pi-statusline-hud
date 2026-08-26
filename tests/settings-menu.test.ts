import { test } from "node:test";
import assert from "node:assert/strict";
import { SettingsList } from "@earendil-works/pi-tui";
import { DEFAULT_CONFIG, type HudConfig } from "../src/config.ts";
import { createSettingsComponent } from "../src/settings-menu.ts";
import {
  applySettingChange,
  buildSettingItems,
  lineItems,
  LINE_ITEM_PREFIX,
  toSettingItems,
} from "../src/settings-items.ts";

// Why this file exists:
//
// The old wizard edited one item at a time through ctx.ui.select, repainting the menu after
// each change. Every pi select is an independent selector lifecycle (destroyed on close), so
// the cursor necessarily returned to the first entry, and the repaint flickered. Back then
// that symptom could only be seen by eye, with no way to regress it.
//
// SettingsList's activateItem never touches selectedIndex when it changes a value, so keeping
// the cursor is a structural guarantee. Being structural, it can be tested — the first test
// below is that original symptom written as an assertion.

const DOWN = "[B";
const UP = "[A";
const SPACE = " ";
const PLAIN_THEME = {
  label: (text: string) => text,
  value: (text: string) => text,
  description: (text: string) => text,
  cursor: ">",
  hint: (text: string) => text,
};

interface Harness {
  list: SettingsList;
  changes: Array<{ id: string; value: string }>;
  cancelled: () => boolean;
  cursorLine: () => string;
  press: (...keys: string[]) => void;
}

function harness(config: HudConfig = DEFAULT_CONFIG): Harness {
  const changes: Array<{ id: string; value: string }> = [];
  let cancelled = false;
  const items = toSettingItems(buildSettingItems(config));
  const list = new SettingsList(
    items as never,
    20,
    PLAIN_THEME,
    (id, value) => changes.push({ id, value }),
    () => {
      cancelled = true;
    },
  );
  return {
    list,
    changes,
    cancelled: () => cancelled,
    cursorLine: () => list.render(80).find((line) => line.startsWith(">")) ?? "",
    press: (...keys) => {
      for (const key of keys) list.handleInput(key);
    },
  };
}

test("the cursor stays put across repeated value changes — the old wizard's disease", () => {
  const h = harness();
  h.press(DOWN, DOWN, DOWN, DOWN, DOWN); // move to icons
  const before = h.cursorLine();
  assert.ok(before.includes("Emoji"), `cursor should be on the emoji row: ${before}`);

  h.press(SPACE, SPACE, SPACE);
  assert.equal(h.changes.length, 3);
  assert.deepEqual(
    h.changes.map((c) => c.value),
    ["off", "on", "off"],
  );
  assert.ok(h.cursorLine().includes("Emoji"), `cursor moved after three changes: ${h.cursorLine()}`);
});

test("moving the cursor and changing a value do not interfere", () => {
  const h = harness();
  h.press(DOWN, DOWN, DOWN, DOWN, DOWN, SPACE, DOWN, SPACE, UP, SPACE);
  assert.deepEqual(
    h.changes.map((c) => c.id),
    ["icons", "sessionBar", "icons"],
  );
});

test("onChange output feeds straight into applySettingChange", () => {
  const h = harness();
  h.press(DOWN, DOWN, DOWN, DOWN, DOWN, SPACE);
  let config: HudConfig = { ...DEFAULT_CONFIG };
  for (const change of h.changes) {
    config = applySettingChange(config, change.id, change.value).config;
  }
  assert.equal(config.icons, false);
});

test("Esc fires onCancel instead of silently doing nothing", () => {
  const h = harness();
  assert.equal(h.cancelled(), false);
  h.press("");
  assert.equal(h.cancelled(), true);
});

test("sixteen palettes carry no values — nobody should press Space sixteen times", () => {
  const items = toSettingItems(buildSettingItems(DEFAULT_CONFIG));
  const palette = items.find((i) => i.id === "palettePreset");
  assert.equal(palette?.values, undefined);
});

test("the lines sublist keeps its cursor too", () => {
  const changes: Array<{ id: string; value: string }> = [];
  const list = new SettingsList(
    toSettingItems(lineItems(DEFAULT_CONFIG)) as never,
    20,
    PLAIN_THEME,
    (id, value) => changes.push({ id, value }),
    () => {},
  );
  list.handleInput(DOWN);
  list.handleInput(DOWN);
  const before = list.render(80).find((l) => l.startsWith(">")) ?? "";
  list.handleInput(SPACE);
  list.handleInput(SPACE);
  const after = list.render(80).find((l) => l.startsWith(">")) ?? "";
  assert.equal(before, after);
  assert.deepEqual(
    changes.map((c) => c.id),
    [`${LINE_ITEM_PREFIX}meters`, `${LINE_ITEM_PREFIX}meters`],
  );
});

// ---- End to end over the whole menu: real keys into real components ----
//
// Both bugs (cursor jumping back to the first entry, submenu not returning) only appear when
// real components receive real keys. Unit tests miss them and the eye catches them — so this.

const ENTER = "\r";

function menu(overrides: Partial<HudConfig> = {}): {
  component: ReturnType<typeof createSettingsComponent>;
  saved: HudConfig[];
  previews: HudConfig[];
  notices: string[];
  closed: () => boolean;
  press: (...keys: string[]) => void;
  lines: () => string[];
} {
  let config: HudConfig = { ...DEFAULT_CONFIG, ...overrides };
  const saved: HudConfig[] = [];
  const previews: HudConfig[] = [];
  const notices: string[] = [];
  let closed = false;
  const component = createSettingsComponent(
    {
      loadConfig: () => config,
      saveConfig: (next) => {
        config = next;
        saved.push(next);
      },
      previewConfig: (next) => previews.push(next),
      notify: (message) => notices.push(message),
    },
    () => {
      closed = true;
    },
    { settings: PLAIN_THEME, select: SELECT_THEME },
  );
  return {
    component,
    saved,
    previews,
    notices,
    closed: () => closed,
    press: (...keys) => {
      for (const key of keys) component.handleInput(key);
    },
    lines: () => component.render(80),
  };
}

const SELECT_THEME = {
  selectedPrefix: (text: string) => text,
  selectedText: (text: string) => text,
  description: (text: string) => text,
  scrollInfo: (text: string) => text,
  noMatch: (text: string) => text,
};

test("palette submenu: Enter selects, returns to the main menu, and saves", () => {
  const m = menu();
  m.press(DOWN, DOWN, DOWN, DOWN); // lines → motto → budget → maxTool → palette
  assert.ok(m.lines().join("\n").includes("Palette"), "cursor should be on the palette row");

  m.press(ENTER); // open the submenu
  const inSubmenu = m.lines().join("\n");
  assert.ok(inSubmenu.includes("tokyo-night"), `submenu did not open: ${inSubmenu}`);

  m.press(DOWN, ENTER); // pick the next palette

  const after = m.lines().join("\n");
  // "Back in the main menu" has to be judged by something only the main menu has, not by the
  // palette name — after selecting, the main menu shows the new palette as the current value.
  assert.ok(after.includes("Lines"), `did not return to the main menu: ${after}`);
  assert.ok(!after.includes("arrows preview live"), `still in the submenu: ${after}`);
  assert.equal(m.saved.length, 1, "should have saved once");
  assert.notEqual(m.saved[0].palettePreset, DEFAULT_CONFIG.palettePreset);
});

test("palette submenu: Esc does not save, but still returns to the main menu", () => {
  const m = menu();
  m.press(DOWN, DOWN, DOWN, DOWN, ENTER, "\u001b");
  assert.ok(m.lines().join("\n").includes("Lines"), "Esc did not return to the main menu");
  assert.equal(m.saved.length, 0);
  assert.equal(m.closed(), false, "Esc should close only the submenu, not the whole menu");
});

test("the submenu takes Space too — the main menu's hint taught the user that", () => {
  const m = menu();
  m.press(DOWN, DOWN, DOWN, DOWN, ENTER, DOWN, " ");
  assert.equal(m.saved.length, 1, "Space did nothing in the palette submenu");
  assert.ok(m.lines().join("\n").includes("Lines"), "Space selected but did not return to the main menu");
});

test("lines submenu: toggle a line then Esc, back to the main menu with a save", () => {
  const m = menu();
  m.press(ENTER, DOWN, " ", "\u001b");
  const after = m.lines().join("\n");
  assert.ok(after.includes("Motto"), `did not return to the main menu: ${after}`);
  assert.equal(m.saved.length, 1);
  assert.equal(m.saved[0].lines.length, 6);
});

test("palette submenu: moving the cursor previews live, without saving", () => {
  const m = menu();
  m.press(DOWN, DOWN, DOWN, DOWN, ENTER); // open the palette submenu
  assert.equal(m.previews.length, 0, "opening the submenu should not preview yet");

  m.press(DOWN, DOWN); // browse two palettes down
  assert.equal(m.previews.length, 2, "each step should preview once");
  assert.equal(m.saved.length, 0, "browsing should not save");
  assert.deepEqual(
    m.previews.map((c) => c.palettePreset),
    ["ember", "triad"],
  );
});

test("palette submenu: Esc restores the original palette", () => {
  const m = menu();
  m.press(DOWN, DOWN, DOWN, DOWN, ENTER, DOWN, DOWN, "");
  assert.equal(m.saved.length, 0, "cancelling should not save");
  assert.equal(
    m.previews.at(-1)?.palettePreset,
    DEFAULT_CONFIG.palettePreset,
    "the screen should be back to the original palette after Esc",
  );
});

test("palette submenu: previewing then pressing Enter saves once, and saves what the cursor is on", () => {
  const m = menu();
  m.press(DOWN, DOWN, DOWN, DOWN, ENTER, DOWN, DOWN, ENTER);
  assert.equal(m.saved.length, 1);
  assert.equal(m.saved[0].palettePreset, "triad");
});

// A failed save must not take pi down. onChange is called synchronously inside the TUI's input
// dispatch loop, and an exception escaping handleInput is not caught by pi-tui: it becomes an
// uncaughtException and ends the process. No attacker needed — an antivirus lock, OneDrive
// holding the file, read-only, or a full disk all land here.
for (const [name, keys] of [
  ["main menu", [DOWN, DOWN, DOWN, DOWN, DOWN, SPACE]],
  ["lines submenu", [ENTER, DOWN, SPACE]],
] as Array<[string, string[]]>) {
  test(`a failed save in the ${name} only notifies, without an exception in the input loop`, () => {
    let config: HudConfig = { ...DEFAULT_CONFIG };
    const notices: string[] = [];
    const component = createSettingsComponent(
      {
        loadConfig: () => config,
        saveConfig: () => {
          throw new Error("EACCES: permission denied");
        },
        previewConfig: () => {},
        notify: (message) => notices.push(message),
      },
      () => {},
      { settings: PLAIN_THEME, select: SELECT_THEME },
    );
    assert.doesNotThrow(() => {
      for (const key of keys) component.handleInput(key);
    });
    assert.equal(notices.length, 1, `the user should be notified once: ${JSON.stringify(notices)}`);
    assert.match(notices[0], /EACCES/);
    void config;
  });
}
