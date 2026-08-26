import { homedir } from "node:os";
import {
  type ExtensionAPI,
  type ExtensionContext,
  getAgentDir,
} from "@earendil-works/pi-coding-agent";
import { AgentTracker } from "./collect/agents.ts";
import { type EnvCounts, sameCounts, scanEnv } from "./collect/env.ts";
import { FS_READERS } from "./collect/fs-readers.ts";
import { displayPath, isDirty } from "./collect/git.ts";
import { type Clock, createCooldown, createDebouncer, REAL_CLOCK } from "./collect/scheduler.ts";
import { ShrinkTracker } from "./collect/shrink.ts";
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
// 工具跑完到實際去問狀態之間的安靜期。一個回合連跑十幾個工具是常態,
// 每個都觸發一次就是十幾個沒必要的 git 行程與 env 掃描。
const ACTIVITY_DEBOUNCE_MS = 800;
// env 掃描要翻好幾層目錄(實測冷 ~38ms、熱 ~5ms),不像 git 那樣可以次次跑。
// 而它要偵測的東西——裝了新 skill / MCP / 套件——本來就不是每分鐘會變的。
const ENV_COOLDOWN_MS = 30_000;
const SESSION_WIDGET_KEY = "session";

async function readGitDirty(pi: ExtensionAPI, cwd: string): Promise<boolean> {
  const result = await pi.exec(
    "git",
    ["--no-optional-locks", "status", "--porcelain=v1", "--untracked-files=normal"],
    { cwd, timeout: GIT_TIMEOUT_MS },
  );
  if (result.code !== 0 || result.killed) return false;
  const summary = { staged: 0, modified: 0, untracked: 0, conflicts: 0 };
  for (const line of result.stdout.split(/\r?\n/)) {
    if (!line || line.startsWith("## ")) continue;
    const index = line[0] ?? " ";
    const worktree = line[1] ?? " ";
    if (index === "?" && worktree === "?") summary.untracked += 1;
    else if (index === "U" || worktree === "U") summary.conflicts += 1;
    else {
      if (index !== " " && index !== "!") summary.staged += 1;
      if (worktree !== " " && worktree !== "!") summary.modified += 1;
    }
  }
  return isDirty(summary);
}

