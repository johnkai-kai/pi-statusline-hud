export interface GitInfo {
  branch: string | null;
  dirty: boolean;
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

export function isDirty(summary: {
  staged: number;
  modified: number;
  untracked: number;
  conflicts: number;
}): boolean {
  return (
    summary.staged > 0 || summary.modified > 0 || summary.untracked > 0 || summary.conflicts > 0
  );
}
