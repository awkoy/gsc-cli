---
"@gsc-cli/cli": patch
---

Read CLI version from `package.json` at build time instead of hardcoding it, so `gsc --help` always reports the published version.
