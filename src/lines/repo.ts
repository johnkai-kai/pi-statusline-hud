import type { HudConfig } from "../config.ts";
import type { Palette } from "../palette.ts";
import type { GitStatus } from "../collect/git.ts";
import { hasRainbow } from "../rainbow.ts";
import { type HudData, type OptionalGroup, type Span, renderSpans } from "./types.ts";

// 四類改動各有記號,沿用 git 自己與大多數 shell prompt 的慣例:
// + 已暫存、~ 工作區改過、? 未追蹤、! 衝突。同一個檔可以同時算進前兩類。
const MARKS: ReadonlyArray<{ key: keyof GitStatus; mark: string; color: keyof Palette }> = [
  { key: "staged", mark: "+", color: "green" },
  { key: "modified", mark: "~", color: "amber" },
  { key: "untracked", mark: "?", color: "dim" },
  { key: "conflicts", mark: "!", color: "red" },
];

function changeSpans(git: GitStatus, palette: Palette): Span[] {
  const spans: Span[] = [];
  for (const { key, mark, color } of MARKS) {
    const count = git[key];
    if (!(count > 0)) continue;
    spans.push({ text: " ", color: null }, { text: `${mark}${count}`, color: palette[color] });
  }
  return spans;
}

/**
 * 明細放 extra:第一行把 repo 靠右釘住,它變寬就是左邊變窄。模型名稱比
 * 「未追蹤兩個檔」重要,所以擠的時候先放掉明細。
 */
export function repoGroup(data: HudData, config: HudConfig, palette: Palette): OptionalGroup {
  const core: Span[] = [{ text: data.cwdName, color: palette.blue }];
  if (data.branch === null) return { core, extra: [] };
  core.push(
    { text: " git:(", color: palette.dim },
    { text: data.branch, color: palette.green, rainbow: hasRainbow(config, "branch") },
    { text: ")", color: palette.dim },
  );
  return { core, extra: changeSpans(data.git, palette) };
}

export function repoSpans(data: HudData, config: HudConfig, palette: Palette): Span[] {
  const group = repoGroup(data, config, palette);
  return [...group.core, ...group.extra];
}

export function renderRepo(
  data: HudData,
  config: HudConfig,
  width: number,
  palette: Palette,
): string {
  return renderSpans(repoSpans(data, config, palette), width, data.elapsedMs);
}
