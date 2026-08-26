import { DEFAULT_CONFIG, detectFooterConflicts, packageSpec, serialisableConfig } from "./config.ts";

export const SETTINGS_FILE = "settings.json";
export const CONFIG_FILE = "pi-statusline-hud.json";
export const BACKUP_BASE = "settings.json.bak-pi-statusline-hud";

export interface PlanInput {
  settingsRaw: string | undefined;
  configExists: boolean;
  existingBackups: readonly string[];
  /**
   * Whether touching the user's settings.json is allowed. **Off by default.**
   *
   * An install script that edits a config file in the home directory during someone else's
   * `npm install`, unasked, is the standard supply-chain pattern — security scanners flag it,
   * and it fires inside completely unrelated CI and docker builds. Auto-clearing a footer
   * conflict is nowhere near worth that, so it is explicit opt-in.
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

// Take the spec through the same packageSpec that detection uses, then compare.
//
// Detection recognised both the string and the { source } form, removal only the string — so
// an object-form conflict was "detected but not removable" while the message still said
// "removed" and the footer stayed hijacked. Both sides must share one function or they drift.
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
    `  1. Open <agentDir>/${SETTINGS_FILE}`,
    `  2. Remove from the packages array: ${conflicts.join(", ")}`,
    "  3. Restart pi",
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
        ? `<agentDir>/${SETTINGS_FILE} not found; skipping the footer conflict check.`
        : `<agentDir>/${SETTINGS_FILE} could not be parsed; changing nothing, to be safe.`,
    );
  } else if (conflicts.length === 0) {
    messages.push("No other footer-grabbing package detected.");
  } else if (!input.autofix) {
    messages.push(
      `Footer-grabbing package detected: ${conflicts.join(", ")}`,
      "This package does not edit your config by default. To handle it yourself:",
      ...manualSteps(conflicts),
      "To let the installer do it (with a backup first), reinstall with PI_HUD_AUTOFIX=1.",
    );
  } else {
    backupName = nextBackupName(input.existingBackups);
    nextSettingsJson = `${JSON.stringify(withoutPackages(settings, conflicts), null, 2)}\n`;
    messages.push(
      `Footer-grabbing package detected: ${conflicts.join(", ")}`,
      "Why: pi's footer can only be held by one extension, so with both installed you see one of them.",
      `Backed up: <agentDir>/${backupName}`,
      `Removed from packages in <agentDir>/${SETTINGS_FILE}: ${conflicts.join(", ")}`,
      "To undo, rename the backup back to the original filename.",
    );
  }

  // The config file is likewise only written on explicit opt-in.
  //
  // loadConfig already returns the defaults when the file is missing, so writing it at install
  // time buys nothing functionally — it is one unnecessary write to the home directory. By
  // default this script writes not a single byte.
  const writeConfig = input.autofix && !input.configExists;
  const configMessages = input.autofix
    ? [
        writeConfig
          ? `Default config written: <agentDir>/${CONFIG_FILE}`
          : `<agentDir>/${CONFIG_FILE} already exists; keeping your settings.`,
        "Takes effect after restarting pi; adjust later with /pi-statusline-hud.",
      ]
    : [
        "This package writes no files at install time. With no config file, the defaults apply.",
        "Takes effect after restarting pi; adjust later with /pi-statusline-hud.",
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
