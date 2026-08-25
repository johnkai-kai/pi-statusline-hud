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
  type SettingItemSpec,
} from "./settings-items.ts";

// 唯一新增的、會碰到 pi 執行期的檔案。設定的語意全在 settings-items.ts,
// 這裡只負責接線。
//
// 為什麼不繼續用 ctx.ui.select:pi 的 select 每次呼叫都是一次獨立的 selector
// 生命週期(關閉即銷毀、重新掛載),所以逐項編輯的迴圈必然讓游標回到第一項,
// 而且每次重掛都閃一下。ctx.ui.custom 走同一條掛載路徑但只掛一次,元件長駐
// 到 done() 被呼叫為止。

const MAX_VISIBLE = 12;
const TITLE = "pi-statusline-hud";

type Done = (selected?: string) => void;

export interface SettingsMenuDeps {
  loadConfig: () => HudConfig;
  saveConfig: (config: HudConfig) => void;
  /**
   * 只在記憶體裡套用並重畫,不寫檔。
   *
   * 給「游標移到哪個配色,狀態欄就馬上變成那個」用的:瀏覽十個配色不該
   * 寫十次磁碟,而且使用者按 Esc 之後那些暫時的值不該留下來。
   */
  previewConfig: (config: HudConfig) => void;
  notify: (message: string, type?: "info" | "warning" | "error") => void;
}

// Container 沒有 handleInput(pi-tui 的 Container 只是版面容器),所以任何以
// 它為底的子選單都必須自己把按鍵委派給內部元件。漏掉的話子選單會靜默吃掉
// 所有輸入而且不報錯——pi 自己的 SelectSubmenu 也是這樣寫的。
//
// 不要用 TypeScript 的參數屬性(constructor(private readonly x))——Node 的
// strip-only 模式無法解析,整個模組會在載入時就爆。tsc --noEmit 不會抱怨,
// 所以這種寫法可以一路通過型別檢查、卻讓這個檔案在測試裡連 import 都做不到。
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
  // 這裡的輸入框看得到目前值——pi 的 ui.input 對話框做不到,那正是它會把
  // 座右銘吃掉的原因。
  input.setValue(spec.kind === "text" && currentValue === "(空)" ? "" : currentValue);
  // TUI 只對回傳的根元件設焦點,巢狀的 Input 拿不到,得自己補;不補的話
  // 文字會顯示但沒有硬體游標與 IME 定位。
  input.focused = true;
  input.onSubmit = (value) => done(value);
  input.onEscape = () => done();
  return new Submenu(input, new Text(`${spec.label} — Enter 確認 · Esc 取消`, 1, 0));
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
  // SettingsList 的提示字寫「Enter/Space to change」,而且它自己確實把空白鍵
  // 當確認——但 SelectList 只認 Enter。使用者在主選單學會空白鍵之後,進到
  // 配色子選單按空白鍵會完全沒反應,看起來就像選單卡住。
  //
  // 順手把 CRLF 正規化:有些終端的 Enter 送的是 CR LF 兩個字元,而 keybindings
  // 只認單獨的 CR。
  const body = {
    render: (width: number): string[] => list.render(width),
    handleInput: (data: string): void => {
      list.handleInput(data === " " || data === "\r\n" ? "\r" : data);
    },
  };
  const index = items.findIndex((item) => item.value === currentValue);
  if (index >= 0) list.setSelectedIndex(index);

  // 游標移到哪個就先套用哪個,不必選完退出去才看得到效果。
  // 只重畫不寫檔;Esc 會把原值套回去。
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
    new Text(`${spec.label} — 上下鍵即時預覽 · Enter/空白鍵 選取 · Esc 取消`, 1, 0),
  );
}

/**
 * 行的子清單。它自己就是一個 SettingsList,所以游標保留一樣是免費的。
 *
 * 這裡不透過外層的 onChange 回報,而是直接改設定並存檔——因為一次可以切
 * 好幾行,回報單一「新值」表達不了。
 */
function linesSubmenu(
  done: Done,
  deps: SettingsMenuDeps,
  read: () => HudConfig,
  write: (config: HudConfig) => void,
  theme: unknown,
): unknown {
  const list: SettingsList = new SettingsList(
    lineItems(read()).map((spec) => ({
      id: spec.id,
      label: spec.label,
      description: spec.description,
      currentValue: spec.currentValue,
      values: spec.values,
    })) as never,
    MAX_VISIBLE,
    theme as never,
    (id, value) => {
      const result = applySettingChange(read(), id, value);
      if (result.rejected !== undefined) {
        deps.notify(result.rejected, "warning");
        // SettingsList 已經先把顯示值翻掉了,要自己翻回來,否則畫面與實際
        // 設定不一致。
        list.updateValue(id, value === "on" ? "off" : "on");
        return;
      }
      write(result.config);
    },
    () => done(),
  );
  return new Submenu(list, new Text("顯示哪幾行 — Enter/空白鍵切換 · Esc 返回", 1, 0));
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
 * 建出設定選單元件。抽出來是為了能測——這個選單的兩個 bug(游標跳回第一項、
 * 子選單選完不返回)都只有在真的餵按鍵給真的元件時才看得出來。
 *
 * themes 由呼叫端注入:pi 的 getSettingsListTheme() 在沒有 initTheme 的行程裡
 * 會拋例外,測試環境拿不到。
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
                  return linesSubmenu(
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
                if (spec.kind === "choice") {
                  return choiceSubmenu(spec, currentValue, close, themes.select, (value) => {
                    // 預覽走 applySettingChange 而不是直接塞值——非法值在這裡
                    // 就會被擋掉,不會有「預覽得出來但存不進去」的狀態。
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
        // onChange 是在 TUI 的輸入派送迴圈裡同步呼叫的,這裡拋錯會往上炸進
        // 輸入迴圈,整個介面就卡住了。
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
          deps.notify(`設定沒有存成功:${String(error)}`, "error");
        }
      },
      () => done(),
    );
    // 不在選單裡另外畫一份 HUD 預覽。
    //
    // custom 元件只取代輸入框,footer 一直掛在畫面底部而且每幀重讀 config——
    // 改一項下一幀就變。再畫一份預覽會讓畫面同時出現兩個 HUD,而預覽用的是
    // 範例資料,看起來像「HUD 跑掉了而且數字錯了」。
    return new Submenu(list, new Text(`${TITLE} — Esc 離開,改動即時生效`, 1, 0));
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
