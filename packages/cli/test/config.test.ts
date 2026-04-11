import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { loadConfig, saveConfig, defaultConfig, type CliConfig } from '../src/config.js'

describe('cli config', () => {
  let dir: string
  let path: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'gsc-cfg-'))
    path = join(dir, 'config.json')
  })
  afterEach(() => rmSync(dir, { recursive: true, force: true }))

  it('returns defaults when file missing', async () => {
    expect(await loadConfig(path)).toEqual(defaultConfig())
  })

  it('round-trips a config', async () => {
    const cfg: CliConfig = {
      defaultSite: 'https://a/',
      defaultFormat: 'text',
      cache: { enabled: true, ttlSeconds: 60 },
    }
    await saveConfig(path, cfg)
    expect(await loadConfig(path)).toEqual(cfg)
  })

  it('falls back to defaults for missing fields', async () => {
    writeFileSync(path, JSON.stringify({ defaultSite: 'https://x/' }))
    const cfg = await loadConfig(path)
    expect(cfg.defaultSite).toBe('https://x/')
    expect(cfg.defaultFormat).toBe('json')
    expect(cfg.cache.enabled).toBe(false)
  })

  it('defaultConfig has correct shape', () => {
    const def = defaultConfig()
    expect(def.defaultFormat).toBe('json')
    expect(def.cache.enabled).toBe(false)
    expect(def.cache.ttlSeconds).toBe(900)
    expect(def.defaultSite).toBeUndefined()
  })

  it('partial config merges with defaults', async () => {
    writeFileSync(path, JSON.stringify({ defaultFormat: 'table', cache: { enabled: true } }))
    const cfg = await loadConfig(path)
    expect(cfg.defaultFormat).toBe('table')
    expect(cfg.cache.enabled).toBe(true)
    expect(cfg.cache.ttlSeconds).toBe(900)
  })
})
