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

// 腳本以「標題 -> 依序要回傳的值」表達；undefined 代表使用者按 Esc。
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

test("parsePositiveInt 接受正整數字串", () => {
  assert.equal(parsePositiveInt("7"), 7);
  assert.equal(parsePositiveInt("  42  "), 42);
  assert.equal(parsePositiveInt("1000000"), 1_000_000);
});

test("parsePositiveInt 拒絕零、負數、小數與空值", () => {
  assert.equal(parsePositiveInt("0"), null);
  assert.equal(parsePositiveInt("-3"), null);
  assert.equal(parsePositiveInt("1.5"), null);
  assert.equal(parsePositiveInt(""), null);
  assert.equal(parsePositiveInt("   "), null);
  assert.equal(parsePositiveInt(undefined), null);
});

test("parsePositiveInt 不吃 parseInt 的前綴陷阱", () => {
  assert.equal(parsePositiveInt("42abc"), null);
  assert.equal(parsePositiveInt("7 chairs"), null);
  assert.equal(parsePositiveInt("NaN"), null);
  assert.equal(parsePositiveInt("Infinity"), null);
});

test("toggleLine 關掉已開的行", () => {
  assert.deepEqual(toggleLine(["header", "repo", "tools"], "repo"), ["header", "tools"]);
});

test("toggleLine 開啟時插回七行的正規順序", () => {
  assert.deepEqual(toggleLine(["header", "tools"], "repo"), ["header", "repo", "tools"]);
  assert.deepEqual(toggleLine(["header"], "status"), ["header", "status"]);
  assert.deepEqual(toggleLine(["tools"], "header"), ["header", "tools"]);
});

test("toggleLine 不改動輸入陣列", () => {
  const lines = ["header", "tools"] as const;
  toggleLine(lines, "repo");
  assert.deepEqual(lines, ["header", "tools"]);
});

test("lineOptionLabel 與 parseLineOption 互為往返", () => {
  for (const name of LINE_NAMES) {
    assert.equal(parseLineOption(lineOptionLabel(name, true)), name);
    assert.equal(parseLineOption(lineOptionLabel(name, false)), name);
  }
  assert.equal(parseLineOption("\u2190 返回"), null);
  assert.equal(parseLineOption("bogus  [on]"), null);
});

test("lineOptions 逐行標示目前開關狀態", () => {
  const opts = lineOptions({ ...DEFAULT_CONFIG, lines: ["header", "tools"] });
  assert.equal(opts.length, LINE_NAMES.length);
  assert.ok(opts[0].includes("on"));
  assert.ok(opts[1].includes("off"));
});

