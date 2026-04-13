import { defineCommand, runMain } from 'citty'
import { GSCClient } from '@gsc-cli/sdk'
import { runCommand } from './runner.js'
import { loadConfig, DEFAULT_CONFIG_PATH } from './config.js'
import { runAuthLogin, runAuthLogout, runAuthStatus } from './commands/auth.js'
import {
  runSitesList,
  runSitesGet,
  runSitesAdd,
  runSitesDelete,
} from './commands/sites.js'
import {
  runSitemapsList,
  runSitemapsGet,
  runSitemapsSubmit,
  runSitemapsDelete,
} from './commands/sitemaps.js'
import { runAnalyticsQuery } from './commands/analytics.js'
import { runInspectUrl } from './commands/inspect.js'
import { runInspectSitemap } from './commands/inspect-sitemap.js'
import { runConfigSet, runConfigGet, runConfigPath } from './commands/config-cmd.js'
import { runDoctor } from './commands/doctor.js'
import type { Format } from './output/envelope.js'
import type { Dimension, SearchType } from '@gsc-cli/sdk'

async function getClient() {
  const cfg = await loadConfig()
  const opts: Parameters<typeof GSCClient.fromCachedAuth>[0] = {}
  if (cfg.quotaProjectId !== undefined) opts.quotaProjectId = cfg.quotaProjectId
  return GSCClient.fromCachedAuth(opts)
}

async function getSite(flagSite?: string): Promise<string> {
  if (flagSite !== undefined && flagSite !== '') return flagSite
  const cfg = await loadConfig()
  if (cfg.defaultSite !== undefined) return cfg.defaultSite
  throw Object.assign(new Error('no site specified'), {
    code: 'BAD_ARGS',
    hint: 'pass --site or run `gsc config set defaultSite <url>`',
  })
}

async function resolveFormat(flag?: string): Promise<Format> {
  if (flag === 'json' || flag === 'text' || flag === 'table') return flag
  const cfg = await loadConfig()
  return cfg.defaultFormat
}

const globalArgs = {
  site: {
    type: 'string' as const,
    description: 'Site URL (e.g. https://example.com/). Overrides config default.',
  },
  format: {
    type: 'string' as const,
    description: 'Output format: json (default), text, or table',
  },
}

// ── Auth commands ──────────────────────────────────────────────────────────

const authLogin = defineCommand({
  meta: { name: 'login', description: 'Authenticate via gcloud (handles OAuth, API enablement, quota project)' },
  args: {
    readonly: { type: 'boolean' as const, description: 'Request read-only scope' },
    project: { type: 'string' as const, description: 'GCP project ID for API quota (auto-detected if omitted)' },
  },
  async run({ args }) {
    const opts: Parameters<typeof runAuthLogin>[0] = { readonly: Boolean(args.readonly) }
    if (args.project !== undefined && args.project !== '') opts.project = args.project
    await runCommand({
      command: 'auth login',
      format: await resolveFormat(),
      execute: () => runAuthLogin(opts),
    })
  },
})

const authLogout = defineCommand({
  meta: { name: 'logout', description: 'Revoke Application Default Credentials' },
  async run() {
    await runCommand({
      command: 'auth logout',
      format: await resolveFormat(),
      execute: () => runAuthLogout(),
    })
  },
})

const authStatus = defineCommand({
  meta: { name: 'status', description: 'Show current authentication state' },
  async run() {
    await runCommand({
      command: 'auth status',
      format: await resolveFormat(),
      execute: () => runAuthStatus(),
    })
  },
})

const auth = defineCommand({
  meta: { name: 'auth', description: 'Authentication commands' },
  subCommands: { login: authLogin, logout: authLogout, status: authStatus, whoami: authStatus },
})

// ── Sites commands ─────────────────────────────────────────────────────────

