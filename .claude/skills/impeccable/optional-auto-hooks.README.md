# Optional: impeccable auto-detector hooks

By default this repo installs the **impeccable** skill so its commands run
**on demand** (e.g. `/impeccable critique`, `/impeccable polish <target>`).

impeccable also ships an *automatic* mode: `PostToolUse` + `Stop` hooks that
run its detector (`scripts/hook.mjs`) after every `Edit`/`Write`/`MultiEdit`
and when the agent stops — surfacing design findings without being asked.

This is **not enabled** here, because it auto-runs third-party code on every
edit for everyone who uses the repo. To turn it on, copy the stashed config
into place:

```bash
cp .claude/skills/impeccable/optional-auto-hooks.settings.json .claude/settings.json
```

To turn it back off, delete `.claude/settings.json` (or remove the `hooks`
block). See `optional-auto-hooks.settings.json` for the exact hook definitions.
