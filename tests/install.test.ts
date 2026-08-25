import { test } from "node:test";
import assert from "node:assert/strict";
import {
  BACKUP_BASE,
  CONFIG_FILE,
  nextBackupName,
  planInstall,
  type PlanInput,
} from "../src/install.ts";
import { DEFAULT_CONFIG, serialisableConfig } from "../src/config.ts";

function input(overrides: Partial<PlanInput> = {}): PlanInput {
  return {
    settingsRaw: JSON.stringify({ packages: [] }),
    configExists: false,
    existingBackups: [],
    autofix: false,
    ...overrides,
  };
}

const CONFLICTING = JSON.stringify({
  theme: "dark",
  packages: ["git:github.com/acme/pi-statusline", "git:github.com/acme/pi-todo"],
});

test("有衝突時計畫要備份、移除、並寫預設設定檔", () => {
  const plan = planInstall(input({ settingsRaw: CONFLICTING, autofix: true }));
  assert.deepEqual(plan.conflicts, ["git:github.com/acme/pi-statusline"]);
  assert.equal(plan.backupName, BACKUP_BASE);
  assert.equal(plan.writeConfig, true);
  const next = JSON.parse(plan.nextSettingsJson ?? "null");
  assert.deepEqual(next.packages, ["git:github.com/acme/pi-todo"]);
});

test("移除衝突時保留 settings.json 其他頂層鍵", () => {
  const plan = planInstall(input({ settingsRaw: CONFLICTING, autofix: true }));
  const next = JSON.parse(plan.nextSettingsJson ?? "null");
  assert.equal(next.theme, "dark");
});

test("本套件自己不會被當成衝突移除", () => {
  const raw = JSON.stringify({ packages: ["git:github.com/acme/pi-statusline-hud"] });
  const plan = planInstall(input({ settingsRaw: raw }));
  assert.deepEqual(plan.conflicts, []);
  assert.equal(plan.backupName, null);
  assert.equal(plan.nextSettingsJson, null);
});

test("無衝突時不備份也不改 settings.json", () => {
  const raw = JSON.stringify({ packages: ["git:github.com/acme/pi-todo"] });
  const plan = planInstall(input({ settingsRaw: raw, autofix: true }));
  assert.deepEqual(plan.conflicts, []);
  assert.equal(plan.backupName, null);
  assert.equal(plan.nextSettingsJson, null);
  assert.equal(plan.writeConfig, true);
});

test("設定檔已存在時不覆寫,並說明沿用既有設定", () => {
  const plan = planInstall(input({ configExists: true, autofix: true }));
  assert.equal(plan.writeConfig, false);
  assert.equal(plan.configJson, null);
  assert.ok(plan.messages.some((line) => line.includes("沿用既有設定")));
});

test("opt-in 時產生的設定檔 JSON 走跟 saveConfig 同一套序列化", () => {
  const plan = planInstall(input({ autofix: true }));
  assert.deepEqual(JSON.parse(plan.configJson ?? "null"), serialisableConfig(DEFAULT_CONFIG));
  assert.ok((plan.configJson ?? "").endsWith("\n"));
  assert.ok(plan.messages.some((line) => line.includes(CONFIG_FILE)));
});

test("settings.json 讀不到時不改任何東西", () => {
  const plan = planInstall(input({ settingsRaw: undefined, autofix: true }));
  assert.deepEqual(plan.conflicts, []);
  assert.equal(plan.backupName, null);
  assert.equal(plan.nextSettingsJson, null);
  assert.equal(plan.writeConfig, true);
  assert.ok(plan.messages.some((line) => line.includes("找不到")));
});

test("settings.json 壞掉時不寫回,只提示無法解析", () => {
  const plan = planInstall(input({ settingsRaw: "{ not json" }));
  assert.equal(plan.nextSettingsJson, null);
  assert.equal(plan.backupName, null);
  assert.ok(plan.messages.some((line) => line.includes("無法解析")));
});

test("settings.json 是陣列時視為無法解析", () => {
  const plan = planInstall(input({ settingsRaw: "[1,2]" }));
  assert.equal(plan.nextSettingsJson, null);
  assert.ok(plan.messages.some((line) => line.includes("無法解析")));
});

// 預設不動使用者的設定檔——安裝腳本未經詢問改家目錄設定,是供應鏈攻擊的
// 標準模式,而且會在無關的 CI 與 docker build 裡觸發。
test("預設只警告不修改,並印出手動步驟", () => {
  const plan = planInstall(input({ settingsRaw: CONFLICTING, autofix: false }));
  assert.deepEqual(plan.conflicts, ["git:github.com/acme/pi-statusline"]);
  assert.equal(plan.backupName, null);
  assert.equal(plan.nextSettingsJson, null);
  assert.ok(plan.messages.some((line) => line.includes("預設不會改你的設定檔")));
  assert.ok(plan.messages.some((line) => line.includes("PI_HUD_AUTOFIX=1")));
  assert.ok(plan.messages.some((line) => line.includes("重啟 pi")));
});

