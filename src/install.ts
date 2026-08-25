import { DEFAULT_CONFIG, detectFooterConflicts, packageSpec, serialisableConfig } from "./config.ts";

export const SETTINGS_FILE = "settings.json";
export const CONFIG_FILE = "pi-statusline-hud.json";
export const BACKUP_BASE = "settings.json.bak-pi-statusline-hud";

export interface PlanInput {
  settingsRaw: string | undefined;
  configExists: boolean;
  existingBackups: readonly string[];
  /**
   * 是否允許動使用者的 settings.json。**預設是不允許。**
   *
   * 安裝腳本在別人 `npm install` 時未經詢問就改家目錄的設定檔,是供應鏈攻擊
   * 的標準模式——會被安全掃描標記,也會在完全無關的 CI 與 docker build 裡
   * 觸發。自動清 footer 衝突的便利性遠不值得這個代價,所以改成明確 opt-in。
   */
  autofix: boolean;
}

export interface InstallPlan {
  conflicts: string[];
  backupName: string | null;
  nextSettingsJson: string | null;
  writeConfig: boolean;
  configJson: string | null;
  settingsMessages: string[];
  configMessages: string[];
  messages: string[];
}

export function nextBackupName(existing: readonly string[]): string {
  if (!existing.includes(BACKUP_BASE)) return BACKUP_BASE;
  for (let n = 2; ; n += 1) {
    const candidate = `${BACKUP_BASE}-${n}`;
    if (!existing.includes(candidate)) return candidate;
  }
}

function parseSettings(raw: string | undefined): Record<string, unknown> | null {
  if (typeof raw !== "string") return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
    return value as Record<string, unknown>;
  } catch {
    return null;
  }
}

// 用跟偵測同一支 packageSpec 取規格再比對。
//
// 偵測認字串與 { source } 兩種形式,移除卻只認字串——結果是物件形式的衝突
// 套件「偵測得到、刪不掉」,而訊息照樣印「已移除」,footer 仍被對方搶走。
// 兩邊必須共用同一個函式,不然遲早再漂移一次。
function withoutPackages(
  settings: Record<string, unknown>,
  remove: readonly string[],
): Record<string, unknown> {
  const packages = settings.packages;
  if (!Array.isArray(packages)) return { ...settings };
  const kept = packages.filter((entry) => {
    const spec = packageSpec(entry);
    return spec === null || !remove.includes(spec);
  });
  return { ...settings, packages: kept };
}

function manualSteps(conflicts: readonly string[]): string[] {
  return [
    `  1. 開啟 <agentDir>/${SETTINGS_FILE}`,
    `  2. 從 packages 陣列移除:${conflicts.join(", ")}`,
    "  3. 重啟 pi",
  ];
}

export function planInstall(input: PlanInput): InstallPlan {
  const messages: string[] = [];
  const settings = parseSettings(input.settingsRaw);
  const conflicts = settings === null ? [] : detectFooterConflicts(settings.packages);

  let backupName: string | null = null;
  let nextSettingsJson: string | null = null;

  if (settings === null) {
    messages.push(
      input.settingsRaw === undefined
        ? `找不到 <agentDir>/${SETTINGS_FILE},略過 footer 衝突檢查。`
        : `<agentDir>/${SETTINGS_FILE} 無法解析,為安全起見不做任何修改。`,
    );
  } else if (conflicts.length === 0) {
    messages.push("未偵測到會搶 footer 的其他套件。");
  } else if (!input.autofix) {
    messages.push(
      `偵測到會搶 footer 的套件:${conflicts.join(", ")}`,
      "本套件預設不會改你的設定檔。請手動處理:",
      ...manualSteps(conflicts),
      "要讓安裝腳本自動處理(會先備份),重裝時帶 PI_HUD_AUTOFIX=1。",
    );
  } else {
    backupName = nextBackupName(input.existingBackups);
    nextSettingsJson = `${JSON.stringify(withoutPackages(settings, conflicts), null, 2)}\n`;
    messages.push(
      `偵測到會搶 footer 的套件:${conflicts.join(", ")}`,
      "原因:pi 的 footer 一次只能被一個 extension 佔用,兩邊都裝時只會看到其中一個。",
      `已備份:<agentDir>/${backupName}`,
      `已從 <agentDir>/${SETTINGS_FILE} 的 packages 移除:${conflicts.join(", ")}`,
      "要還原就把備份檔改回原檔名。",
    );
  }

  // 設定檔也只在明確 opt-in 時才寫。
  //
  // loadConfig 讀不到檔案本來就回傳預設值,所以安裝時寫這個檔沒有任何功能上的
  // 必要——它只是一次不必要的家目錄寫入。預設情況下這支腳本一個位元組都不寫。
  const writeConfig = input.autofix && !input.configExists;
  const configMessages = input.autofix
    ? [
        writeConfig
          ? `已建立預設設定檔:<agentDir>/${CONFIG_FILE}`
          : `<agentDir>/${CONFIG_FILE} 已存在,沿用既有設定。`,
        "重啟 pi 後生效;之後可用 /pi-statusline-hud 調整。",
      ]
    : [
        "本套件不會在安裝時寫入任何檔案。設定檔不存在時一律套用預設值。",
        "重啟 pi 後生效;之後可用 /pi-statusline-hud 調整。",
      ];

  return {
    conflicts,
    backupName,
    nextSettingsJson,
    writeConfig,
    configJson: writeConfig ? `${JSON.stringify(serialisableConfig(DEFAULT_CONFIG), null, 2)}\n` : null,
    settingsMessages: messages,
    configMessages,
    messages: [...messages, ...configMessages],
  };
}
