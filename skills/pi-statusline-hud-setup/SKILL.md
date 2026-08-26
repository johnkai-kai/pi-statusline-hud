---
name: pi-statusline-hud-setup
description: Troubleshoot pi-statusline-hud failing to install or failing to appear. Use when the user says the HUD is missing, the footer is blank, the colours are wrong, a setting had no effect, or asks how to install, update or remove it. For appearance changes only, use pi-statusline-hud instead.
---

# pi-statusline-hud install and troubleshooting

## Which half is yours

The package has three configuration paths; you are **one half of one of them**:

| Path | Who runs it | Covers |
|---|---|---|
| `/pi-statusline-hud` | the package's own native menu | click through each item, fastest, no agent involved |
| `pi-statusline-hud` skill | another skill | adjusting the look by conversation |
| **this skill** | **you** | **will not install, not visible, changes not taking effect** |

Appearance questions (which rows to show, changing the palette, editing the motto) are not yours: hand them to the `pi-statusline-hud` skill, or tell the user to run `/pi-statusline-hud`.

## Key paths

`agentDir` is usually `~/.pi/agent`.

| Thing | Location |
|---|---|
| package list | `packages` in `<agentDir>/settings.json` |
| this package's config | `<agentDir>/pi-statusline-hud.json` |
| git package cache | `<agentDir>/git/github.com/johnkai-kai/pi-statusline-hud` |
| install-time backup | `<agentDir>/settings.json.bak-pi-statusline-hud` (numbered if one exists) |

## Install

```
pi install git:github.com/johnkai-kai/pi-statusline-hud
```

**pi must be restarted afterwards.**

**Installing writes no files.** It only prints any footer conflict it detects and the manual steps. To let it act (backing up `settings.json` first), reinstall with `PI_HUD_AUTOFIX=1`.

## Diagnosis order

**One check at a time, in order.** Most cases end at step 1 or 2.

### 1. Was pi restarted

**Installing a package or updating the cache needs a restart. Changing a setting does not.**

Changes made in the `/pi-statusline-hud` menu apply immediately; an agent editing the JSON directly needs a restart (or one run of the menu). So "I changed it and nothing happened" needs clarifying first — if they used the menu, restarting is not the answer, go to step 2.

### 2. Another package took the footer

pi's footer **can only be held by one extension**, so with both installed you see one of them.

Read `packages` in `<agentDir>/settings.json` and look for an entry whose name contains `statusline` or `footer` and is not `pi-statusline-hud` — `npm:@narumitw/pi-statusline`, for example. If there is one, ask them to remove that line and restart.

### 3. The package is not in the list at all

No `pi-statusline-hud` in `packages` means the install did not succeed; run the install command again.

### 4. The git cache is stuck on an old version

**This is specific to `git:` sources: pi does not update them automatically.** Upstream pushes a new commit while the local cache stays old, and the symptom is "you say you fixed it but I still see the old behaviour".

Compare first:

```bash
git -C <agentDir>/git/github.com/johnkai-kai/pi-statusline-hud log --oneline -1
```

If it differs from the remote, update:

```bash
git -C <agentDir>/git/github.com/johnkai-kai/pi-statusline-hud fetch origin
git -C <agentDir>/git/github.com/johnkai-kai/pi-statusline-hud reset --hard origin/master
```

Then restart pi.

### 5. A broken config file

When `<agentDir>/pi-statusline-hud.json` is not legal JSON, **the whole thing falls back to the defaults** rather than crashing the footer — the footer renders every turn, and a crash there makes pi unusable.

So the symptom is "my settings did not take", not "the display broke". Read the file and check that the JSON is valid.

### 6. Every line is switched off

With `lines` down to `repo` and `tools`, no git branch, and no tool run yet, both rows render empty and it looks like there is no HUD. There is a fallback (a forced `status` line when everything is empty), but if they have set `lines` to something odd, look here first.

## Wrong colours

**This package does not sniff terminal capability.** An early version read `COLORTERM` and `WT_SESSION` and fell back to `mono` when neither was set — but those two are conventions, and **unset does not mean unsupported** (Git Bash's MinTTY sets neither and supports truecolor fully). Colour now always applies.

So a completely colourless HUD leaves one possibility: **the `NO_COLOR` environment variable has a value.**

```bash
echo "[$NO_COLOR]"          # bash
echo "[$env:NO_COLOR]"      # PowerShell
```

The filled and unfilled parts of a bar are **two different characters** (`█` and `░`), not one block in two colours, so the ratio is readable with colour off. If they see one solid bar, that is an old version — go back to step 4 and update the cache.

## The session rule is missing

For the rule above the input box carrying the session name, two possibilities:

1. **`sessionBar` is `off`** — check `<agentDir>/pi-statusline-hud.json`.
2. **The terminal is too narrow** — below the width needed for a readable rule, nothing is drawn rather than something broken.

Showing `#a3f9c1` instead of a name is **not a fault**: that is the fallback before the session is named, the first six of the session id.

## Odd characters in a name disappeared

Every piece of external text that reaches the screen — model id, provider, tool names, MCP server names, session name, git branch, directory name, motto — is stripped of ANSI escapes, OSC sequences, C0/C1 controls and bidi direction overrides.

**This is deliberate, not a bug.** Some of those strings are not typed by the user: the session name is written by the agent into `session_info`, and tool and MCP server names come from third-party packages. Passing them through untouched hands over the terminal's control channel (OSC 52 writes the clipboard, OSC 0 changes the window title, CSI clears the screen), and the HUD's width calculation treats escapes as zero-width, so **the layout never shifts and nothing looks wrong**.

CJK, emoji, punctuation and box-drawing characters are unaffected.

## Removal

Remove the line from `packages` and restart. The config file `pi-statusline-hud.json` is not deleted automatically; keeping it for next time is fine.

If the install touched `settings.json`, the backup is at `<agentDir>/settings.json.bak-pi-statusline-hud`; renaming it back restores it.

## Seeing a swallowed exception

The footer and the session rule are each wrapped in try/catch and return an empty array when rendering fails — so breakage looks like a blank line, not a crash. To see what actually happened, have them restart pi with `PI_HUD_DEBUG`:

```bash
PI_HUD_DEBUG=on pi              # writes to <agentDir>/pi-statusline-hud.log
PI_HUD_DEBUG=/tmp/hud.log pi    # or a path of your own
```

Each record is `time [scene] stack`, and the scene is only ever `footer` or `session-bar`. With the variable unset nothing is written at all; the log is capped at 256 KB and wraps.

**Use this only when steps 1 through 6 turn up nothing** — it answers "why did it break", not "did it install".

## Boundaries

- **Read any file out to the user before changing it**, `settings.json` above all — it holds the config for their other packages.
- Do not decide for them which conflicting package to remove: name it and ask.
- If the diagnosis runs out, say plainly how far you got and what is still unexcluded rather than guessing and editing.
