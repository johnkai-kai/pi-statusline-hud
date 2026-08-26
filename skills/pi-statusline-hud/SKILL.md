---
name: pi-statusline-hud
description: Adjust the look of the pi-statusline-hud footer through conversation. Use when the user asks in natural language to change what the statusline / HUD / footer / status bar shows, its palette, its rows, or its motto. If they would rather click through a menu, point them at /pi-statusline-hud. If it will not install or the HUD is not visible at all, use pi-statusline-hud-setup instead.
---

# pi-statusline-hud appearance

## Which half is yours

The package has three configuration paths; you are one of them:

| Path | Who runs it | Covers |
|---|---|---|
| `/pi-statusline-hud` | the package's own native menu | click through each item, fastest, no agent involved |
| **this skill** | **you** | **adjusting the look by conversation** |
| `pi-statusline-hud-setup` skill | another skill | will not install, not visible, changes not taking effect |

**Yours is the natural-language half**: the user does not want a menu, they say "too noisy", "I cannot see the cost", "turn the colours off". Walk them through it in conversation rather than handing them a menu.

If they want to click item by item, tell them `/pi-statusline-hud` is faster. **If they say "installed but I see nothing", "changed it and nothing happened", or "everything is white", that belongs to `pi-statusline-hud-setup`.**

## Config file

`<agentDir>/pi-statusline-hud.json`, where `agentDir` is usually `~/.pi/agent`.
Unreadable means all defaults. To change something, rewrite the whole file.

## Schema

| Key | Type | Default | Meaning |
|---|---|---|---|
| `lines` | string[] | all seven | which footer rows to show, in array order. Legal values: `header`, `repo`, `meters`, `cache`, `env`, `tools`, `status` |
| `motto` | string | `""` | custom text at the end of the first line |
| `sessionBudget` | number | 10000000 | denominator of the Session bar, a purely visual ruler. Session is **total throughput** (see below), far larger than intuition suggests; set it too small and the bar is full all day |
| `maxToolEntries` | number | 7 | how many entries the tools line lists |
| `icons` | `"on"` / `"off"` | `"on"` | emoji and symbols. **Written `on` / `off` in both the config file and the wizard**, which is more obvious than true / false; old booleans still read back |
| `sessionBar` | `"on"` / `"off"` | `"on"` | the rule above the input box carrying the session name. **Not part of `lines`** — `lines` is the seven footer rows, this is a different surface |
| `rainbow` | `RainbowTarget[]` | `[]` | which elements flow as a per-character rainbow. **Orthogonal** to `palettePreset`: the theme still owns everything else. Empty array = fully off, down to never installing the animation tick |
| `palettePreset` | string | `tokyo-night` | one of sixteen: `tokyo-night` (cool analogous, default), `ember` (warm analogous), `triad` (120 degree triad), `dusk` (low chroma), `neon` (high chroma), `deep-sea`, `jade`, `amber-crt`, `lava`, `synthwave`, `ash` (near-neutral), `min-paper`, `min-night`, `min-zero` (all grey, semantic colours included), `min-alert-dark` (colour only for bad news), `mono` (emits no colour codes at all). Unknown values fall back to `tokyo-night` (the old `contra`, `split`, `single` and `tetra` are gone and fall back automatically). `NO_COLOR` in the environment forces `mono` at runtime; otherwise colour always applies — the terminal is not sniffed |

## Two surfaces

Two separate things move on screen; do not mix them up.

**The footer.** `lines` takes seven names but draws five rows: `repo` folds into the right of `header`, and `cache` folds onto the end of `meters`.

