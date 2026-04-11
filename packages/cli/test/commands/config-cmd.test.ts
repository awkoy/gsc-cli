import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runConfigSet, runConfigGet, runConfigPath } from '../../src/commands/config-cmd.js'
import { loadConfig } from '../../src/config.js'

describe('config commands', () => {
  let dir: string
  let path: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'gsc-cfg-cmd-'))
    path = join(dir, 'config.json')
  })
  afterEach(() => rmSync(dir, { recursive: true, force: true }))

  it('set persists defaultSite value', async () => {
    await runConfigSet({ path, key: 'defaultSite', value: 'https://a/' })
    const cfg = await loadConfig(path)
    expect(cfg.defaultSite).toBe('https://a/')
  })

  it('set persists defaultFormat value', async () => {
    await runConfigSet({ path, key: 'defaultFormat', value: 'text' })
    const cfg = await loadConfig(path)
    expect(cfg.defaultFormat).toBe('text')
  })

  it('set persists cache.enabled', async () => {
    await runConfigSet({ path, key: 'cache.enabled', value: 'true' })
    const cfg = await loadConfig(path)
    expect(cfg.cache.enabled).toBe(true)
  })

  it('set persists cache.ttlSeconds', async () => {
    await runConfigSet({ path, key: 'cache.ttlSeconds', value: '120' })
    const cfg = await loadConfig(path)
    expect(cfg.cache.ttlSeconds).toBe(120)
  })

  it('get returns whole config when no key', async () => {
    await runConfigSet({ path, key: 'defaultSite', value: 'https://a/' })
    const { data } = await runConfigGet({ path })
    expect((data as { defaultSite?: string }).defaultSite).toBe('https://a/')
  })

  it('get with key returns { key, value } shape', async () => {
    await runConfigSet({ path, key: 'defaultFormat', value: 'text' })
    const { data } = await runConfigGet({ path, key: 'defaultFormat' })
    expect((data as { key: string; value: unknown }).key).toBe('defaultFormat')
    expect((data as { key: string; value: unknown }).value).toBe('text')
  })

  it('path returns the file path', async () => {
    const { data } = await runConfigPath({ path })
    expect(data).toBe(path)
  })

  it('rejects unknown key on set', async () => {
    await expect(runConfigSet({ path, key: 'bogus', value: 'x' })).rejects.toThrow(/unknown key/)
  })

  it('rejects unknown key on get', async () => {
    await expect(runConfigGet({ path, key: 'bogus' })).rejects.toThrow(/unknown key/)
  })

  it('set returns the key and value', async () => {
    const { data } = await runConfigSet({ path, key: 'defaultSite', value: 'https://b/' })
    expect(data.key).toBe('defaultSite')
    expect(data.value).toBe('https://b/')
  })
})
