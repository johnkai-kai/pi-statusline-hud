import { homedir } from "node:os";
import {
  type ExtensionAPI,
  type ExtensionContext,
  getAgentDir,
} from "@earendil-works/pi-coding-agent";
import { AgentTracker } from "./collect/agents.ts";
import { type EnvCounts, sameCounts, scanEnv } from "./collect/env.ts";
import { FS_READERS } from "./collect/fs-readers.ts";
import { type GitStatus, CLEAN_STATUS, displayPath, parseStatus } from "./collect/git.ts";
import { type Clock, createCooldown, createDebouncer, REAL_CLOCK } from "./collect/scheduler.ts";
import { ShrinkTracker } from "./collect/shrink.ts";
import { SpeedMeter } from "./collect/speed.ts";
import { History } from "./collect/history.ts";
import { FRAME_MS, shouldAnimate } from "./collect/animation.ts";
import { ToolTally } from "./collect/tools.ts";
import { summariseUsage } from "./collect/usage.ts";
import type { HudConfig } from "./config.ts";
import { debugLogPath, writeDebug } from "./debug.ts";
import { renderHud } from "./lines/index.ts";
import type { CompactReason } from "./lines/types.ts";
import { renderSessionBar, sessionLabel } from "./lines/session-bar.ts";
import { forLightBackground, isLightBackground, type Palette, paletteFor } from "./palette.ts";
import { runSettingsMenu } from "./settings-menu.ts";
import { loadConfig, readAgentPackages, saveConfig } from "./settings-io.ts";
import { formatConfigSummary, runWizard, type WizardUI } from "./wizard.ts";

const EMPTY_ENV: EnvCounts = { agentsMd: 0, mcps: 0, packages: 0, extensions: 0, skills: 0 };
const GIT_TIMEOUT_MS = 3_000;
const GIT_REFRESH_INTERVAL_MS = 30_000;
// Quiet period between a tool finishing and actually asking for status. A dozen tools in one
// turn is normal, and reacting to each is a dozen pointless git processes and env scans.
const ACTIVITY_DEBOUNCE_MS = 800;
// An env scan walks several directory levels (measured, ~38ms cold, ~5ms warm), so unlike git
// it cannot run every time. And what it detects — a new skill / MCP / package — does not change
// by the minute anyway.
const ENV_COOLDOWN_MS = 30_000;
// Repaint throttle during streaming. Measured, one long message emitted 3709 deltas over 117
// seconds (about 32/s); repainting the whole HUD for each is too dear, and the speed is for a
// human to read — updating four times a second is already faster than the eye.
const SPEED_REFRESH_MS = 250;
const SESSION_WIDGET_KEY = "session";

async function readGitStatus(pi: ExtensionAPI, cwd: string): Promise<GitStatus> {
  const result = await pi.exec(
    "git",
    ["--no-optional-locks", "status", "--porcelain=v1", "--untracked-files=normal"],
    { cwd, timeout: GIT_TIMEOUT_MS },
  );
  if (result.code !== 0 || result.killed) return CLEAN_STATUS;
  return parseStatus(result.stdout);
}

function sameStatus(a: GitStatus, b: GitStatus): boolean {
  return (
    a.staged === b.staged &&
    a.modified === b.modified &&
    a.untracked === b.untracked &&
    a.conflicts === b.conflicts
  );
}

