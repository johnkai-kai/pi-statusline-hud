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
pi uninstall git:github.com/johnkai-kai/pi-statusline-hud
```

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
| `palettePreset` | `"tokyo-night"` | one of sixteen palettes — see below |

Palettes: `tokyo-night` (cool analogous, default), `ember` (warm analogous),
`triad` (120 degree triad), `dusk` (low chroma), `neon` (high chroma), `deep-sea`,
`jade`, `amber-crt`, `lava`, `synthwave`, `ash`, `min-paper`, `min-night`,
`min-zero` (all grey, semantic colours included), `min-alert-dark` (colour only
for bad news), `mono` (emits no colour codes at all). The first five are
hand-tuned; the rest are derived from four parameters in `palette-recipe.ts`.

### The seven lines

| Line | Content |
|---|---|
| `header` | model and context window, thinking effort, provider, elapsed time, motto |
| `repo` | directory, git branch, and a change breakdown `+3 ~5 ?2 !1` (staged / modified / untracked / conflicts; zeroes omitted). **Pinned to the right of `header`**, not its own row; the breakdown is dropped first when the first line cannot fit the model name. |
| `meters` | Context and Session. `↓N` after the Context percentage counts shrinks. **Not tied to one compaction mechanism**: pi's built-in compaction fires `session_compact`, while pruning extensions (which cancel the built-in one and emit no event) are detected by the payload actually sent to the model dropping a step. Both paths share a counter and dedupe against each other. `overflow` (forced by hitting the window) is red, everything else amber. |
| `cache` | cache hit rate. **Appended to `meters`**, not its own row. |
| `env` | how many AGENTS.md files, MCPs, extensions and skills are loaded |
| `tools` | per-tool call counts for this session; failures get a red `!N` |
| `status` | live agents, running tools, generation speed, time to first token, cost. Agents and running tools **disappear entirely when both are zero**. On a narrow terminal the drop order is cost, speed, TTFT, then those two — not layout order. |

### Context vs Session vs Cache

| | Question | Formula | Behaviour |
|---|---|---|---|
| **Context** | how thick is this conversation **right now** | current context usage as reported by pi | a level — **drops** on compaction |
| **Session** | how much has the model read and written **in total** | `input + output + cacheWrite + cacheRead` | cumulative, only grows |
| **Cache** | how much of the **last turn** was a re-read | `cacheRead / that turn's prompt` | a ratio, jumps around |

### Generation speed (tok/s)

Providers do not report token counts mid-stream (measured: over a 117-second
stream, `usage.output` was 0 across all 885 samples and only jumped to 3938 on
the final event). So the number has two identities:

| Look | Meaning | How |
|---|---|---|
| `~41 tok/s` (dim) | **estimate**, mid-stream | delta events over the last 5 seconds. Measured, deltas track tokens near 1:1 (3709 : 3938). |
| `33 tok/s` (normal) | **exact**, once the message lands | `usage.output / generation time` |


## Thanks

Forked from [@narumitw/pi-statusline](https://www.npmjs.com/package/@narumitw/pi-statusline)
(MIT, © 2026 narumiruna); the original licence is kept verbatim in `LICENSE-pi-statusline`.

Layout and information density borrow from [claude-hud](https://github.com/jarrodwatts/claude-hud)
(MIT, © 2026 Jarrod Watts); the original licence is kept verbatim in `LICENSE-claude-hud`.

## License

MIT — see `LICENSE`.
