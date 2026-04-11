import { describe, it, expect, vi, beforeEach } from 'vitest'
import { runAuthStatus, runAuthLogout, runAuthLogin } from '../../src/commands/auth.js'

const authMocks = vi.hoisted(() => {
  const mockGetAccessToken = vi.fn().mockResolvedValue({ token: 'mock-token' })
  const mockRequest = vi.fn()
  const mockAuthClient = {
    getAccessToken: mockGetAccessToken,
    credentials: { client_email: 'me@example.com' },
    request: mockRequest,
  }
  const mockGetClient = vi.fn().mockResolvedValue(mockAuthClient)
  const MockGoogleAuth = vi.fn().mockImplementation(() => ({ getClient: mockGetClient }))
  return { mockGetAccessToken, mockRequest, mockAuthClient, mockGetClient, MockGoogleAuth }
})

vi.mock('google-auth-library', () => ({
  GoogleAuth: authMocks.MockGoogleAuth,
}))

const execMocks = vi.hoisted(() => {
  const mockExecSync = vi.fn()
  return { mockExecSync }
})

vi.mock('node:child_process', () => ({
  execSync: execMocks.mockExecSync,
}))

const fsMocks = vi.hoisted(() => ({
  mockReadFileSync: vi.fn(),
  mockWriteFileSync: vi.fn(),
}))

vi.mock('node:fs', () => ({
  readFileSync: fsMocks.mockReadFileSync,
  writeFileSync: fsMocks.mockWriteFileSync,
}))

function setupLoginMocks() {
  execMocks.mockExecSync.mockImplementation((cmd: string) => {
    if (typeof cmd !== 'string') return ''
    if (cmd.includes('--version')) return 'Google Cloud SDK 400.0.0'
    return ''
  })
  authMocks.mockRequest.mockImplementation((opts: { url: string; method?: string }) => {
    if (opts.url.includes('cloudresourcemanager.googleapis.com')) {
      return Promise.resolve({
        data: { projects: [{ projectId: 'test-project-123', name: 'Test' }] },
      })
    }
    if (opts.url.includes('webmasters/v3/sites')) {
      return Promise.resolve({ data: { siteEntry: [] } })
    }
    return Promise.resolve({ data: {} })
  })
}

describe('runAuthStatus', () => {
  beforeEach(() => {
    authMocks.mockGetAccessToken.mockResolvedValue({ token: 'mock-token' })
    authMocks.mockGetClient.mockResolvedValue(authMocks.mockAuthClient)
    authMocks.MockGoogleAuth.mockImplementation(() => ({ getClient: authMocks.mockGetClient }))
  })

  it('returns authenticated data when ADC credentials are available', async () => {
    const { data } = await runAuthStatus()
    expect(data).toMatchObject({
      authenticated: true,
      method: 'application-default-credentials',
      hasToken: true,
    })
  })

  it('includes email from service account credentials when available', async () => {
    const { data } = await runAuthStatus()
    expect(data.email).toBe('me@example.com')
  })

  it('throws AUTH_MISSING when google-auth-library fails', async () => {
    authMocks.mockGetClient.mockRejectedValueOnce(new Error('no credentials found'))
    await expect(runAuthStatus()).rejects.toMatchObject({ code: 'AUTH_MISSING' })
  })
})

describe('runAuthLogout', () => {
  beforeEach(() => {
    execMocks.mockExecSync.mockReset()
  })

  it('calls gcloud revoke and returns success', async () => {
    const { data } = await runAuthLogout()
    expect(data.loggedOut).toBe(true)
    expect(execMocks.mockExecSync).toHaveBeenCalledWith(
      'gcloud auth application-default revoke --quiet',
      expect.objectContaining({ encoding: 'utf8' }),
    )
  })

  it('succeeds even when gcloud revoke fails', async () => {
    execMocks.mockExecSync.mockImplementationOnce(() => { throw new Error('not found') })
    const { data } = await runAuthLogout()
    expect(data.loggedOut).toBe(true)
  })
})