// clock is injected purely so the refresh schedule can be tested. pi passes only pi when it
// loads an extension, so the default applies. "Ten tools back to back should ask git once" is
// the one thing this wiring can get wrong, and buried in a closure it could only be verified
// by really sleeping for a few seconds.
export default function statuslineHud(pi: ExtensionAPI, clock: Clock = REAL_CLOCK): void {
  const agentDir = getAgentDir();
  let config: HudConfig = loadConfig(agentDir);
  const tools = new ToolTally();
  const agents = new AgentTracker();
  const agentStack: string[] = [];
  let agentSeq = 0;
  let startedAt = Date.now();
  let env: EnvCounts = EMPTY_ENV;
  let gitStatus: GitStatus = CLEAN_STATUS;
  let compactions = 0;
  let compactReason: CompactReason | null = null;
  const shrink = new ShrinkTracker();
  const speed = new SpeedMeter();
  const speedTrend = new History();
  // The built-in compaction already counted itself; the payload drop it causes must not be counted again.
  let compactHandled = false;
  let requestRender: (() => void) | undefined;

  // Only has a path when PI_HUD_DEBUG is set, so normally this line never touches the disk.
  const logFailure = (scope: string, error: unknown): void => {
    writeDebug(debugLogPath(process.env, agentDir), scope, error);
  };

  const activity = createDebouncer(ACTIVITY_DEBOUNCE_MS, clock);
  const envCooldown = createCooldown(ENV_COOLDOWN_MS, clock);
  const speedRefresh = createCooldown(SPEED_REFRESH_MS, clock);

  // The rainbow's animation tick. It exists only when a target is really enabled, stops itself
  // when idle, and the next refresh brings it back — nobody who ignores the feature gets a timer.
  let frames: ReturnType<typeof setInterval> | undefined;
  let lastActivity = clock.now();
  const stopFrames = (): void => {
    if (frames === undefined) return;
    clearInterval(frames);
    frames = undefined;
  };
  const startFrames = (): void => {
    if (frames !== undefined || config.rainbow.length === 0) return;
    frames = setInterval(() => {
      if (!shouldAnimate(config.rainbow.length, clock.now() - lastActivity)) {
        stopFrames();
        return;
      }
      requestRender?.();
    }, FRAME_MS);
    frames.unref?.();
  };

  const refresh = () => {
    lastActivity = clock.now();
    startFrames();
    requestRender?.();
  };

  const rescanEnv = (ctx: ExtensionContext) => {
    const next = scanEnv(agentDir, ctx.cwd, homedir(), FS_READERS);
    if (sameCounts(next, env)) return;
    env = next;
    refresh();
  };

  // The agent has just finished touching things, exactly when files and environment may have
  // changed. Both share one scheduling point: git is asked every time (cheap), env is held off
  // by a 30-second cooldown (not cheap).
  //
  // ctx is the one handed in with the event, not the one captured by the closure — a fork or a
  // branch switch changes cwd, and the old ctx points at the previous directory.
  //
  // The whole body is inside a try: this is a timer callback, and an uncaught exception here
  // lands in no render try/catch — it becomes an uncaught exception that takes pi with it.
  const scheduleActivityRefresh = (ctx: ExtensionContext) => {
    activity.schedule(() => {
      try {
        refreshGitStatus(ctx.cwd);
        if (envCooldown.ready()) rescanEnv(ctx);
      } catch {}
    });
  };

  const refreshGitStatus = (cwd: string) => {
    void readGitStatus(pi, cwd)
      .then((status) => {
        if (sameStatus(status, gitStatus)) return;
        gitStatus = status;
        refresh();
      })
      .catch(() => {});
  };

  // The palette follows the terminal's light or dark background.
  //
  // Every colour palette is tuned for a dark background and hits only 1.17-2.48 against white —
  // labels survive, values do not, and the only escape used to be turning colour off entirely.
  // pi has OSC 11 background detection, and the theme handed to the factory is live, so render
  // reads the current value.
  const currentPalette = (theme: { getFgAnsi(color: "text"): string }): Palette => {
    const palette = paletteFor(config.palettePreset, process.env);
    try {
      return isLightBackground(theme.getFgAnsi("text")) ? forLightBackground(palette) : palette;
    } catch {
      return palette;
    }
  };

  // Installing the footer is a named function because session_tree needs it too.
  //
  // pi swaps ctx.sessionManager on a fork or branch switch, while the render() closure holds
  // the old ctx — whose getEntries() throws, gets swallowed by render's try/catch, and leaves a
  // permanently blank footer. The original @narumitw/pi-statusline reinstalls wholesale on this
  // event, and so do we.
  const installFooter = (ctx: ExtensionContext): void => {
    ctx.ui.setFooter((tui, theme, footerData) => {
      requestRender = () => tui.requestRender();
      // Not named clock: that would shadow the injected Clock, which render needs for the time.
      const ticker = setInterval(() => {
        refreshGitStatus(ctx.cwd);
        tui.requestRender();
      }, GIT_REFRESH_INTERVAL_MS);
      ticker.unref?.();
      return {
        dispose() {
          clearInterval(ticker);
          stopFrames();
          requestRender = undefined;
        },
        invalidate() {},
        render(width: number): string[] {
          try {
            const usage = ctx.getContextUsage();
            const totals = summariseUsage(ctx.sessionManager.getEntries());
            return renderHud(
              {
                model: ctx.model?.id ?? "no-model",
                contextWindow: usage?.contextWindow ?? ctx.model?.contextWindow ?? 0,
                provider: ctx.model?.provider ?? "no-provider",
                elapsedMs: Date.now() - startedAt,
                contextPercent: usage?.percent ?? null,
                contextTokens: usage?.tokens ?? 0,
                // Total throughput: all four fields, i.e. every token the model really read or wrote.
                //
                // The model has no memory, so the whole conversation is resent every turn and
                // cacheRead dwarfs the other fields — that is not padding, the model really read
                // it. The cache makes it cheap (about 1/10 the price), not absent.
                //
                // This was once changed to input + output + cacheWrite (excluding cacheRead) on
                // the grounds that "the number does not match the bill". That reasoning was
                // wrong: a large token count with a small bill is exactly what caching should do,
                // and the two do not contradict. The excluded figure was neither a level (that is
                // Context) nor a total, and it still double-counted output — each turn's output
                // becomes part of the next turn's prompt and is counted again.
                //
                // Adding all four is also provider-agnostic: a missing field is 0. OpenAI-style
                // automatic caching always has cacheWrite 0, Anthropic-style manual caching does
                // not, and neither needs a special case.
                sessionTokens: totals.total,
                cacheHitRate:
                  totals.lastPrompt > 0 ? (totals.lastCacheRead / totals.lastPrompt) * 100 : null,
                cacheRead: totals.lastCacheRead,
                promptTokens: totals.lastPrompt,
                env,
                tools: tools.top(config.maxToolEntries),
                agents: agents.activeCount(),
                runningTools: tools.runningCount(),
                cost: totals.cost,
                speed: speed.current(clock.now()),
                speedHistory: speedTrend.recent(),
                ttftMs: speed.latency(),
                thinkingLevel: ctx.thinkingLevel,
                compactions,
                compactReason,
                cwdName: displayPath(ctx.cwd ?? "", homedir()),
                branch: footerData.getGitBranch() ?? null,
                git: gitStatus,
              },
              config,
              width,
              currentPalette(theme),
            );
          } catch (error) {
            logFailure("footer", error);
            return [];
          }
        },
      };
    });
  };

  // The session rule above the input box. A different surface from the footer (setWidget), so it
  // sits beside installFooter rather than sharing its rendering.
  const installSessionBar = (ctx: ExtensionContext): void => {
    if (!config.sessionBar) {
      ctx.ui.setWidget(SESSION_WIDGET_KEY, undefined);
      return;
    }
    ctx.ui.setWidget(
      SESSION_WIDGET_KEY,
      (_tui, theme) => ({
        dispose() {},
        invalidate() {},
        render(width: number): string[] {
          try {
            const label = sessionLabel(
              ctx.sessionManager.getSessionName(),
              ctx.sessionManager.getSessionId(),
            );
            const bar = renderSessionBar(label, width, currentPalette(theme));
            return bar === "" ? [] : [bar];
          } catch (error) {
            logFailure("session-bar", error);
            return [];
          }
        },
      }),
      { placement: "aboveEditor" },
    );
  };

  pi.on("session_start", (_event, ctx) => {
    startedAt = Date.now();
    compactions = 0;
    compactReason = null;
    shrink.reset();
    compactHandled = false;
    speed.reset();
    speedTrend.reset();
    tools.reset();
    agents.reset();
    agentStack.length = 0;
    config = loadConfig(agentDir);
    activity.cancel();
    env = scanEnv(agentDir, ctx.cwd, homedir(), FS_READERS);
    envCooldown.reset();
    refreshGitStatus(ctx.cwd);
    installFooter(ctx);
    installSessionBar(ctx);
  });

  pi.on("session_tree", (_event, ctx) => {
    // The scheduled call in flight carries the old ctx, and a fork or branch switch is exactly when cwd changes.
    activity.cancel();
    // The whole history is swapped, not shrunk by anyone. Switching to a short branch always
    // drops the payload, and that is not compaction — the baseline and any in-flight compaction
    // flag are dropped together, and measuring restarts from the new branch's first entry.
    shrink.reset();
    compactHandled = false;
    env = scanEnv(agentDir, ctx.cwd, homedir(), FS_READERS);
    envCooldown.reset();
    refreshGitStatus(ctx.cwd);
    // Reinstall rather than merely repaint: the captured ctx may already be stale.
    installFooter(ctx);
    installSessionBar(ctx);
    refresh();
  });

  pi.on("tool_execution_start", (event) => {
    tools.running(event.toolName ?? "unknown");
    refresh();
  });

  pi.on("tool_execution_end", (event, ctx) => {
    const name = event.toolName ?? "unknown";
    tools.finished(name);
    tools.record(name, event.isError === true);
    refresh();
    scheduleActivityRefresh(ctx);
  });

  pi.on("agent_start", () => {
    const id = String(++agentSeq);
    agentStack.push(id);
    agents.start(id);
    refresh();
  });

  pi.on("agent_end", () => {
    const id = agentStack.pop();
    if (id !== undefined) agents.end(id);
    refresh();
  });

  // Compaction drops the whole Context bar. Without this count that drop looks exactly like
  // "the model happened to read less this turn"; and overflow means it was forced by hitting the
  // window, which is a different thing from a hand-typed /compact, so the reason is kept too.
  pi.on("session_compact", (event) => {
    compactions += 1;
    compactReason = (event.reason as CompactReason | undefined) ?? null;
    compactHandled = true;
    refresh();
  });

  // Shrinking the context is not something only the built-in compaction does. A pruning
  // extension can cancel it outright (session_compact never fires), and pi's reported context
  // estimate keeps climbing in that case — measured, with ACP pruning 8 messages the estimate
  // climbed from 26k all the way to 60k.
  //
  // What really steps down is the payload actually sent last turn. Watching it is
  // mechanism-independent: it works whoever shrinks and however, behaves the same with the
  // plugin installed or removed, and needs no plugin's name.
  //
  // Hooked on message_end rather than only turn_end: a landed assistant message brings new
  // usage, and shrinking mid-turn (which tool-driven compaction does) does not wait for
  // turn_end. When both events see the same usage the second prompt already equals the
  // baseline, so observe does not double count — the dedupe is the baseline itself, not a flag.
  //
  // Deliberately not hooked on the context event: that is a pipeline where the last handler
  // wins, and pi has no plugin priority — load order comes from fs.readdirSync. Hooking it would
  // make our own reading float with load order, and what we want (the payload actually sent) is
  // already available in the session entries.
  const observeShrink = (ctx: ExtensionContext) => {
    try {
      const prompt = summariseUsage(ctx.sessionManager.getEntries()).lastPrompt;
      if (compactHandled) {
        shrink.sync(prompt);
        compactHandled = false;
        return;
      }
      if (!shrink.observe(prompt)) return;
      compactions += 1;
      compactReason = "prune";
    } catch {}
  };

  // Generation speed.
  //
  // No token count is available mid-stream — measured over a 117-second stream, partial.usage
  // .output was 0 across all 885 samples and only jumped to 3938 on the final event. So the live
  // value can only count delta events, and the landed message brings the real token count for an
  // exact value, recalibrating "how many tokens is a delta worth" for this tokenizer on the way.
  pi.on("message_start", (event) => {
    if ((event as { message?: { role?: string } }).message?.role !== "assistant") return;
    speed.begin(clock.now());
    speedRefresh.reset();
  });

  pi.on("message_update", (event) => {
    const inner = (event as { assistantMessageEvent?: { delta?: unknown } }).assistantMessageEvent;
    if (typeof inner?.delta !== "string") return;
    speed.tick(clock.now());
    // Throttle: deltas arrive dozens per second, and following them means repainting the whole HUD as often.
    if (speedRefresh.ready()) refresh();
  });

  pi.on("message_end", (event, ctx) => {
    const message = (event as { message?: { role?: string; usage?: { output?: number } } }).message;
    if (message?.role !== "assistant") return;
    // Record only the messages that really measured something. A null from end() means this one
    // measured nothing and current() is just holding the previous value, which would draw twice.
    const precise = speed.end(clock.now(), message.usage?.output ?? 0);
    if (precise !== null) speedTrend.push(precise);
    observeShrink(ctx);
    refresh();
  });

  pi.on("turn_end", (_event, ctx) => {
    observeShrink(ctx);
    refresh();
  });

  pi.on("model_select", () => refresh());

  pi.on("session_shutdown", () => {
    activity.cancel();
    tools.reset();
    agents.reset();
    agentStack.length = 0;
  });

  pi.registerCommand("pi-statusline-hud", {
    description: "Configure the HUD with an interactive wizard",
    handler: async (_args, ctx) => {
      config = loadConfig(agentDir);
      refresh();

      // Apply without writing. For the menu's live preview — browsing sixteen palettes should
      // not write the disk sixteen times, and an Esc must not leave those temporary values behind.
      const apply = (next: HudConfig): void => {
        config = next;
        // sessionBar lives on another surface; refreshing the footer alone cannot make it appear or vanish.
        installSessionBar(ctx);
        refresh();
      };

      const persist = (next: HudConfig): void => {
        saveConfig(agentDir, next);
        apply(next);
      };

      // Three-way split.
      //
      // Capability cannot be detected with typeof ctx.ui.custom === "function" — noOpUIContext
      // and rpc-mode both have the method and merely return undefined, so the check is always
      // true and the user gets "pressed it, nothing happened". The official gate is ctx.mode.
      //
      // Nor is ctx.hasUI enough: it is true in RPC mode, which has no custom components.
      if (ctx.mode === "tui") {
        try {
          const shown = await runSettingsMenu(ctx, {
            loadConfig: () => loadConfig(agentDir),
            saveConfig: persist,
            previewConfig: apply,
            notify: (message, type) => ctx.ui.notify?.(message, type),
          });
          if (shown) return;
        } catch {
          // Something unexpected, such as pi-tui changing a component shape — fall back to the
          // old wizard rather than stranding the user in front of a menu that will not open.
        }
      }

      if (!ctx.hasUI) {
        ctx.ui.notify?.(formatConfigSummary(config), "info");
        return;
      }
      await runWizard({
        ui: ctx.ui as WizardUI,
        loadConfig: () => loadConfig(agentDir),
        saveConfig: persist,
        readPackages: () => readAgentPackages(agentDir),
      });
    },
  });
}
