import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const TAG = "pi-statusline-hud:";

function log(line) {
  console.log(`${TAG} ${line}`);
}

function resolveAgentDir() {
  const fromEnv = process.env.PI_CODING_AGENT_DIR;
  if (typeof fromEnv === "string" && fromEnv.trim() !== "") return fromEnv;
  const home = homedir();
  if (typeof home !== "string" || home === "") return null;
  return join(home, ".pi", "agent");
}

function readText(path) {
  try {
    return readFileSync(path, "utf-8");
  } catch {
    return undefined;
  }
}

function listBackups(agentDir, base) {
  try {
    return readdirSync(agentDir).filter((name) => name.startsWith(base));
  } catch {
    return [];
  }
}

async function main() {
  const agentDir = resolveAgentDir();
  if (agentDir === null || !existsSync(agentDir)) {
    log("No pi agent directory found; skipping automatic setup. Restart pi after installing to use the defaults.");
    return;
  }

  const install = await import(pathToFileURL(join(HERE, "..", "src", "install.ts")).href);
  const { planInstall, BACKUP_BASE, CONFIG_FILE, SETTINGS_FILE } = install;

  const settingsPath = join(agentDir, SETTINGS_FILE);
  const configPath = join(agentDir, CONFIG_FILE);
  const settingsRaw = readText(settingsPath);

  const plan = planInstall({
    settingsRaw,
    configExists: existsSync(configPath),
    existingBackups: listBackups(agentDir, BACKUP_BASE),
    // The user's config is left alone by default; changing it needs an explicit opt-in.
    autofix: process.env.PI_HUD_AUTOFIX === "1",
  });

  if (plan.backupName !== null && plan.nextSettingsJson !== null && settingsRaw !== undefined) {
    writeFileSync(join(agentDir, plan.backupName), settingsRaw, "utf-8");
    writeFileSync(settingsPath, plan.nextSettingsJson, "utf-8");
  }
  for (const line of plan.settingsMessages) log(line);

  if (plan.writeConfig && plan.configJson !== null) {
    writeFileSync(configPath, plan.configJson, "utf-8");
  }
  for (const line of plan.configMessages) log(line);
}

try {
  await main();
} catch (error) {
  const reason = error instanceof Error ? error.message : String(error);
  log(`Automatic setup skipped (${reason}). Restart pi; adjust later with /pi-statusline-hud if needed.`);
}
process.exitCode = 0;