1. `header` — `[model · window] │ effort │ provider │ elapsed │ motto`. The effort comes from pi's `thinkingLevel`; when it is `off`, or this pi has no such concept, the group takes no space. With `icons` off the 🧠 prefix becomes `think`. repo is right-aligned at the end.
2. `repo` — `directory git:(branch)` in the header's right segment, followed by the change breakdown `+3 ~5 ?2 !1` (staged / modified / untracked / conflicts; zeroes omitted, and the breakdown yields first when the first line cannot fit the model name). A directory under home shows as `~/lastSegment`, leaking no account name.
3. `meters` — Context and Session side by side. A shrunk context adds `↓N` after the Context percentage (N = shrinks this session); when the last one was `overflow` (forced by hitting the window) it is red, otherwise amber. **Two detection paths, mechanism-independent**: (a) pi's built-in compaction fires `session_compact` and the reason comes from the event; (b) a pruning extension can cancel the built-in compaction so the event never fires, and pi's reported context estimate keeps climbing anyway, so the payload actually sent last turn (`input + cacheRead + cacheWrite`) is watched too — a step down counts once, with the reason recorded as `prune`. Both paths share a counter and dedupe, so behaviour is the same with a pruning plugin installed or removed. The threshold is a drop of a tenth *and* at least 1000 tokens, which filters normal drift.
4. `cache` — the third group at the end of the meters row: cache hit rate.
5. `env` — AGENTS.md / MCPs / extensions / skills counts. Extensions and skills cover both the user level `<agentDir>/settings.json` and the project level `<cwd>/.pi/settings.json`. MCPs merge six shared and pi-specific config files, each file's own compatibility `imports` (unaffected by `hostConfigDiscovery`), the automatic discovery of every host kind when `settings.hostConfigDiscovery` is `on`, and package `pi.mcp` entries — deduped by server name.
6. `tools` — per-tool call counts for this session. A tool that reported a failure gets a red `!N` after its count, which survives `icons` being off (it is not decoration).
7. `status` — live agents, running tools, generation speed, time to first token, cost. The first two vanish entirely when both are zero; on a narrow terminal the drop order is cost, speed, TTFT, then those two — not layout order. The speed is followed by a trend of the last few messages, `▁▄▆█` (scaled to the window's own min-max, nothing drawn below two samples, first to go when space is tight). The speed has two identities: mid-stream `~41 tok/s` (dim, estimated from delta events over the last 5 seconds), and after the message lands `33 tok/s` (normal colour, `usage.output / generation time`). Timing starts at the first token, excluding TTFT, and the delta-to-token ratio recalibrates on every landed message rather than being hardcoded. Asked why the streaming figure is an estimate: providers do not report token counts mid-stream — measured, `usage.output` was 0 across all 885 samples.

Turning `repo` off only removes the right segment of row 1; turning `cache` off only removes the third group of row 2. Neither leaves a blank row.

**The session rule (above the input box).** Controlled by `sessionBar` alone, unrelated to `lines`. The session name comes from pi's `session_info`; before it is named, `#` plus the first six of the session id is shown.

## Context vs Session vs Cache (a common question)

The premise: **the model has no memory, so the whole conversation is resent every turn.**

| | Question | Formula | Behaviour |
|---|---|---|---|
| Context | how thick is this conversation **right now** | current context usage as reported by pi | a level, drops on compaction |
| Session | how much has the model read and written **in total** | `input + output + cacheWrite + cacheRead` | cumulative, only grows |
| Cache | how much of the **last turn** was a re-read | `cacheRead / that turn's prompt` | a ratio, jumps around |

Asked why Session dwarfs Context: after 30 turns the earlier content has been re-read 30 times, and `cacheRead` is usually over 90% of Session. That is not padding — the model really read it; the cache just makes it about ten times cheaper.

**Session is not cost.** The three token types have very different prices; for money, read the `$` on the `status` line. A user who sets `sessionBudget` to the scale of a context window (256k, say) will see a full bar all day. A full day of conversation measured around 1.3M, so the default of ten million is a reasonable start.

## Conversation flow

**One thing at a time; do not fire seven questions at once. Do not offer preset bundles — asking item by item is more accurate.**

1. Read the current config, **draw the current layout** for the user, and ask what bothers them.
2. Change the matching key from their answer. "Too noisy" means asking which rows to cut; "I cannot see the cost" means checking whether `status` is in `lines`.
3. After each change, redraw the layout for confirmation.
4. **Write only once everything is confirmed**, listing the full before/after first:

   ```
   lines:         all seven -> header, meters, status
   palettePreset: tokyo-night -> ember
   sessionBar:    on (unchanged)
   ```

   Write when they say yes. If they stop halfway, write nothing — **a half-changed config file is worse than an unchanged one**.
5. Afterwards, remind them that **it takes effect after restarting pi** — you edited the JSON directly and no watcher tells a running pi. (The `/pi-statusline-hud` menu takes a different path and applies immediately.)

## Boundaries

- `motto` is the user's own text: write it verbatim, never polish or translate it. **The one exception is control characters** — every piece of external text is stripped of ANSI / OSC / C0-C1 / bidi overrides before it reaches the screen. That is not polishing, it is keeping a string from seizing the terminal's control channel.
- An empty or all-misspelled `lines` falls back to the seven defaults. If the user sees no change in the row count, check the spelling first.
- Write only the keys they confirmed and leave the rest untouched — the file may contain things you do not recognise.
- When unsure what the user wants, ask; do not guess and edit.
