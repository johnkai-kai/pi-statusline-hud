import { appendFileSync, statSync, writeFileSync } from "node:fs";
import { posix } from "node:path";

// Both of the HUD's render paths are wrapped in try/catch and return an empty array — which
// is right, a rendering fault should not take pi down. The cost is that the only symptom is
// a blank footer, and the exception itself has nowhere to land. This file is that landing
// place, and it is off by default: with the env var unset it never touches the disk.
const LOG_NAME = "pi-statusline-hud.log";
const OFF = new Set(["", "0", "off", "false", "no"]);
const ON = new Set(["1", "on", "true", "yes"]);

/** Log size cap. Past it, writing wraps, so a broken session cannot fill the disk. */
export const DEBUG_LOG_LIMIT = 256 * 1024;

/**
 * PI_HUD_DEBUG decides whether and where to log: unset or off returns null; on/1 uses the
 * default filename under the agent directory; anything else is treated as a path.
 */
export function debugLogPath(env: Record<string, string | undefined>, agentDir: string): string | null {
  const raw = env.PI_HUD_DEBUG?.trim();
  if (raw === undefined) return null;
  const lower = raw.toLowerCase();
  if (OFF.has(lower)) return null;
  if (ON.has(lower)) return posix.join(agentDir, LOG_NAME);
  return raw;
}

function describe(error: unknown): string {
  if (error instanceof Error) return error.stack ?? `${error.name}: ${error.message}`;
  return String(error);
}

/** Appends one record. A null path or a failed write is swallowed — the debug exit must not
 *  become a failure source itself. */
export function writeDebug(path: string | null, scope: string, error: unknown): void {
  if (path === null) return;
  const line = `${new Date().toISOString()} [${scope}] ${describe(error)}\n`;
  try {
    let size = 0;
    try {
      size = statSync(path).size;
    } catch {}
    if (size >= DEBUG_LOG_LIMIT) writeFileSync(path, line);
    else appendFileSync(path, line);
  } catch {}
}
