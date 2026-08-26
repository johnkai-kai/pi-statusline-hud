import type { HudConfig } from "../config.ts";
import type { Palette } from "../palette.ts";
import type { GitStatus } from "../collect/git.ts";
import { hasRainbow } from "../rainbow.ts";
import { type HudData, type OptionalGroup, type Span, renderSpans } from "./types.ts";

// A mark per change class, following git itself and most shell prompts: + staged,
// ~ modified, ? untracked, ! conflicted. One file can count in both of the first two.
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
 * The breakdown goes in extra: the first line pins repo to the right, so widening it
 * narrows the left. The model name matters more than "two untracked files", so when space
 * is tight the breakdown goes first.
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
