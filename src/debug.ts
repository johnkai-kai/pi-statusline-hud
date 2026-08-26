import { appendFileSync, statSync, writeFileSync } from "node:fs";
import { posix } from "node:path";

// HUD 的兩條 render 路徑都用 try/catch 包住並回傳空陣列——那是對的,渲染
// 出事不該帶走 pi。代價是壞掉的症狀只有「footer 一片空白」,例外本身連個
// 落地的地方都沒有。這個檔就是那個落地點,而且預設關著:沒設環境變數就
// 完全不碰磁碟。
const LOG_NAME = "pi-statusline-hud.log";
const OFF = new Set(["", "0", "off", "false", "no"]);
const ON = new Set(["1", "on", "true", "yes"]);

/** 記錄檔上限。超過就從頭寫,免得一個壞掉的 session 塞爆磁碟。 */
export const DEBUG_LOG_LIMIT = 256 * 1024;

/**
 * PI_HUD_DEBUG 決定要不要記、記到哪:沒設或設成 off 就回 null;設成 on/1
 * 用 agent 目錄下的預設檔名;其他值當成使用者自己指定的路徑。
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

/** 附加一筆記錄。path 為 null 或寫檔失敗都靜靜放過——除錯出口自己不能變成故障源。 */
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