// clock 只為了讓刷新排程可被測試而開的注入口。pi 載入 extension 時只傳 pi,
// 走預設值;接線「連發十個工具只該問一次 git」正是這次改動唯一會錯的地方,
// 而它埋在閉包裡就只能靠真的睡幾秒來驗證。
export default function statuslineHud(pi: ExtensionAPI, clock: Clock = REAL_CLOCK): void {
  const agentDir = getAgentDir();
  let config: HudConfig = loadConfig(agentDir);
  const tools = new ToolTally();
  const agents = new AgentTracker();
  const agentStack: string[] = [];
  let agentSeq = 0;
  let startedAt = Date.now();
  let env: EnvCounts = EMPTY_ENV;
  let gitDirty = false;
  let compactions = 0;
  let compactReason: CompactReason | null = null;
  const shrink = new ShrinkTracker();
  // 內建壓縮已經自己記過一次,它造成的 payload 下降不該再被偵測器數第二遍。
  let compactHandled = false;
  let requestRender: (() => void) | undefined;

  // 只在 PI_HUD_DEBUG 設著時才有路徑,所以正常情況下這條線完全不碰磁碟。
  const logFailure = (scope: string, error: unknown): void => {
    writeDebug(debugLogPath(process.env, agentDir), scope, error);
  };

  const activity = createDebouncer(ACTIVITY_DEBOUNCE_MS, clock);
  const envCooldown = createCooldown(ENV_COOLDOWN_MS, clock);

  const refresh = () => requestRender?.();

  const rescanEnv = (ctx: ExtensionContext) => {
    const next = scanEnv(agentDir, ctx.cwd, homedir(), FS_READERS);
    if (sameCounts(next, env)) return;
    env = next;
    refresh();
  };

  // agent 剛動完手,正是檔案與環境可能變了的時刻。兩件事共用同一個排程點:
  // git 每次都問(便宜),env 有 30 秒冷卻擋著(不便宜)。
  //
  // ctx 取事件當下傳進來的那個,不是閉包捕獲的——fork 或切分支之後 cwd 會變,
  // 而舊 ctx 指向的是上一個目錄。
  //
  // 整段包在 try 裡:這是 timer 的回呼,未捕捉的例外不會落進任何 render 的
  // try/catch,而是直接變成 uncaught exception 帶走整個 pi。
  const scheduleActivityRefresh = (ctx: ExtensionContext) => {
    activity.schedule(() => {
      try {
        refreshGitDirty(ctx.cwd);
        if (envCooldown.ready()) rescanEnv(ctx);
      } catch {}
    });
  };

  const refreshGitDirty = (cwd: string) => {
    void readGitDirty(pi, cwd)
      .then((dirty) => {
        if (dirty === gitDirty) return;
        gitDirty = dirty;
        refresh();
      })
      .catch(() => {});
  };

  // 配色隨終端明暗調整。
  //
  // 九套彩色配色都是照深底調校的,對白底只有 1.17-2.48——標籤看得見、數值
  // 看不見,而唯一的逃生口是整個關色。pi 自己有 OSC 11 背景偵測,factory
  // 傳進來的 theme 是活的,render 時讀得到當下的值。
  const currentPalette = (theme: { getFgAnsi(color: "text"): string }): Palette => {
    const palette = paletteFor(config.palettePreset, process.env);
    try {
      return isLightBackground(theme.getFgAnsi("text")) ? forLightBackground(palette) : palette;
    } catch {
      return palette;
    }
  };

  // footer 的安裝抽成具名函式,因為 session_tree 也要用。
  //
  // pi 在 fork / 切分支時會換掉 ctx.sessionManager,而 render() 閉包裡捕獲的
  // 是舊的 ctx——舊的 getEntries() 會拋例外,被 render 的 try/catch 吃掉之後
  // 就是永久空白的 footer。原版 @narumitw/pi-statusline 在這個事件會整個重裝,
  // 我們也照做。
  const installFooter = (ctx: ExtensionContext): void => {
    ctx.ui.setFooter((tui, theme, footerData) => {
      requestRender = () => tui.requestRender();
      const clock = setInterval(() => {
        refreshGitDirty(ctx.cwd);
        tui.requestRender();
      }, GIT_REFRESH_INTERVAL_MS);
      clock.unref?.();
      return {
        dispose() {
          clearInterval(clock);
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
                // 總處理量:四個欄位全加,即模型實際讀寫過的 token 總數。
                //
                // 模型沒有記憶,每一輪整份對話都要重新送一次,所以 cacheRead
                // 會遠大於其他欄位——那不是虛胖,是模型真的讀過。快取讓它變
                // 便宜(約 1/10 價),不是讓它沒發生。
                //
                // 曾經改成 input + output + cacheWrite(排除 cacheRead),理由是
                // 「數字與帳單對不起來」。那個推理是錯的:大 token 數配小帳單正是
                // 快取該有的效果,兩者不矛盾。而排除後的數字既不是存量(那是
                // Context),也不是累計,還留著 output 的重複計算——每輪的 output
                // 下一輪會變成 prompt 的一部分再算一次。
                //
                // 四欄位全加也是 provider 無關的:欄位不存在就是 0。OpenAI 式自動
                // 快取的 cacheWrite 恆為 0,Anthropic 式手動快取才有值,兩者都不必
                // 特例處理。
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
                thinkingLevel: ctx.thinkingLevel,
                compactions,
                compactReason,
                cwdName: displayPath(ctx.cwd ?? "", homedir()),
                branch: footerData.getGitBranch() ?? null,
                dirty: gitDirty,
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

  // 輸入框上方那條 session 橫線。footer 之外的另一個表面(setWidget),
  // 所以跟 installFooter 平行,不共用同一份渲染。
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
    tools.reset();
    agents.reset();
    agentStack.length = 0;
    config = loadConfig(agentDir);
    activity.cancel();
    env = scanEnv(agentDir, ctx.cwd, homedir(), FS_READERS);
    envCooldown.reset();
    refreshGitDirty(ctx.cwd);
    installFooter(ctx);
    installSessionBar(ctx);
  });

  pi.on("session_tree", (_event, ctx) => {
    // 排在飛的那次帶著舊 ctx,而 fork / 切分支正是 cwd 會換掉的時機。
    activity.cancel();
    env = scanEnv(agentDir, ctx.cwd, homedir(), FS_READERS);
    envCooldown.reset();
    refreshGitDirty(ctx.cwd);
    // 重裝而不只是重繪:捕獲的 ctx 可能已經過期。
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

  // 壓縮讓 Context 條整段掉下去。沒有這個計數,那個落差在畫面上跟「模型這輪
  // 剛好少讀一點」長得一模一樣;而 overflow 代表撞到窗口才被迫壓,跟使用者
  // 自己打的 /compact 是兩件事,所以理由也留著。
  pi.on("session_compact", (event) => {
    compactions += 1;
    compactReason = (event.reason as CompactReason | undefined) ?? null;
    compactHandled = true;
    refresh();
  });

  // 上下文被縮小這件事,不是只有內建壓縮一種做法。剪枝式的 extension 可以直接
  // 取消內建壓縮(session_compact 永遠不發),而 pi 回報的 context 估計值在那種
  // 情況下照樣往上爬——實測過,ACP 剪掉 8 則訊息時估計值從 26k 一路爬到 60k。
  //
  // 真正會踩下去的是「上一輪實際送進模型的 payload」。盯它就與機制無關:誰來縮、
  // 用什麼方式縮都算得到,插件裝了或拆了行為都一致,而且不必認得任何插件的名字。
  pi.on("turn_end", (_event, ctx) => {
    try {
      const prompt = summariseUsage(ctx.sessionManager.getEntries()).lastPrompt;
      if (compactHandled) {
        shrink.sync(prompt);
        compactHandled = false;
      } else if (shrink.observe(prompt)) {
        compactions += 1;
        compactReason = "prune";
      }
    } catch {}
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

      // 套用但不寫檔。給選單的即時預覽用——瀏覽十個配色不該寫十次磁碟,
      // 而且按 Esc 取消之後那些暫時的值不該留在檔案裡。
      const apply = (next: HudConfig): void => {
        config = next;
        // sessionBar 是掛在別的表面上的,只 refresh footer 不會讓它出現或消失。
        installSessionBar(ctx);
        refresh();
      };

      const persist = (next: HudConfig): void => {
        saveConfig(agentDir, next);
        apply(next);
      };

      // 三路分流。
      //
      // 不能用 typeof ctx.ui.custom === "function" 做能力偵測——noOpUIContext
      // 與 rpc-mode 都有這個方法,只是回傳 undefined,偵測永遠為真而使用者
      // 得到「按了沒反應」。官方的守門就是 ctx.mode。
      //
      // 也不能只看 ctx.hasUI:它在 RPC 模式為真,但那裡沒有 custom 元件。
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
          // pi-tui 換了元件形狀之類的意外——落回舊精靈,不要把使用者卡在
          // 一個打不開的選單前面。
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
