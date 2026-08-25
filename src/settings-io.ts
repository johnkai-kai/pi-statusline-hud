import { readFileSync, writeFileSync } from "node:fs";
import {
  agentSettingsPath,
  configFilePath,
  DEFAULT_CONFIG,
  type HudConfig,
  parseConfig,
  serialisableConfig,
} from "./config.ts";

export function loadConfig(agentDir: string): HudConfig {
  try {
    return parseConfig(JSON.parse(readFileSync(configFilePath(agentDir), "utf-8")));
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

export function saveConfig(agentDir: string, config: HudConfig): void {
  const serialisable = serialisableConfig(config);
  writeFileSync(
    configFilePath(agentDir),
    `${JSON.stringify(serialisable, null, 2)}\n`,
    "utf-8",
  );
}

export function readAgentPackages(agentDir: string): unknown {
  try {
    const raw: unknown = JSON.parse(readFileSync(agentSettingsPath(agentDir), "utf-8"));
    if (typeof raw !== "object" || raw === null) return undefined;
    return (raw as Record<string, unknown>).packages;
  } catch {
    return undefined;
  }
}
