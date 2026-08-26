import { RAINBOW_TARGETS } from "./rainbow.ts";
import {
  getSelectListTheme,
  getSettingsListTheme,
  type ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { Container, Input, SelectList, SettingsList, Text } from "@earendil-works/pi-tui";
import type { HudConfig } from "./config.ts";
import {
  applySettingChange,
  buildSettingItems,
  lineItems,
  rainbowItems,
  type SettingItemSpec,
} from "./settings-items.ts";

// The only new file that touches the pi runtime. All the meaning of a setting lives in
// settings-items.ts; this is wiring.
//
// Why not keep using ctx.ui.select: every call to pi's select is an independent selector
// lifecycle (destroyed on close, remounted), so a loop that edits one item at a time
// necessarily sends the cursor back to the first entry, and every remount flickers.
// ctx.ui.custom takes the same mount path but mounts once, and the component stays alive
// until done() is called.

const MAX_VISIBLE = 12;
const TITLE = "pi-statusline-hud";

type Done = (selected?: string) => void;

export interface SettingsMenuDeps {
  loadConfig: () => HudConfig;
  saveConfig: (config: HudConfig) => void;
  /**
   * Applies in memory and repaints, without writing to disk.
   *
   * This is what makes "the status line becomes whatever palette the cursor is on" work:
   * browsing sixteen palettes should not write the disk sixteen times, and those temporary
   * values must not survive an Esc.
   */
  previewConfig: (config: HudConfig) => void;
  notify: (message: string, type?: "info" | "warning" | "error") => void;
}

// Container has no handleInput (pi-tui's Container is only a layout box), so any submenu built
// on it has to delegate keys to its inner component itself. Forget that and the submenu
// silently swallows every key without an error — pi's own SelectSubmenu is written the same way.
//
// Do not use TypeScript parameter properties (constructor(private readonly x)) — Node's
// strip-only mode cannot parse them and the whole module explodes at load. tsc --noEmit does
// not complain, so such code passes type-checking while the file cannot even be imported in a test.
class Submenu {
  readonly body: { render(width: number): string[]; handleInput(data: string): void };
  readonly header: Text;

  constructor(
    body: { render(width: number): string[]; handleInput(data: string): void },
    header: Text,
  ) {
    this.body = body;
    this.header = header;
  }

  handleInput(data: string): void {
    this.body.handleInput(data);
  }

  invalidate(): void {}

  render(width: number): string[] {
    return [...this.header.render(width), ...this.body.render(width)];
  }
}

function textSubmenu(spec: SettingItemSpec, currentValue: string, done: Done): unknown {
  const input = new Input();
  // The input box here shows the current value — pi's ui.input dialog cannot, which is exactly
  // why it used to eat the motto.
  input.setValue(spec.kind === "text" && currentValue === "(empty)" ? "" : currentValue);
  // The TUI only focuses the returned root component, so a nested Input needs focusing by hand;
  // without it the text shows but there is no hardware cursor and no IME positioning.
  input.focused = true;
  input.onSubmit = (value) => done(value);
  input.onEscape = () => done();
  return new Submenu(input, new Text(`${spec.label} — Enter to confirm · Esc to cancel`, 1, 0));
}

function choiceSubmenu(
  spec: SettingItemSpec,
  currentValue: string,
  done: Done,
  theme: unknown,
  preview?: (value: string) => void,
): unknown {
  const items = (spec.choices ?? []).map((value) => ({ value, label: value }));
  const list = new SelectList(items, MAX_VISIBLE, theme as never);
  // SettingsList's hint says "Enter/Space to change", and it does treat Space as confirm — but
  // SelectList only accepts Enter. Having learnt Space in the main menu, a user pressing Space
  // in the palette submenu gets nothing at all, which looks like a frozen menu.
  //
  // Normalise CRLF while here: some terminals send CR LF for Enter, and the keybindings only
  // recognise a lone CR.
  const body = {
    render: (width: number): string[] => list.render(width),
    handleInput: (data: string): void => {
      list.handleInput(data === " " || data === "\r\n" ? "\r" : data);
    },
  };
  const index = items.findIndex((item) => item.value === currentValue);
  if (index >= 0) list.setSelectedIndex(index);

  // Apply whatever the cursor is on right away, rather than only after leaving the submenu.
  // Repaint only, no write; Esc puts the original value back.
  if (preview !== undefined) {
    list.onSelectionChange = (item) => preview(item.value);
  }

  list.onSelect = (item) => done(item.value);
  list.onCancel = () => {
    preview?.(currentValue);
    done();
  };
  return new Submenu(
    body,
    new Text(`${spec.label} — arrows preview live · Enter/Space to select · Esc to cancel`, 1, 0),
  );
}

/**
 * The submenu of lines. It is a SettingsList itself, so keeping the cursor is free again.
 *
 * This one does not report through the outer onChange but changes and saves the config
 * directly — several lines can be toggled at once, which a single "new value" cannot express.
 */
function togglesSubmenu(
  itemsFor: (config: HudConfig) => ReturnType<typeof lineItems>,
  done: Done,
  deps: SettingsMenuDeps,
  read: () => HudConfig,
  write: (config: HudConfig) => void,
  theme: unknown,
): unknown {
  const list: SettingsList = new SettingsList(
    itemsFor(read()).map((spec) => ({
      id: spec.id,
      label: spec.label,
      description: spec.description,
      currentValue: spec.currentValue,
      values: spec.values,
    })) as never,
    MAX_VISIBLE,
    theme as never,
    (id, value) => {
      // Same guard as the main menu: onChange is called synchronously inside the TUI's input
      // dispatch loop, and a failed write (antivirus lock, read-only, full disk) thrown from
      // here becomes an uncaughtException that takes the whole pi process with it.
      try {
        const result = applySettingChange(read(), id, value);
        if (result.rejected !== undefined) {
          deps.notify(result.rejected, "warning");
          // SettingsList has already flipped the displayed value, so flip it back, or the
          // screen and the real setting disagree.
          list.updateValue(id, value === "on" ? "off" : "on");
          return;
        }
        write(result.config);
      } catch (error) {
        deps.notify(`Settings were not saved: ${String(error)}`, "error");
      }
    },
    () => done(),
  );
  return new Submenu(list, new Text("Lines — Enter/Space to toggle · Esc to go back", 1, 0));
}

export interface MenuThemes {
  settings: unknown;
  select: unknown;
}

export interface MenuComponent {
  handleInput(data: string): void;
  invalidate(): void;
  render(width: number): string[];
}

/**
 * Builds the settings menu component. Extracted so it can be tested — both bugs this menu had
 * (cursor jumping back to the first entry, submenu not returning) only show up when real keys
 * are fed to real components.
 *
 * themes are injected by the caller: pi's getSettingsListTheme() throws in a process without
 * initTheme, which a test environment cannot provide.
 */
export function createSettingsComponent(
  deps: SettingsMenuDeps,
  done: () => void,
  themes: MenuThemes,
): MenuComponent {
  let current = deps.loadConfig();

  const write = (config: HudConfig): void => {
    current = config;
    deps.saveConfig(config);
  };

  {
    const specs = buildSettingItems(current);
    const list: SettingsList = new SettingsList(
      specs.map((spec) => ({
        id: spec.id,
        label: spec.label,
        description: spec.description,
        currentValue: spec.currentValue,
        values: spec.values,
        submenu:
          spec.values !== undefined
            ? undefined
            : (currentValue: string, close: Done) => {
                if (spec.kind === "lines") {
                  return togglesSubmenu(
                    lineItems,
                    () => {
                      close();
                      list.updateValue("lines", `${current.lines.length}/7`);
                    },
                    deps,
                    () => current,
                    write,
                    themes.settings,
                  );
                }
                if (spec.kind === "rainbow") {
                  return togglesSubmenu(
                    rainbowItems,
                    () => {
                      close();
                      list.updateValue("rainbow", `${current.rainbow.length}/${RAINBOW_TARGETS.length}`);
                    },
                    deps,
                    () => current,
                    write,
                    themes.settings,
                  );
                }
                if (spec.kind === "choice") {
                  return choiceSubmenu(spec, currentValue, close, themes.select, (value) => {
                    // Preview goes through applySettingChange rather than assigning directly —
                    // an illegal value is rejected here, so "previews but will not save" cannot happen.
                    const result = applySettingChange(current, spec.id, value);
                    if (result.rejected === undefined) deps.previewConfig(result.config);
                  });
                }
                return textSubmenu(spec, currentValue, close);
              },
      })) as never,
      MAX_VISIBLE,
      themes.settings as never,
      (id, value) => {
        // onChange is called synchronously inside the TUI's input dispatch loop, so throwing
        // here blows up into that loop and the whole interface locks up.
        try {
          const result = applySettingChange(current, id, value);
          if (result.rejected !== undefined) {
            deps.notify(result.rejected, "warning");
            list.updateValue(id, buildSettingItems(current).find((s) => s.id === id)?.currentValue ?? value);
            return;
          }
          write(result.config);
          list.updateValue(id, buildSettingItems(current).find((s) => s.id === id)?.currentValue ?? value);
        } catch (error) {
          deps.notify(`Settings were not saved: ${String(error)}`, "error");
        }
      },
      () => done(),
    );
    // No second HUD preview inside the menu.
    //
    // The custom component only replaces the input box; the footer stays at the bottom of the
    // screen and re-reads config every frame — change something and the next frame shows it.
    // A second preview would put two HUDs on screen at once, and since the preview uses sample
    // data it reads as "the HUD broke and the numbers are wrong".
    return new Submenu(list, new Text(`${TITLE} — Esc to leave, changes apply immediately`, 1, 0));
  }
}

export async function runSettingsMenu(
  ctx: ExtensionContext,
  deps: SettingsMenuDeps,
): Promise<boolean> {
  let factoryRan = false;

  await ctx.ui.custom<void>((_tui, _theme, _keybindings, done) => {
    factoryRan = true;
    return createSettingsComponent(deps, () => done(), {
      settings: getSettingsListTheme(),
      select: getSelectListTheme(),
    }) as never;
  });

  return factoryRan;
}