const sitesList = defineCommand({
  meta: { name: 'list', description: 'List verified sites' },
  args: {
    format: { type: 'string' as const, description: 'Output format: json (default), text, or table' },
  },
  async run({ args }) {
    await runCommand({
      command: 'sites list',
      format: await resolveFormat(args.format),
      execute: async () => runSitesList({ client: await getClient() }),
    })
  },
})

const sitesGet = defineCommand({
  meta: { name: 'get', description: 'Get a site' },
  args: {
    siteUrl: {
      type: 'positional' as const,
      required: true,
      description: 'Site URL (e.g. sc-domain:example.com or https://example.com/)',
    },
    format: { type: 'string' as const, description: 'Output format: json (default), text, or table' },
  },
  async run({ args }) {
    await runCommand({
      command: 'sites get',
      format: await resolveFormat(args.format),
      execute: async () => runSitesGet({ client: await getClient(), siteUrl: args.siteUrl }),
    })
  },
})

const sitesAdd = defineCommand({
  meta: { name: 'add', description: 'Add a site' },
  args: {
    siteUrl: {
      type: 'positional' as const,
      required: true,
      description: 'Site URL (e.g. sc-domain:example.com or https://example.com/)',
    },
    format: { type: 'string' as const, description: 'Output format: json (default), text, or table' },
  },
  async run({ args }) {
    await runCommand({
      command: 'sites add',
      format: await resolveFormat(args.format),
      execute: async () => runSitesAdd({ client: await getClient(), siteUrl: args.siteUrl }),
    })
  },
})

const sitesDelete = defineCommand({
  meta: { name: 'delete', description: 'Delete a site' },
  args: {
    siteUrl: {
      type: 'positional' as const,
      required: true,
      description: 'Site URL (e.g. sc-domain:example.com or https://example.com/)',
    },
    format: { type: 'string' as const, description: 'Output format: json (default), text, or table' },
  },
  async run({ args }) {
    await runCommand({
      command: 'sites delete',
      format: await resolveFormat(args.format),
      execute: async () => runSitesDelete({ client: await getClient(), siteUrl: args.siteUrl }),
    })
  },
})

const sites = defineCommand({
  meta: { name: 'sites', description: 'Manage verified sites' },
  subCommands: { list: sitesList, get: sitesGet, add: sitesAdd, delete: sitesDelete },
})

// ── Sitemaps commands ──────────────────────────────────────────────────────

const sitemapsList = defineCommand({
  meta: { name: 'list', description: 'List sitemaps' },
  args: globalArgs,
  async run({ args }) {
    await runCommand({
      command: 'sitemaps list',
      format: await resolveFormat(args.format),
      execute: async () =>
        runSitemapsList({ client: await getClient(), siteUrl: await getSite(args.site) }),
    })
  },
})

const sitemapsGet = defineCommand({
  meta: { name: 'get', description: 'Get a sitemap' },
  args: { ...globalArgs, feedpath: { type: 'positional' as const, required: true, description: 'Sitemap URL or path (e.g. sitemap.xml or https://example.com/sitemap.xml)' } },
  async run({ args }) {
    await runCommand({
      command: 'sitemaps get',
      format: await resolveFormat(args.format),
      execute: async () =>
        runSitemapsGet({
          client: await getClient(),
          siteUrl: await getSite(args.site),
          feedpath: args.feedpath,
        }),
    })
  },
})

const sitemapsSubmit = defineCommand({
  meta: { name: 'submit', description: 'Submit a sitemap' },
  args: { ...globalArgs, feedpath: { type: 'positional' as const, required: true, description: 'Sitemap URL or path (e.g. sitemap.xml or https://example.com/sitemap.xml)' } },
  async run({ args }) {
    await runCommand({
      command: 'sitemaps submit',
      format: await resolveFormat(args.format),
      execute: async () =>
        runSitemapsSubmit({
          client: await getClient(),
          siteUrl: await getSite(args.site),
          feedpath: args.feedpath,
        }),
    })
  },
})

