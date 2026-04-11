import { describe, it, expect, vi, beforeEach } from 'vitest'
import { runDoctor } from '../../src/commands/doctor.js'

const doctorMocks = vi.hoisted(() => {
  const mockGetAccessToken = vi.fn().mockResolvedValue({ token: 'mock-token' })
  const mockAuthClient = {
    getAccessToken: mockGetAccessToken,
    credentials: { client_email: 'user@example.com' },
  }
  const mockGetClient = vi.fn().mockResolvedValue(mockAuthClient)
  const MockGoogleAuth = vi.fn().mockImplementation(() => ({ getClient: mockGetClient }))
  return { mockGetAccessToken, mockAuthClient, mockGetClient, MockGoogleAuth }
})

vi.mock('google-auth-library', () => ({
  GoogleAuth: doctorMocks.MockGoogleAuth,
}))

describe('runDoctor', () => {
  beforeEach(() => {
    doctorMocks.mockGetAccessToken.mockResolvedValue({ token: 'mock-token' })
    doctorMocks.mockGetClient.mockResolvedValue(doctorMocks.mockAuthClient)
    doctorMocks.MockGoogleAuth.mockImplementation(() => ({ getClient: doctorMocks.mockGetClient }))
  })

  it('reports ok when auth + default site + reachable', async () => {
    const { data } = await runDoctor({
      config: { defaultSite: 'https://a/', defaultFormat: 'json', cache: { enabled: false, ttlSeconds: 0 } },
      probe: vi.fn().mockResolvedValue(true),
    })
    expect(data.checks.auth.ok).toBe(true)
    expect(data.checks.defaultSite.ok).toBe(true)
    expect(data.checks.network.ok).toBe(true)
    expect(data.ok).toBe(true)
  })

  it('reports missing auth as fail', async () => {
    doctorMocks.mockGetClient.mockRejectedValueOnce(new Error('no credentials'))
    const { data } = await runDoctor({
      config: { defaultFormat: 'json', cache: { enabled: false, ttlSeconds: 0 } },
      probe: vi.fn().mockResolvedValue(true),
    })
    expect(data.checks.auth.ok).toBe(false)
    expect(data.ok).toBe(false)
  })

  it('reports missing defaultSite as fail', async () => {
    const { data } = await runDoctor({
      config: { defaultFormat: 'json', cache: { enabled: false, ttlSeconds: 0 } },
      probe: vi.fn().mockResolvedValue(true),
    })
    expect(data.checks.defaultSite.ok).toBe(false)
    expect(data.ok).toBe(false)
  })

  it('reports network failure when probe returns false', async () => {
    const { data } = await runDoctor({
      config: { defaultSite: 'https://a/', defaultFormat: 'json', cache: { enabled: false, ttlSeconds: 0 } },
      probe: vi.fn().mockResolvedValue(false),
    })
    expect(data.checks.network.ok).toBe(false)
    expect(data.ok).toBe(false)
  })

  it('handles probe throwing an error gracefully', async () => {
    const { data } = await runDoctor({
      config: { defaultSite: 'https://a/', defaultFormat: 'json', cache: { enabled: false, ttlSeconds: 0 } },
      probe: vi.fn().mockRejectedValue(new Error('connection refused')),
    })
    expect(data.checks.network.ok).toBe(false)
    expect(data.checks.network.message).toContain('connection refused')
  })

  it('includes auth info in passing check', async () => {
    const { data } = await runDoctor({
      config: { defaultSite: 'https://a/', defaultFormat: 'json', cache: { enabled: false, ttlSeconds: 0 } },
      probe: vi.fn().mockResolvedValue(true),
    })
    expect(data.checks.auth.message).toContain('user@example.com')
  })
})
