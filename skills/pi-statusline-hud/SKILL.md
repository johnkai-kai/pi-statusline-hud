---
name: pi-statusline-hud
description: "Change pi-statusline-hud appearance through natural language: visible rows, palette, icons, motto and session bar. Use pi-statusline-hud-setup for installation or a missing footer."
---

# Configure the HUD through conversation

The extension renders the heads-up display (HUD). This skill maps a user's request to configuration; it is optional for rendering. Users who prefer a menu can run `/pi-statusline-hud`.

## Configuration

Read `<agentDir>/pi-statusline-hud.json`. Resolve agentDir from `PI_CODING_AGENT_DIR` or the pi default. Preserve unrelated and unknown keys. If the file cannot be parsed, explain the error and retain a backup before replacing it.

| Key | Type | Default | Meaning |
|---|---|---|---|
| `lines` | string[] | all seven | `header`, `repo`, `meters`, `cache`, `env`, `tools`, `status`, in display order |
| `motto` | string | `""` | user-provided text; keep wording unchanged |
| `sessionBudget` | number | `10000000` | positive integer denominator for cumulative throughput |
| `maxToolEntries` | number | `7` | positive integer tool count limit |
| `icons` | on/off | `"on"` | emoji and symbols |
| `sessionBar` | on/off | `"on"` | separate rule above the editor |
| `rainbow` | string[] | `[]` | animated targets; empty disables animation |
| `palettePreset` | string | `"tokyo-night"` | one of the ten presets below |

## Ten presets

- `tokyo-night`: cool cyan/blue with a warm orange accent; default.
- `ember`: warm adjacent orange and copper hues.
- `triad`: three spaced hue groups for distinct information roles.
- `dusk`: muted lavender neutrals for low visual intensity.
- `deep-sea`: blue with a complementary warm accent.
- `jade`: adjacent green and teal hues.
- `amber-crt`: one amber hue with lightness hierarchy.
- `synthwave`: vivid magenta with split-complementary accents.
- `min-alert-dark`: neutral information, colour reserved for warning/error.
- `mono`: no colour escape sequences; terminal foreground applies.

Retired names are migrated when read: neon → synthwave, lava → ember, ash/min-paper → dusk, min-night → min-alert-dark, min-zero → mono. Unknown names use tokyo-night. A nonempty `NO_COLOR` forces mono. The palette does not change terminal background; light-background variants are derived automatically.

## Map requests to changes

Read the current value, identify the requested keys, show the concrete before/after, and write within the user's authorization. Ask only when the choice changes the result; do not force an item-by-item questionnaire for an explicit request.

`repo` shares the header row; `cache` shares the meters row. Disabling them removes a segment. `sessionBar` is independent of `lines`.

Keep at least one valid line. Use the bundled `../../src/config.ts` parser for validation when executable in the environment. For rainbow target names consult `../../src/rainbow.ts`; do not invent identifiers.

Menu changes apply immediately. Direct JSON edits require restarting pi or reopening `/pi-statusline-hud`; there is no file watcher.

## Explain numbers accurately

- Context is pi's current context estimate.
- Session is recorded input + output + cacheWrite + cacheRead across all branches and summary calls; it is throughput, not context size or money.
- Cache uses the last successful assistant prompt on the active branch, excluding summaries and failed requests.
- Extension/skill counts use pi's configured-resource resolver and include disabled entries; they are not a live health check.
- Tool, agent and shrink counters track events since activation. Speed is shown only after success as avg tok/s: reported output tokens divided by elapsed turn time, including waiting and transport. It is not backend generation speed.