describe('runAuthLogin', () => {
  beforeEach(() => {
    execMocks.mockExecSync.mockReset()
    authMocks.mockRequest.mockReset()
    fsMocks.mockReadFileSync.mockReset()
    fsMocks.mockWriteFileSync.mockReset()
    fsMocks.mockReadFileSync.mockReturnValue('{"client_id":"x","refresh_token":"y","type":"authorized_user"}')
    authMocks.mockGetClient.mockResolvedValue(authMocks.mockAuthClient)
    authMocks.MockGoogleAuth.mockImplementation(() => ({ getClient: authMocks.mockGetClient }))
    setupLoginMocks()
  })

  it('runs full flow: OAuth via gcloud, picks project via Search Console probe, writes quota to ADC file', async () => {
    const { data } = await runAuthLogin({ stderr: () => {} })
    expect(data.authenticated).toBe(true)
    expect(data.method).toBe('gcloud-adc')
    expect(data.quotaProject).toBe('test-project-123')
    expect(data.apiEnabled).toBe(false)

    const cmds = execMocks.mockExecSync.mock.calls.map((c) => String(c[0]))
    // Only OAuth (and version check) should hit gcloud
    expect(cmds.some((c) => c.includes('application-default login'))).toBe(true)
    expect(cmds.some((c) => c.includes('set-quota-project'))).toBe(false)
    expect(cmds.some((c) => c.includes('projects list'))).toBe(false)
    expect(cmds.some((c) => c.includes('services'))).toBe(false)

    const urls = authMocks.mockRequest.mock.calls.map((c) => (c[0] as { url: string }).url)
    expect(urls.some((u) => u.includes('cloudresourcemanager.googleapis.com'))).toBe(true)
    expect(urls.some((u) => u.includes('webmasters/v3/sites'))).toBe(true)
    // First-pass probe succeeds, so no enable call is made
    expect(urls.some((u) => u.includes('serviceusage.googleapis.com'))).toBe(false)

    // Quota project persisted via direct ADC file write
    expect(fsMocks.mockWriteFileSync).toHaveBeenCalledTimes(1)
    const writtenJson = JSON.parse(String(fsMocks.mockWriteFileSync.mock.calls[0]![1]))
    expect(writtenJson.quota_project_id).toBe('test-project-123')
  })

  it('auto-enables Search Console API when no project has it reachable', async () => {
    const enableCalls: string[] = []
    authMocks.mockRequest.mockImplementation((opts: { url: string; method?: string; headers?: Record<string, string> }) => {
      if (opts.url.includes('cloudresourcemanager.googleapis.com')) {
        return Promise.resolve({
          data: { projects: [{ projectId: 'proj-a', name: 'A' }, { projectId: 'proj-b', name: 'B' }] },
        })
      }
      if (opts.url.includes('webmasters/v3/sites')) {
        return Promise.reject(new Error('403 API not enabled'))
      }
      if (opts.url.includes('serviceusage.googleapis.com') && opts.url.endsWith(':enable')) {
        enableCalls.push(opts.headers?.['x-goog-user-project'] ?? '')
        // First project enable fails (no Service Usage bootstrap), second succeeds
        if (opts.headers?.['x-goog-user-project'] === 'proj-a') {
          return Promise.reject(new Error('403 Service Usage not enabled'))
        }
        return Promise.resolve({ data: { name: 'operations/x' } })
      }
      return Promise.resolve({ data: {} })
    })
    const { data } = await runAuthLogin({ stderr: () => {} })
    expect(data.quotaProject).toBe('proj-b')
    expect(data.apiEnabled).toBe(true)
    expect(enableCalls).toEqual(['proj-a', 'proj-b'])
  })

  it('auto-enables Search Console API for --project when probe fails but enable succeeds', async () => {
    authMocks.mockRequest.mockImplementation((opts: { url: string; method?: string }) => {
      if (opts.url.includes('webmasters/v3/sites')) {
        return Promise.reject(new Error('403 API not enabled'))
      }
      if (opts.url.includes('serviceusage.googleapis.com') && opts.url.endsWith(':enable')) {
        return Promise.resolve({ data: { name: 'operations/x' } })
      }
      return Promise.resolve({ data: {} })
    })
    const { data } = await runAuthLogin({ project: 'custom-proj', stderr: () => {} })
    expect(data.quotaProject).toBe('custom-proj')
    expect(data.apiEnabled).toBe(true)
  })

  it('clears stale quota_project_id from ADC immediately after OAuth', async () => {
    fsMocks.mockReadFileSync.mockReturnValue(
      '{"client_id":"x","refresh_token":"y","type":"authorized_user","quota_project_id":"stale-project"}',
    )
    await runAuthLogin({ stderr: () => {} })
    // Two writes: one to clear stale quota, one to set the chosen quota
    expect(fsMocks.mockWriteFileSync).toHaveBeenCalledTimes(2)
    const firstWrite = JSON.parse(String(fsMocks.mockWriteFileSync.mock.calls[0]![1]))
    expect(firstWrite.quota_project_id).toBeUndefined()
    const lastWrite = JSON.parse(String(fsMocks.mockWriteFileSync.mock.calls[1]![1]))
    expect(lastWrite.quota_project_id).toBe('test-project-123')
  })

  it('skips the clear step when ADC has no stale quota_project_id', async () => {
    await runAuthLogin({ stderr: () => {} })
    // Only the final write to set the chosen quota
    expect(fsMocks.mockWriteFileSync).toHaveBeenCalledTimes(1)
  })

  it('passes x-goog-user-project header on Search Console probes', async () => {
    await runAuthLogin({ stderr: () => {} })
    const probeCall = authMocks.mockRequest.mock.calls.find(
      (c) => (c[0] as { url: string }).url.includes('webmasters/v3/sites'),
    )
    expect(probeCall).toBeDefined()
    const opts = probeCall![0] as { headers?: Record<string, string> }
    expect(opts.headers?.['x-goog-user-project']).toBe('test-project-123')
  })

  it('skips projects where Search Console probe fails and uses the next one', async () => {
    authMocks.mockRequest.mockImplementation((opts: { url: string; headers?: Record<string, string> }) => {
      if (opts.url.includes('cloudresourcemanager.googleapis.com')) {
        return Promise.resolve({
          data: { projects: [{ projectId: 'proj-broken', name: 'A' }, { projectId: 'proj-good', name: 'B' }] },
        })
      }
      if (opts.url.includes('webmasters/v3/sites')) {
        if (opts.headers?.['x-goog-user-project'] === 'proj-broken') {
          return Promise.reject(new Error('403 API not enabled'))
        }
        return Promise.resolve({ data: { siteEntry: [] } })
      }
      return Promise.resolve({ data: {} })
    })
    const { data } = await runAuthLogin({ stderr: () => {} })
    expect(data.quotaProject).toBe('proj-good')
  })

  it('throws AUTH_FAILED when no project has Search Console enabled and auto-enable fails', async () => {
    authMocks.mockRequest.mockImplementation((opts: { url: string }) => {
      if (opts.url.includes('cloudresourcemanager.googleapis.com')) {
        return Promise.resolve({ data: { projects: [{ projectId: 'broken', name: 'A' }] } })
      }
      // Both probe (sites) and enable POST reject — Service Usage not bootstrapped
      return Promise.reject(new Error('403'))
    })
    await expect(runAuthLogin({ stderr: () => {} })).rejects.toMatchObject({ code: 'AUTH_FAILED' })
  })

  it('uses --project flag when provided and skips listing projects', async () => {
    const { data } = await runAuthLogin({ project: 'custom-proj', stderr: () => {} })
    expect(data.quotaProject).toBe('custom-proj')
    const urls = authMocks.mockRequest.mock.calls.map((c) => (c[0] as { url: string }).url)
    expect(urls.some((u) => u.includes('cloudresourcemanager.googleapis.com'))).toBe(false)
    expect(urls.some((u) => u.includes('webmasters/v3/sites'))).toBe(true)
  })

  it('throws AUTH_FAILED when --project is unreachable', async () => {
    authMocks.mockRequest.mockImplementation(() => Promise.reject(new Error('403')))
    await expect(
      runAuthLogin({ project: 'nope', stderr: () => {} }),
    ).rejects.toMatchObject({ code: 'AUTH_FAILED' })
  })

  it('throws AUTH_FAILED when gcloud is not installed', async () => {
    execMocks.mockExecSync.mockImplementation(() => { throw new Error('not found') })
    await expect(runAuthLogin({ stderr: () => {} })).rejects.toMatchObject({ code: 'AUTH_FAILED' })
  })

  it('throws AUTH_FAILED when ADC project listing fails', async () => {
    authMocks.mockRequest.mockImplementation((opts: { url: string }) => {
      if (opts.url.includes('cloudresourcemanager.googleapis.com')) {
        return Promise.reject(new Error('403 Forbidden'))
      }
      return Promise.resolve({ data: {} })
    })
    await expect(runAuthLogin({ stderr: () => {} })).rejects.toMatchObject({ code: 'AUTH_FAILED' })
  })
})
