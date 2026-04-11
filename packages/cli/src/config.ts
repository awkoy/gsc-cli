import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { homedir } from 'node:os'

export interface CliConfig {
  defaultSite?: string
  defaultFormat: 'json' | 'text' | 'table'
  quotaProjectId?: string
  cache: { enabled: boolean; ttlSeconds: number }
}

export const DEFAULT_CONFIG_PATH = join(homedir(), '.config', 'gsc', 'config.json')

export function defaultConfig(): CliConfig {
  return {
    defaultFormat: 'json',
    cache: { enabled: false, ttlSeconds: 900 },
  }
}

export async function loadConfig(path = DEFAULT_CONFIG_PATH): Promise<CliConfig> {
  try {
    const raw = await readFile(path, 'utf8')
    const parsed = JSON.parse(raw) as Partial<CliConfig>
    const def = defaultConfig()
    const result: CliConfig = {
      defaultFormat: parsed.defaultFormat ?? def.defaultFormat,
      cache: {
        enabled: parsed.cache?.enabled ?? def.cache.enabled,
        ttlSeconds: parsed.cache?.ttlSeconds ?? def.cache.ttlSeconds,
      },
    }
    if (parsed.defaultSite !== undefined) result.defaultSite = parsed.defaultSite
    if (parsed.quotaProjectId !== undefined) result.quotaProjectId = parsed.quotaProjectId
    return result
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return defaultConfig()
    throw err
  }
}

export async function saveConfig(path = DEFAULT_CONFIG_PATH, config: CliConfig): Promise<void> {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 })
  await writeFile(path, JSON.stringify(config, null, 2), { mode: 0o600 })
}