const sitemapsDelete = defineCommand({
  meta: { name: 'delete', description: 'Delete a sitemap' },
  args: { ...globalArgs, feedpath: { type: 'positional' as const, required: true, description: 'Sitemap URL or path (e.g. sitemap.xml or https://example.com/sitemap.xml)' } },
  async run({ args }) {
    await runCommand({
      command: 'sitemaps delete',
      format: await resolveFormat(args.format),
      execute: async () =>
        runSitemapsDelete({
          client: await getClient(),
          siteUrl: await getSite(args.site),
          feedpath: args.feedpath,
        }),
    })
  },
})

const sitemaps = defineCommand({
  meta: { name: 'sitemaps', description: 'Manage sitemaps' },
  subCommands: {
    list: sitemapsList,
    get: sitemapsGet,
    submit: sitemapsSubmit,
    delete: sitemapsDelete,
  },
})

// ── Analytics commands ─────────────────────────────────────────────────────

const analyticsQuery = defineCommand({
  meta: { name: 'query', description: 'Query search analytics' },
  args: {
    ...globalArgs,
    start: {
      type: 'string' as const,
      description: 'Start date (YYYY-MM-DD). Required unless --days is set.',
    },
    end: {
      type: 'string' as const,
      description: 'End date (YYYY-MM-DD). Defaults to today.',
    },
    days: {
      type: 'string' as const,
      description: 'Number of days back from today. Alternative to --start/--end.',
    },
    dimension: {
      type: 'string' as const,
      description: 'Comma-separated dimensions: page,query,country,device,date,searchAppearance',
    },
    limit: {
      type: 'string' as const,
      description: 'Max rows to return (default 1000). Auto-paginates above 25000.',
    },
    type: {
      type: 'string' as const,
      description: 'Search type: web, image, video, news, discover, googleNews',
    },
    filter: {
      type: 'string' as const,
      description:
        'Filter as dim=value (e.g. country=USA, page~/blog/). Repeatable via comma. Operators: = != ~ !~ =~ !=~',
    },
  },
  async run({ args }) {
    const dims =
      typeof args.dimension === 'string' && args.dimension !== ''
        ? (args.dimension.split(',').filter(Boolean) as Dimension[])
        : undefined
    await runCommand({
      command: 'analytics query',
      format: await resolveFormat(args.format),
      execute: async () => {
        const client = await getClient()
        const siteUrl = await getSite(args.site)
        const opts: Parameters<typeof runAnalyticsQuery>[0] = { client, siteUrl }
        if (args.start !== undefined && args.start !== '') opts.start = args.start
        if (args.end !== undefined && args.end !== '') opts.end = args.end
        if (args.days !== undefined && args.days !== '') opts.days = Number(args.days)
        if (dims !== undefined) opts.dimensions = dims
        if (args.limit !== undefined && args.limit !== '') opts.limit = Number(args.limit)
        if (args.type !== undefined && args.type !== '') opts.type = args.type as SearchType
        if (args.filter !== undefined && args.filter !== '') {
          opts.filters = args.filter.split(',').map((f) => f.trim()).filter(Boolean)
        }
        return runAnalyticsQuery(opts)
      },
    })
  },
})

const analytics = defineCommand({
  meta: { name: 'analytics', description: 'Search analytics commands' },
  subCommands: { query: analyticsQuery },
})

// ── Inspect command ────────────────────────────────────────────────────────

