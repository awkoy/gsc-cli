import { loadConfig, saveConfig, DEFAULT_CONFIG_PATH, type CliConfig } from '../config.js'

const ALLOWED_KEYS = ['defaultSite', 'defaultFormat', 'quotaProjectId', 'cache.enabled', 'cache.ttlSeconds'] as const
type AllowedKey = (typeof ALLOWED_KEYS)[number]

function isAllowed(key: string): key is AllowedKey {
  return (ALLOWED_KEYS as readonly string[]).includes(key)
}

function applyKey(config: CliConfig, key: AllowedKey, raw: string): CliConfig {
  switch (key) {
    case 'defaultSite':
      return { ...config, defaultSite: raw }
    case 'defaultFormat':
      if (raw !== 'json' && raw !== 'text' && raw !== 'table') {
        throw Object.assign(new Error(`invalid format: ${raw}`), {
          code: 'BAD_ARGS',
          hint: 'Valid formats: json, text, table',
        })
      }
      return { ...config, defaultFormat: raw }
    case 'quotaProjectId':
      return { ...config, quotaProjectId: raw }
    case 'cache.enabled':
      return { ...config, cache: { ...config.cache, enabled: raw === 'true' } }
    case 'cache.ttlSeconds':
      return { ...config, cache: { ...config.cache, ttlSeconds: Number(raw) } }
  }
}

function readKey(config: CliConfig, key: AllowedKey): unknown {
  switch (key) {
    case 'defaultSite':
      return config.defaultSite
    case 'defaultFormat':
      return config.defaultFormat
    case 'quotaProjectId':
      return config.quotaProjectId
    case 'cache.enabled':
      return config.cache.enabled
    case 'cache.ttlSeconds':
      return config.cache.ttlSeconds
  }
}

export async function runConfigSet(input: { path?: string; key: string; value: string }) {
  if (!isAllowed(input.key))
    throw Object.assign(new Error(`unknown key: ${input.key}`), {
      code: 'BAD_ARGS',
      hint: 'Allowed keys: defaultSite, defaultFormat, quotaProjectId, cache.enabled, cache.ttlSeconds',
    })
  const path = input.path ?? DEFAULT_CONFIG_PATH
  const current = await loadConfig(path)
  const updated = applyKey(current, input.key, input.value)
  await saveConfig(path, updated)
  return { data: { key: input.key, value: input.value } }
}

export async function runConfigGet(input: { path?: string; key?: string }) {
  const path = input.path ?? DEFAULT_CONFIG_PATH
  const current = await loadConfig(path)
  if (input.key === undefined) return { data: current as unknown }
  if (!isAllowed(input.key))
    throw Object.assign(new Error(`unknown key: ${input.key}`), {
      code: 'BAD_ARGS',
      hint: 'Allowed keys: defaultSite, defaultFormat, quotaProjectId, cache.enabled, cache.ttlSeconds',
    })
  return { data: { key: input.key, value: readKey(current, input.key) } }
}

export async function runConfigPath(input: { path?: string } = {}) {
  return { data: input.path ?? DEFAULT_CONFIG_PATH }
}