test("不自動修改時連設定檔都不寫——loadConfig 讀不到本來就回預設值", () => {
  const plan = planInstall(input({ settingsRaw: CONFLICTING, autofix: false }));
  assert.equal(plan.writeConfig, false);
  assert.equal(plan.configJson, null);
  assert.ok(plan.messages.some((line) => line.includes("不會在安裝時寫入任何檔案")));
});

test("已存在備份時不覆蓋,改用加序號的檔名", () => {
  const plan = planInstall(input({ settingsRaw: CONFLICTING, existingBackups: [BACKUP_BASE], autofix: true }));
  assert.equal(plan.backupName, `${BACKUP_BASE}-2`);
});

test("nextBackupName 會跳過所有已佔用的序號", () => {
  assert.equal(nextBackupName([]), BACKUP_BASE);
  assert.equal(nextBackupName([BACKUP_BASE]), `${BACKUP_BASE}-2`);
  assert.equal(nextBackupName([BACKUP_BASE, `${BACKUP_BASE}-2`]), `${BACKUP_BASE}-3`);
  assert.equal(nextBackupName([`${BACKUP_BASE}-2`]), BACKUP_BASE);
});

test("packages 內的非字串條目原樣保留", () => {
  const raw = JSON.stringify({ packages: ["git:github.com/acme/pi-footer", { local: "./x" }] });
  const plan = planInstall(input({ settingsRaw: raw, autofix: true }));
  const next = JSON.parse(plan.nextSettingsJson ?? "null");
  assert.deepEqual(next.packages, [{ local: "./x" }]);
});

test("缺 packages 鍵時視為無衝突", () => {
  const plan = planInstall(input({ settingsRaw: JSON.stringify({ theme: "dark" }) }));
  assert.deepEqual(plan.conflicts, []);
  assert.equal(plan.nextSettingsJson, null);
});

test("訊息一律以重啟提示收尾且不含 ANSI 逸出", () => {
  const plan = planInstall(input({ settingsRaw: CONFLICTING, autofix: true }));
  assert.ok((plan.messages.at(-1) ?? "").includes("重啟 pi"));
  assert.ok(plan.messages.every((line) => !line.includes("\u001b")));
});

test("messages 等於 settingsMessages 接 configMessages", () => {
  const plan = planInstall(input({ settingsRaw: CONFLICTING, autofix: true }));
  assert.deepEqual(plan.messages, [...plan.settingsMessages, ...plan.configMessages]);
  assert.ok(plan.settingsMessages.every((line) => !line.includes(CONFIG_FILE)));
});

test("設定檔階段的訊息與 settings.json 階段分離,可先印再寫", () => {
  const plan = planInstall(input({ settingsRaw: CONFLICTING, autofix: true }));
  assert.ok(plan.settingsMessages.some((line) => line.includes(BACKUP_BASE)));
  assert.equal(plan.configMessages.length, 2);
});

test("物件形式的衝突套件也要真的被移除——不能只印訊息", () => {
  const settings = {
    packages: [
      "pi-statusline-hud",
      { source: "npm:@narumitw/pi-statusline", autoload: true },
      { local: "./my-ext" },
    ],
  };
  const plan = planInstall(input({ settingsRaw: JSON.stringify(settings, null, 2), autofix: true }));
  assert.deepEqual(plan.conflicts, ["npm:@narumitw/pi-statusline"]);
  const next = JSON.parse(plan.nextSettingsJson ?? "null");
  assert.deepEqual(next.packages, ["pi-statusline-hud", { local: "./my-ext" }]);
});

test("沒有實際變更時不備份也不覆寫", () => {
  const settings = { packages: ["pi-statusline-hud"] };
  const plan = planInstall(input({ settingsRaw: JSON.stringify(settings, null, 2), autofix: true }));
  assert.deepEqual(plan.conflicts, []);
  assert.equal(plan.nextSettingsJson, null);
  assert.equal(plan.backupName, null);
});

test("預設情況下計畫永遠不含任何對 settings.json 的寫入", () => {
  // 這條是安全性的下限:npm install 不該在使用者沒要求時動他的設定檔。
  for (const settingsRaw of [
    CONFLICTING,
    JSON.stringify({ packages: [{ source: "npm:@narumitw/pi-statusline" }] }),
    JSON.stringify({ packages: ["a", "b"] }),
    "{ 壞掉的 json",
    undefined,
  ]) {
    const plan = planInstall(input({ settingsRaw }));
    assert.equal(plan.backupName, null, `settingsRaw=${String(settingsRaw).slice(0, 30)}`);
    assert.equal(plan.nextSettingsJson, null, `settingsRaw=${String(settingsRaw).slice(0, 30)}`);
  }
});
