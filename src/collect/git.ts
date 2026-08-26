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
 * Parses `git status --porcelain=v1`. Two status columns: the first is the index, the
 * second the worktree. One file can be non-empty in both (`MM` = staged then modified
 * again), so that counts twice, not once.
 *
 * These four numbers used to be computed and then squashed into a boolean by isDirty.
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
  // A filesystem root or an empty path has no last segment. Return a visible placeholder
  // rather than an empty string, or the whole repo group is filtered out as empty and the
  // right end of the first line inexplicably goes blank.
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
