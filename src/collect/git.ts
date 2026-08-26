export interface GitStatus {
  staged: number;
  modified: number;
  untracked: number;
  conflicts: number;
}

const NEWLINE = String.fromCharCode(10);
const CR = String.fromCharCode(13);

export const CLEAN_STATUS: GitStatus = { staged: 0, modified: 0, untracked: 0, conflicts: 0 };

/**
 * 解析 `git status --porcelain=v1`。兩欄狀態碼:第一欄是暫存區、第二欄是工作區,
 * 同一個檔可以兩邊都非空(`MM` = 暫存過又再改過),所以那是兩次計數不是一次。
 *
 * 這四個數字以前算完就被 isDirty 壓成一個 boolean 丟掉了。
 */
export function parseStatus(stdout: string): GitStatus {
  const status: GitStatus = { ...CLEAN_STATUS };
  for (const raw of stdout.split(NEWLINE)) {
    const line = raw.endsWith(CR) ? raw.slice(0, -1) : raw;
    if (!line || line.startsWith("## ")) continue;
    const index = line[0] ?? " ";
    const worktree = line[1] ?? " ";
    if (index === "?" && worktree === "?") status.untracked += 1;
    else if (index === "U" || worktree === "U") status.conflicts += 1;
    else {
      if (index !== " " && index !== "!") status.staged += 1;
      if (worktree !== " " && worktree !== "!") status.modified += 1;
    }
  }
  return status;
}

function segments(path: string): string[] {
  return path.split(/[\\/]+/).filter((p) => p.length > 0);
}

export function dirName(cwd: string): string {
  const parts = segments(cwd);
  return parts.length > 0 ? parts[parts.length - 1] : "";
}

const ROOT_LABEL = "/";

export function displayPath(cwd: string, home: string): string {
  const parts = segments(cwd);
  const homeParts = segments(home);
  // 磁碟根或空路徑沒有「最末一段」可取。回傳可見的佔位符而非空字串,
  // 否則整個 repo 段會被當成空內容濾掉,第一行右側會莫名其妙變空白。
  const last = parts.length > 0 ? parts[parts.length - 1] : ROOT_LABEL;
  if (homeParts.length === 0 || parts.length < homeParts.length) return last;
  const under = homeParts.every((p, i) => p.toLowerCase() === parts[i].toLowerCase());
  if (!under) return last;
  return parts.length === homeParts.length ? "~" : `~/${last}`;
}

export function isDirty(summary: GitStatus): boolean {
  return (
    summary.staged > 0 || summary.modified > 0 || summary.untracked > 0 || summary.conflicts > 0
  );
}