test("formatConfigSummary 涵蓋全部六個鍵", () => {
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

test("menuEntries 有十項且帶出目前值", () => {
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

test("conflictMessage 指名套件並說明怎麼移除", () => {
  const message = conflictMessage(["npm:@narumitw/pi-statusline"]);
  assert.ok(message.includes("npm:@narumitw/pi-statusline"));
  assert.ok(message.includes("packages"));
  assert.ok(message.includes("settings.json"));
  assert.ok(message.includes("重啟"));
});

test("精靈第一步就檢查 footer 衝突,沒有衝突時報 info 並進主選單", async () => {
  const h = harness([undefined], { packages: ["npm:pi-statusline-hud"] });
  await runWizard(h.deps);
  assert.equal(h.notices[0].type, "info");
  assert.ok(h.notices[0].message.includes("未偵測到"));
  assert.equal(h.prompts[0], "pi-statusline-hud 設定");
});

test("偵測到衝突時先 warning,使用者選不繼續就結束且不進主選單", async () => {
  const h = harness([], { packages: ["npm:@narumitw/pi-statusline"], confirm: false });
  await runWizard(h.deps);
  assert.equal(h.notices[0].type, "warning");
  assert.ok(h.notices[0].message.includes("npm:@narumitw/pi-statusline"));
  assert.deepEqual(h.prompts, ["footer 衝突"]);
  assert.equal(h.saved.length, 0);
});

test("偵測到衝突但使用者選繼續時仍進主選單", async () => {
  const h = harness([undefined], {
    packages: ["npm:@narumitw/pi-statusline"],
    confirm: true,
  });
  await runWizard(h.deps);
  assert.equal(h.prompts[1], "pi-statusline-hud 設定");
});

test("settings.json 讀不到時當作無衝突,不拋例外", async () => {
  const h = harness([undefined], { packages: undefined });
  await assert.doesNotReject(runWizard(h.deps));
  assert.ok(h.notices[0].message.includes("未偵測到"));
});

test("主選單選結束就收工,不寫檔", async () => {
  const h = harness(["結束"]);
  await runWizard(h.deps);
  assert.equal(h.saved.length, 0);
});

test("主選單按 Esc 會跳出迴圈而非無限重問", async () => {
  const h = harness([undefined, undefined, undefined]);
  await runWizard(h.deps);
  assert.equal(h.prompts.filter((p) => p === "pi-statusline-hud 設定").length, 1);
});

test("切一行會立刻寫檔並說明已生效", async () => {
  const h = harness([
    menuEntries(DEFAULT_CONFIG)[0].label,
    lineOptionLabel("repo", true),
    "\u2190 返回",
    "結束",
  ]);
  await runWizard(h.deps);
  assert.equal(h.saved.length, 1);
  assert.deepEqual(h.saved[0].lines, ["header", "meters", "cache", "env", "tools", "status"]);
  assert.ok(h.notices.at(-1)?.message.includes("即時套用"));
});

test("關掉最後一行會被擋下並保留原設定", async () => {
  const only: HudConfig = { ...DEFAULT_CONFIG, lines: ["header"] };
  const h = harness(
    [menuEntries(only)[0].label, lineOptionLabel("header", true), "\u2190 返回", "結束"],
    { config: only },
  );
  await runWizard(h.deps);
  assert.equal(h.saved.length, 0);
  assert.equal(h.notices.at(-1)?.type, "warning");
});

// pi 的 input 對話框收不到預填值(ExtensionInputComponent 把參數命名成
// _placeholder 之後完全不用),所以使用者看到的永遠是空框、看不到目前的
// 座右銘。直接按 Enter 就送出空字串——Esc 保資料而 Enter 毀資料,方向相反。
// 現在留空要先確認,標題也把目前值帶出來。

test("留空要清空座右銘時先確認,拒絕就不寫檔", async () => {
  const started: HudConfig = { ...DEFAULT_CONFIG, motto: "keep going" };
  const h = harness([menuEntries(started)[1].label, "", "結束"], {
    config: started,
    confirm: false,
  });
  await runWizard(h.deps);
  assert.equal(h.saved.length, 0);
  assert.equal(h.notices.at(-1)?.type, "info");
});

test("留空並確認後才真的清空", async () => {
  const started: HudConfig = { ...DEFAULT_CONFIG, motto: "keep going" };
  const h = harness([menuEntries(started)[1].label, "", "結束"], {
    config: started,
    confirm: true,
  });
  await runWizard(h.deps);
  assert.equal(h.saved.length, 1);
  assert.equal(h.saved[0].motto, "");
});

test("原本就是空的時候留空不必確認,也不寫檔", async () => {
  const h = harness([menuEntries(DEFAULT_CONFIG)[1].label, "", "結束"], { confirm: false });
  await runWizard(h.deps);
  assert.equal(h.saved.length, 0);
});

test("輸入類的標題都要帶出目前值——對話框不會預填", async () => {
  const started: HudConfig = { ...DEFAULT_CONFIG, motto: "keep going", sessionBudget: 5_000_000 };
  const h = harness([menuEntries(started)[1].label, "x", "結束"], { config: started });
  await runWizard(h.deps);
  assert.ok(
    h.prompts.some((t) => t.includes("keep going")),
    `標題沒帶出目前值: ${JSON.stringify(h.prompts)}`,
  );

  const h2 = harness([menuEntries(started)[2].label, "123", "結束"], { config: started });
  await runWizard(h2.deps);
  assert.ok(
    h2.prompts.some((t) => t.includes("5000000")),
    `標題沒帶出目前值: ${JSON.stringify(h2.prompts)}`,
  );
});

test("座右銘輸入按 Esc 時不寫檔", async () => {
  const h = harness([menuEntries(DEFAULT_CONFIG)[1].label, undefined, "結束"]);
  await runWizard(h.deps);
  assert.equal(h.saved.length, 0);
});

test("Session 預算接受正整數", async () => {
  const h = harness([menuEntries(DEFAULT_CONFIG)[2].label, "500000", "結束"]);
  await runWizard(h.deps);
  assert.equal(h.saved.at(-1)?.sessionBudget, 500_000);
});

test("Session 預算輸入非法時 warning 並保留原值", async () => {
  const h = harness([menuEntries(DEFAULT_CONFIG)[2].label, "-5", "結束"]);
  await runWizard(h.deps);
  assert.equal(h.saved.length, 0);
  assert.equal(h.notices.at(-1)?.type, "warning");
});

test("工具行上限接受正整數", async () => {
  const h = harness([menuEntries(DEFAULT_CONFIG)[4].label, "3", "結束"]);
  await runWizard(h.deps);
  assert.equal(h.saved.at(-1)?.maxToolEntries, 3);
});

test("配色選單列出兩個 preset 並能切成 mono", async () => {
  const h = harness([menuEntries(DEFAULT_CONFIG)[3].label, "mono", "結束"]);
  await runWizard(h.deps);
  // 列出的就是真的存在的那些,不另外抄一份清單——抄一份等於每加一套配色
  // 就要改兩個地方,而漏改的那一次不會被任何測試抓到。
  assert.deepEqual(h.optionSets[1], [...PALETTE_NAMES]);
  assert.equal(h.optionSets[1].at(-1), "mono", "mono 是退路,排最後");
  assert.ok(h.optionSets[1].length >= 10, "配色數量不該悄悄縮水");
  assert.equal(h.saved.at(-1)?.palettePreset, "mono");
});

test("emoji 開關可切成關", async () => {
  const h = harness([menuEntries(DEFAULT_CONFIG)[5].label, "關", "結束"]);
  await runWizard(h.deps);
  assert.equal(h.saved.at(-1)?.icons, false);
});

test("顯示目前設定用 select 呈現,不寫檔,且留在主選單", async () => {
  const h = harness(["顯示目前設定", "返回", "結束"]);
  await runWizard(h.deps);
  assert.equal(h.saved.length, 0);
  // 不能用 notify:通知會被下一幀重畫的選單蓋掉,看起來像沒反應。
  const shown = h.optionSets.at(-2) ?? [];
  assert.ok(shown.some((line) => line.startsWith("sessionBudget: ")));
  assert.ok(shown.some((line) => line.startsWith("lines: ")));
  assert.equal(shown.at(-1), "← 返回");
  assert.equal(h.prompts.filter((p) => p === "pi-statusline-hud 設定").length, 2);
});

test("主選單標籤會反映剛改完的值", async () => {
  const h = harness([menuEntries(DEFAULT_CONFIG)[4].label, "2", "結束"]);
  await runWizard(h.deps);
  assert.ok(h.optionSets.at(-1)?.some((label) => label.includes("工具行上限  [2]")));
});

test("物件形式的 packages 條目也會被判為 footer 衝突", async () => {
  const h = harness([], {
    packages: [{ source: "npm:@narumitw/pi-statusline", extensions: ["./x.ts"] }],
    confirm: false,
  });
  await runWizard(h.deps);
  assert.equal(h.notices[0].type, "warning");
  assert.ok(h.notices[0].message.includes("npm:@narumitw/pi-statusline"));
  assert.deepEqual(h.prompts, ["footer 衝突"]);
});


test("仍留著 header 或 status 時不會發出空白警告", async () => {
  const config = { ...DEFAULT_CONFIG, lines: ["header", "tools"] as const };
  const h = harness(
    [menuEntries({ ...config, lines: [...config.lines] })[0].label, lineOptionLabel("tools", true), undefined, undefined],
    { config: { ...config, lines: [...config.lines] } },
  );
  await runWizard(h.deps);
  assert.deepEqual(h.saved.at(-1)?.lines, ["header"]);
  assert.equal(h.notices.filter((notice) => notice.type === "warning").length, 0);
});

test("session 橫線可以在精靈裡關掉", async () => {
  const h = harness([menuEntries(DEFAULT_CONFIG)[6].label, "off", "結束"]);
  await runWizard(h.deps);
  assert.equal(h.saved.at(-1)?.sessionBar, false);
});

test("摘要列出 sessionBar 的 on / off", () => {
  assert.ok(summaryLines({ ...DEFAULT_CONFIG, sessionBar: false }).includes("sessionBar: off"));
});
