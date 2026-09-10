---
name: pi-statusline-hud-setup
description: Diagnose pi-statusline-hud installation, updating, an absent footer, colour problems or configuration changes that do not apply. For ordinary appearance changes use pi-statusline-hud.
---

# Install and diagnose the HUD

This skill guides diagnosis. The extension, not this skill, draws the footer.

## Install, update, remove

```bash
pi install git:github.com/johnkai-kai/pi-statusline-hud
pi update git:github.com/johnkai-kai/pi-statusline-hud
pi remove git:github.com/johnkai-kai/pi-statusline-hud
```

Use the command matching the user's request; do not run all three. Restart pi afterwards. Removal leaves the HUD configuration file in place.

Prefer `pi update` over manipulating the cached checkout. If the cache has local changes, report them rather than discard them with a hard reset.

## Paths

Resolve `agentDir` from `PI_CODING_AGENT_DIR` or the pi default.

- Package configuration: `<agentDir>/settings.json`; project overrides: `<cwd>/.pi/settings.json`.
- HUD configuration: `<agentDir>/pi-statusline-hud.json`.
- Package cache: `<agentDir>/git/github.com/johnkai-kai/pi-statusline-hud`.
- Opt-in installer backup: `<agentDir>/settings.json.bak-pi-statusline-hud`, with a numeric suffix if needed.

pi itself writes its installation and package settings. This package's postinstall script does not edit user configuration unless `PI_HUD_AUTOFIX=1`. Do not imply that an installation makes no filesystem changes.

## Diagnosis

1. Confirm the configured package, installed version and whether pi restarted after installation/update.
2. Inspect enabled footer extensions in global and project configuration. pi can display only one custom footer. A package with `extensions: []` is disabled and is not a footer conflict.
3. Use `pi config` to disable the chosen competing extension, or show the exact configuration change before applying it. Preserve the package and other settings unless removal was requested.
4. Validate HUD JSON. Invalid JSON uses defaults; preserve the original before fixing it.
5. Verify the requested line is enabled and the terminal has enough width.

Menu edits apply immediately. Direct JSON edits need a restart or reopening `/pi-statusline-hud`.

## Colour and the session bar

A nonempty `NO_COLOR` forces monochrome. Selecting `mono` also emits no colours. Do not blame missing `COLORTERM` or `WT_SESSION`: they are not used as capability gates.

Light-background colours are derived from the chosen preset. The HUD does not repaint the terminal background. Bars remain distinguishable as `█` and `░` without colour.

The rule above the editor uses `sessionBar`; it is independent of footer rows. An unnamed session displays a shortened session ID.

## Further evidence

Only if ordinary checks do not explain the failure, enable `PI_HUD_DEBUG=1` before starting pi. It writes a capped log at `<agentDir>/pi-statusline-hud.log`. Without the variable, logging is disabled. Logs may contain paths; inspect before sharing.

Report what was verified and what remains unknown. Do not treat configured resources as proof of successful initialization or connectivity.
