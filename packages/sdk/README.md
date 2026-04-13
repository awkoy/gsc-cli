# @gsc-cli/sdk

A typed TypeScript client for the Google Search Console API. Powers the [`@gsc-cli/cli`](https://www.npmjs.com/package/@gsc-cli/cli) command-line tool and embeddable in any Node.js project.

> Looking for the full project documentation, the CLI usage guide, or the auth flow rationale? See the [monorepo README](https://github.com/awkoy/gsc-cli#readme).

## Install

```bash
npm install @gsc-cli/sdk
# or
pnpm add @gsc-cli/sdk
# or
bun add @gsc-cli/sdk
```

Requires Node.js ≥ 20.

## Quick start

```ts
import { GSCClient } from '@gsc-cli/sdk'

// Reads ADC credentials from your environment (gcloud login or
// GOOGLE_APPLICATION_CREDENTIALS pointing at a service account JSON).
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

For full control, instantiate the client directly:

```ts
import { GSCClient } from '@gsc-cli/sdk'
import { GoogleAuth } from 'google-auth-library'

const auth = await new GoogleAuth({
  scopes: ['https://www.googleapis.com/auth/webmasters'],
}).getClient()

const client = new GSCClient({
  auth,
  quotaProjectId: 'my-gcp-project',
  retry: { retries: 3 },
  rateLimit: { capacity: 100, refillPerSecond: 10 },
  cache: true,
  timeoutMs: 30_000,
})
```

## Resources

| Resource | Methods |
|---|---|
| `client.sites` | `list()`, `get(siteUrl)`, `add(siteUrl)`, `delete(siteUrl)` |
| `client.sitemaps` | `list({ siteUrl })`, `get({ siteUrl, feedpath })`, `submit({ siteUrl, feedpath })`, `delete({ siteUrl, feedpath })` |
| `client.analytics` | `query(input)` — full `searchAnalytics.query` surface |
| `client.inspection` | `inspect(input)` — URL inspection API |

All methods are typed end-to-end. Inputs and responses match the official Search Console API shapes.

## Transport features

- **Bounded retries** on `429 Too Many Requests` and `5xx`, with exponential backoff. Configurable via `retry`.
- **Token-bucket rate limiter** prevents trip-ups against API quotas. Configurable via `rateLimit`.
- **In-memory TTL cache** for `GET` responses. Enable with `cache: true` or pass a `MemoryCache` instance.
- **Configurable timeout** per request via `timeoutMs`.
- **Custom `fetch`** for testing or alternate environments via `fetch`.

## Typed errors

Every failure throws a typed error you can `instanceof`:

```ts
import {
  GSCAuthError,
  GSCPermissionError,
  GSCNotFoundError,
  GSCValidationError,
  GSCRateLimitError,
  GSCServerError,
  GSCNetworkError,
} from '@gsc-cli/sdk'

try {
  await client.sites.get('sc-domain:example.com')
} catch (err) {
  if (err instanceof GSCNotFoundError) {
    // 404 — site not verified
  } else if (err instanceof GSCRateLimitError) {
    // 429 — backoff and retry later
  } else if (err instanceof GSCAuthError) {
    // Missing/expired credentials
  } else {
    throw err
  }
}
```

Each error carries `code`, `message`, optional `hint`, optional `httpStatus`, and optional `requestId` for tracing.

## Authentication

The SDK uses [`google-auth-library`](https://www.npmjs.com/package/google-auth-library) and respects standard ADC discovery:

1. `GOOGLE_APPLICATION_CREDENTIALS` env var (service account JSON path) — preferred for CI and headless servers.
2. `~/.config/gcloud/application_default_credentials.json` — populated by `gcloud auth application-default login` or by `gsc auth login`.
3. GCE/GKE metadata server when running on Google Cloud.

For interactive setup on a developer machine, the easiest path is:

```bash
npm install -g @gsc-cli/cli
gsc auth login
```

…which handles OAuth, project selection, and quota-project persistence in one command. After that, this SDK reads the same ADC credentials with zero further configuration.

## License

MIT
