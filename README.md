# gsc-cli

A LLM-friendly TypeScript CLI and SDK for the Google Search Console API.

`gsc` is built with two consumers in mind: humans who want a fast terminal workflow for managing sites, sitemaps, search analytics, and URL inspection — and AI agents that need predictable, structured output they can parse without guessing. Every command emits a uniform JSON envelope with `ok`, `data`, `error`, and `meta` fields, so a coding agent can pipe `gsc` into its own tools without screen-scraping help text.

> **Status**: pre-1.0. The command surface is stable enough to use day-to-day, but expect minor breaking changes until `v1.0.0`.

## Highlights

- **One-command auth** — `gsc auth login` walks through OAuth, picks (or auto-enables) a GCP project, and persists the quota project. No `gcloud` knowledge required beyond having it installed.
- **Structured output everywhere** — every command returns `{ ok, data, error, meta }`. Agents and shell scripts can parse it with `jq` and never see surprise prose on stdout.
- **Three formats** — `json` (default, machine-friendly), `text` (human-friendly), `table` (terminal-friendly). Switch per-command with `--format` or set a default with `gsc config set defaultFormat`.
- **Sitemap-aware bulk inspect** — `gsc inspect --sitemap` fetches your sitemap, expands index files, and inspects every URL in parallel with rate-limit-aware concurrency.
- **Filter language for analytics** — `gsc analytics query --filter 'page~/blog/,country=USA'` parses to typed filters with operators `=`, `!=`, `~`, `!~`, `=~`, `!=~`.
- **Reusable SDK** — the underlying `@gsc-cli/sdk` is a typed HTTP client with retry, rate-limiting, and caching built in. Use it directly from Node.
- **No-magic auth fallback** — set `GOOGLE_APPLICATION_CREDENTIALS` to a service account JSON and skip OAuth entirely. Works for CI and headless servers.

## Install

```bash
npm install -g @gsc-cli/cli
# or
pnpm add -g @gsc-cli/cli
# or
bun add -g @gsc-cli/cli
```

Requires Node.js ≥ 20.

For interactive login you also need `gcloud` installed once. The CLI uses it only for the OAuth browser flow — never to enable APIs, list projects, or set quota. If `gcloud` is missing, `gsc auth login` prints the install command for your platform.

| Platform | Install command |
|---|---|
| macOS | `brew install --cask google-cloud-cli` |
| Windows | `winget install Google.CloudSDK` |
| Linux / other | https://cloud.google.com/sdk/docs/install |

> **Headless / CI users**: skip `gcloud` entirely. Create a service account in your GCP project, grant it access to your Search Console property, download the JSON key, and `export GOOGLE_APPLICATION_CREDENTIALS=/path/to/key.json`. Every `gsc` command except `auth login` will use it automatically.

## Quick start

```bash
# 1. Authenticate (opens browser, picks/enables a project, persists quota)
gsc auth login

# 2. List your verified sites
gsc sites list

# 3. Set a default site so you don't repeat --site every time
gsc config set defaultSite sc-domain:example.com

# 4. Pull the last 30 days of search analytics, top 50 queries
gsc analytics query --days 30 --dimension query --limit 50

# 5. Inspect a single URL
gsc inspect https://example.com/blog/launch

# 6. Inspect every URL in your sitemap, just the ones with errors
gsc inspect --sitemap --filter errors --concurrency 8
```

## Authentication

`gsc auth login` does the entire OAuth + project-selection dance:

