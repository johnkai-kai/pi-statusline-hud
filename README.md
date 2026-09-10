# pi-statusline-hud

A multi-line HUD footer for the [pi](https://github.com/earendil-works/pi) coding agent.

```
[Model name ·context window ] │ 🧠 Thinking effort │ Provider │ ⏱ 2h36m │ <motto>          workspace   git status
Context ███░░░░░░░ 31% ↓1 79.0k/256k │ Session █░░░░░░░░░ 1.3M/10.0M │ Cache ███████░░░ 71% 241k/340k
Env 1 AGENTS.md · 2 MCPs · 8 exts · 4 skills
Tools √ bash ×15 !2 · √ read ×3 · √ mcp ×1
▶▶ 2 agents · 1 running · ⚡ 33 tok/s ▁▄▆█ · ⏱️ 0.95s · $0.00
```

## Install

```bash
pi install git:github.com/johnkai-kai/pi-statusline-hud
```

Restart pi afterwards.

If switching from another statusline, first run `pi config` and disable that
package's extensions. An explicit package filter `"extensions": []` keeps it
installed but prevents it taking the footer; this HUD does not flag that as a conflict.

Installing writes no files of its own. pi's footer can only be held by one
extension, so if another package already holds it the installer prints the
conflict and the manual fix rather than acting. To let it edit
`~/.pi/agent/settings.json` for you — backing the file up first — reinstall with
`PI_HUD_AUTOFIX=1`.

## Update

`git:` sources are not updated automatically.

```bash
pi update --extensions                                   # every package at once
pi update git:github.com/johnkai-kai/pi-statusline-hud   # just this one
```

Restart pi afterwards.

## Uninstall

```bash
pi remove git:github.com/johnkai-kai/pi-statusline-hud
```

Your settings at `~/.pi/agent/pi-statusline-hud.json` are left in place, so
reinstalling picks up where you left off. Delete the file for a clean slate.

## Config

| How | What it does |
|---|---|
| `/pi-statusline-hud` | Native menu. Changes apply immediately, no restart. |
| ask an agent to change settings | the `pi-statusline-hud` skill takes over |
| ask an agent to fix a broken install | the `pi-statusline-hud-setup` skill takes over |

Settings live in `~/.pi/agent/pi-statusline-hud.json`.

| Key | Default | Meaning |
|---|---|---|
| `lines` | all seven | which lines to show, and in what order |
| `motto` | `""` | custom text at the end of the first line |
| `sessionBudget` | `10000000` | denominator of the Session meter |
| `maxToolEntries` | `7` | how many tools the tools line lists |
| `icons` | `"on"` | emoji and symbols |
| `sessionBar` | `"on"` | the rule above the input box |
| `rainbow` | `[]` | which elements get the rainbow effect; empty = off |
| `palettePreset` | `"tokyo-night"` | one of ten palettes — see below |

Palettes: `tokyo-night` (default), `ember`, `triad`, `dusk`, `deep-sea`,
`jade`, `amber-crt`, `synthwave`, `min-alert-dark`, and `mono`.
See the [interactive theme gallery](docs/themes.html) for actual HUD previews,
colour relationships, reference-background contrast and skill explanations.
Generate it with `npm run preview:themes`.

Retired settings migrate automatically: `neon` → `synthwave`, `lava` → `ember`,
`ash` and `min-paper` → `dusk`, `min-night` → `min-alert-dark`,
and `min-zero` → `mono`.

Skills are optional agent instructions for appearance changes and installation
troubleshooting. The extension renders the HUD without them.

### The seven lines

| Line | Content |
|---|---|
| `header` | model and context window, thinking effort, provider, elapsed time, motto |
| `repo` | directory, git branch, and a change breakdown `+3 ~5 ?2 !1` (staged / modified / untracked / conflicts; zeroes omitted). **Pinned to the right of `header`**, not its own row; the breakdown is dropped first when the first line cannot fit the model name. |
| `meters` | Context and Session. `↓N` after the Context percentage counts shrinks. **Not tied to one compaction mechanism**: pi's built-in compaction fires `session_compact`, while pruning extensions (which cancel the built-in one and emit no event) are detected by the payload actually sent to the model dropping a step. Both paths share a counter and dedupe against each other. `overflow` (forced by hitting the window) is red, everything else amber. |
| `cache` | cache hit rate. **Appended to `meters`**, not its own row. |
| `env` | how many AGENTS.md files, MCPs, extensions and skills are present. Counted from the filesystem, so a resource pi has disabled still counts. **MCP is not pi's** — pi has no MCP support; the count mirrors the third-party `pi-mcp-adapter`, and without it installed the number describes config nobody reads. |
| `tools` | per-tool call counts for this session; failures get a red `!N` |
| `status` | live agents, running tools, generation speed, time to first token, cost. Agents and running tools **disappear entirely when both are zero**. On a narrow terminal the drop order is cost, speed, TTFT, then those two — not layout order. |

### Context vs Session vs Cache

The environment row uses pi's package resolver for configured extension and skill
paths, including disabled entries and excluding untrusted project resources.
It does not measure initialization success or dynamically discovered resources.
Tool, agent and shrink counters track events since session activation; session
throughput and cost are reconstructed from recorded history.

| | Question | Formula | Behaviour |
|---|---|---|---|
| **Context** | how thick is this conversation **right now** | current context usage as reported by pi | a level — **drops** on compaction |
| **Session** | how much has the model read and written **in total** | `input + output + cacheWrite + cacheRead` | cumulative, only grows |
| **Cache** | how much of the **last turn** was a re-read | `cacheRead / that turn's prompt` | a ratio, jumps around |

Session throughput and cost include all recorded branches and summary calls.
Cache uses the latest successful assistant request on the active branch, excluding
compaction/branch summaries and failed requests. Shrink detection reads the
completed message directly because pi emits `message_end` before saving it.

### Average output throughput (avg tok/s)

After a successful assistant response, the HUD divides reported output tokens by
elapsed time from pi's turn_start event to message_end. This includes context
preparation, queueing, generation and transport. It is a turn average, not the
backend's pure generation speed. Buffered delivery cannot shorten this interval.

No live token rate is inferred from chunk counts. Starting a new turn clears the
previous value. Failed, aborted, missing-usage and untimed responses produce no
speed sample. The adjacent latency measures turn start to the first content delta.

## Thanks

Developed with reference to [@narumitw/pi-statusline](https://www.npmjs.com/package/@narumitw/pi-statusline)'s use of pi's footer API
(MIT, © 2026 narumiruna); the original licence is kept verbatim in `LICENSE-pi-statusline`.

Layout and information density were inspired by [claude-hud](https://github.com/jarrodwatts/claude-hud)
(MIT, © 2026 Jarrod Watts); the original licence is kept verbatim in `LICENSE-claude-hud`.

## License

MIT — see `LICENSE`.
