# gsc-cli

LLM-friendly command-line interface for the Google Search Console API. Designed for both humans and AI agents — every command emits a stable JSON envelope that scripts and coding agents can parse without scraping help text.

> Looking for the full project documentation, design rationale, and SDK reference? See the [monorepo README](https://github.com/awkoy/gsc-cli#readme).

## Install

```bash
npm install -g gsc-cli
# or
pnpm add -g gsc-cli
# or
bun add -g gsc-cli
```

Requires Node.js ≥ 20.

For interactive login you also need `gcloud` installed once — `gsc` uses it only for the OAuth browser flow, never to enable APIs or list projects.

| Platform | Install command |
|---|---|
| macOS | `brew install --cask google-cloud-cli` |
| Windows | `winget install Google.CloudSDK` |
| Linux | https://cloud.google.com/sdk/docs/install |

**Headless / CI**: skip `gcloud` entirely. Set `GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json` and every command except `gsc auth login` will work directly.

## Quick start

```bash
gsc auth login                                          # OAuth + project auto-select
gsc sites list                                          # list verified properties
gsc config set defaultSite sc-domain:example.com        # save default
gsc analytics query --days 30 --dimension query --limit 50
gsc inspect https://example.com/blog/launch
gsc inspect --sitemap --filter errors --concurrency 8
```

## Commands

| Command | Purpose |
|---|---|
| `gsc auth login` | OAuth via gcloud, picks/auto-enables a GCP project, persists quota |
| `gsc auth status` | Show current ADC state |
| `gsc auth logout` | Revoke ADC credentials |
| `gsc sites list \| get \| add \| delete` | Manage verified sites |
| `gsc sitemaps list \| get \| submit \| delete` | Manage sitemaps |
| `gsc analytics query` | Query search analytics with filters and dimensions |
| `gsc inspect [url]` | Inspect a URL; `--sitemap` to batch-inspect every URL in your sitemap |
| `gsc config set \| get \| path` | Manage `~/.config/gsc/config.json` |
| `gsc doctor` | Diagnostic checks for ADC, config, API reachability |

Run `gsc <command> --help` for usage.

### `gsc analytics query` filters

```bash
gsc analytics query --days 7 --dimension query \
  --filter 'page~/blog/,country=USA' --type image
```

| Operator | Meaning |
|---|---|
| `=` | equals |
| `!=` | notEquals |
| `~` | contains |
| `!~` | notContains |
| `=~` | includingRegex |
| `!=~` | excludingRegex |

`--limit` above 25,000 auto-paginates.

## Output envelope

Every command — success or failure — emits the same JSON shape on stdout:

```jsonc
// success
{
  "ok": true,
  "data": [ /* command-specific payload */ ],
  "meta": { "command": "sites list", "durationMs": 412 }
}

// error
{
  "ok": false,
  "error": {
    "code": "AUTH_FAILED",
    "message": "no project has Search Console API enabled and auto-enable failed",
    "hint": "Enable Search Console API at https://console.cloud.google.com/..."
  },
  "meta": { "command": "auth login", "durationMs": 17661 }
}
```

Stable error codes: `AUTH_MISSING`, `AUTH_FAILED`, `BAD_ARGS`, `NOT_FOUND`, `PERMISSION_DENIED`, `RATE_LIMITED`, `VALIDATION_ERROR`, `SERVER_ERROR`, `NETWORK_ERROR`.

For human-friendly output, pass `--format text` or `--format table`, or set a default:

```bash
gsc config set defaultFormat table
```

## Authentication flow

`gsc auth login`:

1. Opens a browser via `gcloud auth application-default login` for the OAuth handshake.
2. Clears any stale `quota_project_id` from the ADC file (gcloud sometimes carries one over from a previous session).
3. Lists your accessible GCP projects via Cloud Resource Manager.
4. Probes Search Console API on each project — first one that's already enabled wins.
5. If none are enabled, calls `serviceusage.services.enable` per project until one succeeds.
6. Persists the chosen quota project to your ADC file.

Skip auto-selection with `gsc auth login --project my-gcp-project`.

## Programmatic use

If you want to call the API from Node directly, use the underlying [`@gsc-cli/sdk`](https://www.npmjs.com/package/@gsc-cli/sdk) package — `gsc` is just a thin layer on top of it.

## License

MIT