1. **Opens a browser** via `gcloud auth application-default login` for the OAuth handshake. (gcloud is the OAuth identity — we never use it for anything else.)
2. **Clears any stale `quota_project_id`** that gcloud may have carried over from a previous account, so the next API calls aren't poisoned by a header your fresh credentials lack permission for.
3. **Lists your accessible GCP projects** via the Cloud Resource Manager REST API using your fresh ADC credentials.
4. **Probes Search Console API** on each project with an explicit `x-goog-user-project` header. The first project where the API is already enabled wins — no propagation delay.
5. **Auto-enables the API** if no project has it on. Calls `serviceusage.services.enable` per project until one succeeds. Falls back to a clear error with a console link if none can be enabled (e.g. for accounts that only have auto-created Google service projects where Service Usage isn't bootstrapped).
6. **Persists the quota project** by writing `quota_project_id` directly to your ADC file (`~/.config/gcloud/application_default_credentials.json`). Subsequent `gsc` calls inherit it automatically through `google-auth-library`.

Override auto-selection at any time with `--project`:

```bash
gsc auth login --project my-gcp-project
```

Other auth commands:

```bash
gsc auth status   # show whether ADC is loaded and which account
gsc auth whoami   # alias for status
gsc auth logout   # revoke ADC credentials
```

## Commands

All commands accept `--format json|text|table` and most that target a site accept `--site sc-domain:example.com` (or set `defaultSite` once via `gsc config`).

### `gsc sites`

Manage verified sites in your Search Console property.

```bash
gsc sites list                                  # list all verified sites
gsc sites get --site sc-domain:example.com      # fetch one
gsc sites add https://example.com/              # add and start verification
gsc sites delete https://example.com/           # remove
```

### `gsc sitemaps`

```bash
gsc sitemaps list                               # all sitemaps for the default site
gsc sitemaps get https://example.com/sitemap.xml
gsc sitemaps submit https://example.com/sitemap.xml
gsc sitemaps delete https://example.com/sitemap.xml
```

### `gsc analytics query`

The workhorse. Pulls rows from the `searchAnalytics.query` endpoint with full dimension and filter support.

```bash
# Last 30 days, top 100 queries
gsc analytics query --days 30 --dimension query --limit 100

# Explicit date range, grouped by page + country
gsc analytics query --start 2026-01-01 --end 2026-01-31 \
  --dimension page,country

# Filter to /blog/ URLs from the US, image search type
gsc analytics query --days 7 --dimension query \
  --filter 'page~/blog/,country=USA' --type image
```

**Filter operators** (parsed in order of specificity, longest first):

| Operator | Meaning |
|---|---|
| `=` | equals |
| `!=` | notEquals |
| `~` | contains |
| `!~` | notContains |
| `=~` | includingRegex |
| `!=~` | excludingRegex |

Multiple filters are comma-separated. `--limit` above 25,000 auto-paginates.

### `gsc inspect`

URL inspection — single or batch.

```bash
# Inspect one URL
gsc inspect https://example.com/blog/launch

# Inspect every URL from your sitemap, parallelised
gsc inspect --sitemap --concurrency 8

# Show only URLs with indexing problems
gsc inspect --sitemap --filter errors

# Filter values: indexed | not-indexed | errors
```

`--concurrency` defaults to 4 and respects the SDK's token-bucket rate limiter so you won't trip API quotas.

### `gsc config`

```bash
gsc config set defaultSite sc-domain:example.com
gsc config set defaultFormat table
gsc config set quotaProjectId my-gcp-project
gsc config get                          # print full config
gsc config get defaultSite              # print one key
gsc config path                         # print config file path
```

Config lives at `~/.config/gsc/config.json` (file mode `0600`).

### `gsc doctor`

Sanity-checks your environment: ADC presence, config validity, API reachability.

```bash
gsc doctor
```

## Output envelope

Every command — success or failure — emits the same JSON shape:

```jsonc
// success
{
  "ok": true,
  "data": [ /* command-specific payload */ ],
  "meta": {
    "command": "sites list",
    "durationMs": 412,
    "rateLimit": { "remaining": 997, "resetAt": "2026-04-13T18:00:00.000Z" }
  }
}

// error
{
  "ok": false,
  "error": {
    "code": "AUTH_FAILED",
    "message": "no project has Search Console API enabled and auto-enable failed",
    "hint": "Enable Search Console API at https://console.cloud.google.com/...",
    "httpStatus": 403
  },
  "meta": { "command": "auth login", "durationMs": 17661 }
}
```

Error codes are stable: `AUTH_MISSING`, `AUTH_FAILED`, `BAD_ARGS`, `NOT_FOUND`, `PERMISSION_DENIED`, `RATE_LIMITED`, `VALIDATION_ERROR`, `SERVER_ERROR`, `NETWORK_ERROR`. `--format text` and `--format table` render the same payload for humans.

## Using the SDK directly

If you'd rather call the API from Node, the underlying SDK is published as `@gsc-cli/sdk`:

```ts
import { GSCClient } from '@gsc-cli/sdk'

const client = await GSCClient.fromCachedAuth()
const sites = await client.sites.list()

const rows = await client.analytics.query({
  siteUrl: 'sc-domain:example.com',
  startDate: '2026-01-01',
  endDate: '2026-01-31',
  dimensions: ['query', 'page'],
  rowLimit: 5000,
})
```

`fromCachedAuth()` reads your ADC credentials. For service accounts, set `GOOGLE_APPLICATION_CREDENTIALS` and call the same factory. For full control, instantiate `new GSCClient({ auth, quotaProjectId, retry, rateLimit, cache, ... })` directly.

The SDK includes:

- **`HttpClient`** with bounded retries on `429` and `5xx`.
- **`TokenBucket`** rate limiter, configurable per resource.
- **`MemoryCache`** with TTL for `GET` responses.
- Typed errors (`GSCAuthError`, `GSCRateLimitError`, `GSCNotFoundError`, etc.) you can `instanceof`.

## Repository layout

```
gsc-cli/
├── packages/
│   ├── cli/              # CLI binary, command modules, output envelope
│   │   ├── src/
│   │   │   ├── bin.ts          # citty entry point
│   │   │   ├── commands/       # one file per top-level command
│   │   │   ├── output/         # envelope + format renderers
│   │   │   ├── runner.ts       # error → envelope translation
│   │   │   ├── config.ts       # ~/.config/gsc/config.json loader
│   │   │   └── sitemap/        # sitemap.xml fetch + parse
│   │   └── test/               # vitest unit + integration suites
│   └── sdk/              # @gsc-cli/sdk — typed Node client
│       └── src/
│           ├── client.ts
│           ├── resources/      # sites, sitemaps, analytics, inspection
│           ├── transport/      # http-client, retry, rate-limit, cache
│           └── errors.ts
├── prd/                  # design docs
├── pnpm-workspace.yaml
└── package.json
```

## Development

Requires Node ≥ 20 and pnpm 9.

```bash
pnpm install
pnpm build         # build all packages (tsup)
pnpm test          # vitest unit suites across the workspace
pnpm typecheck     # tsc --noEmit on src + test configs
```

Per-package:

```bash
pnpm --filter @gsc-cli/cli build
pnpm --filter @gsc-cli/cli test
pnpm --filter @gsc-cli/sdk test
```

Run the local CLI against your own Search Console account without globally installing:

```bash
pnpm --filter @gsc-cli/cli build
node packages/cli/dist/bin.js sites list
```

## Contributing

Issues and PRs welcome. Please:

1. Open an issue first for non-trivial changes so we can agree on the shape.
2. Add or update tests — every command module has a corresponding `test/commands/*.test.ts` file.
3. Run `pnpm typecheck && pnpm test` before pushing.
4. Keep commit messages descriptive; we use Changesets for release notes.

## License

MIT