const inspect = defineCommand({
  meta: { name: 'inspect', description: 'URL inspection' },
  args: {
    ...globalArgs,
    url: {
      type: 'positional' as const,
      required: false,
      description: "URL to inspect. Required unless --sitemap is set.",
    },
    sitemap: {
      type: 'boolean' as const,
      description: "Batch-inspect all URLs from the site's sitemap.",
    },
    concurrency: {
      type: 'string' as const,
      description: 'Parallel inspection requests (default 4). Respects rate limits.',
    },
    filter: {
      type: 'string' as const,
      description: 'Filter results: indexed, not-indexed, or errors',
    },
  },
  async run({ args }) {
    const format = await resolveFormat(args.format)
    if (args.sitemap === true) {
      await runCommand({
        command: 'inspect --sitemap',
        format,
        execute: async () => {
          const client = await getClient()
          const siteUrl = await getSite(args.site)
          const opts: Parameters<typeof runInspectSitemap>[0] = { client, siteUrl }
          if (args.url !== undefined && args.url !== '') opts.sitemapUrl = args.url
          if (args.concurrency !== undefined && args.concurrency !== '') opts.concurrency = Number(args.concurrency)
          if (args.filter !== undefined && args.filter !== '') {
            const valid = ['indexed', 'not-indexed', 'errors'] as const
            if (!valid.includes(args.filter as typeof valid[number])) {
              throw Object.assign(new Error(`invalid filter: ${args.filter}`), {
                code: 'BAD_ARGS',
                hint: 'Valid filters: indexed, not-indexed, errors',
              })
            }
            opts.filter = args.filter as 'indexed' | 'not-indexed' | 'errors'
          }
          return runInspectSitemap(opts)
        },
      })
      return
    }
    if (args.url === undefined || args.url === '') {
      throw Object.assign(new Error('url required'), {
        code: 'BAD_ARGS',
        hint: 'Provide a URL to inspect, or use --sitemap to batch-inspect from your sitemap',
      })
    }
    await runCommand({
      command: 'inspect',
      format,
      execute: async () =>
        runInspectUrl({
          client: await getClient(),
          siteUrl: await getSite(args.site),
          url: args.url!,
        }),
    })
  },
})

// ── Config commands ────────────────────────────────────────────────────────

const configSet = defineCommand({
  meta: { name: 'set', description: 'Set a config value' },
  args: {
    key: { type: 'positional' as const, required: true },
    value: { type: 'positional' as const, required: true },
  },
  async run({ args }) {
    await runCommand({
      command: 'config set',
      format: await resolveFormat(),
      execute: () => runConfigSet({ key: args.key, value: args.value }),
    })
  },
})

const configGet = defineCommand({
  meta: { name: 'get', description: 'Get a config value' },
  args: { key: { type: 'positional' as const, required: false } },
  async run({ args }) {
    await runCommand({
      command: 'config get',
      format: await resolveFormat(),
      execute: () => {
        const opts: Parameters<typeof runConfigGet>[0] = {}
        if (args.key !== undefined && args.key !== '') opts.key = args.key
        return runConfigGet(opts)
      },
    })
  },
})

const configPathCmd = defineCommand({
  meta: { name: 'path', description: 'Print the config file path' },
  async run() {
    await runCommand({
      command: 'config path',
      format: await resolveFormat(),
      execute: () => runConfigPath({ path: DEFAULT_CONFIG_PATH }),
    })
  },
})

const configCmd = defineCommand({
  meta: { name: 'config', description: 'Manage CLI config' },
  subCommands: { set: configSet, get: configGet, path: configPathCmd },
})

// ── Doctor command ─────────────────────────────────────────────────────────

const doctor = defineCommand({
  meta: { name: 'doctor', description: 'Run diagnostic checks' },
  async run() {
    await runCommand({
      command: 'doctor',
      format: await resolveFormat(),
      execute: async () =>
        runDoctor({
          config: await loadConfig(),
          probe: async () => {
            try {
              const res = await fetch('https://searchconsole.googleapis.com/', { method: 'HEAD' })
              return res.ok || res.status === 404
            } catch {
              return false
            }
          },
        }),
    })
  },
})

// ── Main ───────────────────────────────────────────────────────────────────

declare const __PACKAGE_VERSION__: string;

const main = defineCommand({
  meta: {
    name: 'gsc',
    version: __PACKAGE_VERSION__,
    description: 'LLM-friendly CLI for Google Search Console',
  },
  subCommands: {
    auth,
    sites,
    sitemaps,
    analytics,
    inspect,
    config: configCmd,
    doctor,
  },
})

runMain(main)
