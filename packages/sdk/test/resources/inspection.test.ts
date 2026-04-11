import { describe, it, expect, vi } from 'vitest'
import { InspectionResource } from '../../src/resources/inspection.js'
import type { HttpClient } from '../../src/transport/http-client.js'

function mockHttp() {
  return { request: vi.fn() } as unknown as HttpClient & { request: ReturnType<typeof vi.fn> }
}

describe('InspectionResource', () => {
  it('POSTs urlInspection/index:inspect with siteUrl and inspectionUrl', async () => {
    const http = mockHttp()
    http.request.mockResolvedValue({ inspectionResult: { indexStatusResult: { verdict: 'PASS' } } })
    const r = new InspectionResource(http)
    const out = await r.inspect({
      siteUrl: 'https://a/',
      inspectionUrl: 'https://a/blog/post',
    })
    expect(out.indexStatusResult?.verdict).toBe('PASS')
    expect(http.request).toHaveBeenCalledWith({
      method: 'POST',
      path: 'https://searchconsole.googleapis.com/v1/urlInspection/index:inspect',
      body: {
        siteUrl: 'https://a/',
        inspectionUrl: 'https://a/blog/post',
      },
    })
  })

  it('passes languageCode when provided', async () => {
    const http = mockHttp()
    http.request.mockResolvedValue({ inspectionResult: {} })
    const r = new InspectionResource(http)
    await r.inspect({
      siteUrl: 'https://a/',
      inspectionUrl: 'https://a/x',
      languageCode: 'en-US',
    })
    const call = http.request.mock.calls[0]![0] as { body: Record<string, unknown> }
    expect(call.body.languageCode).toBe('en-US')
  })

  it('returns empty object when inspectionResult is missing', async () => {
    const http = mockHttp()
    http.request.mockResolvedValue({})
    const r = new InspectionResource(http)
    const out = await r.inspect({ siteUrl: 'https://a/', inspectionUrl: 'https://a/x' })
    expect(out).toEqual({})
  })

  it('does not include languageCode when not provided', async () => {
    const http = mockHttp()
    http.request.mockResolvedValue({ inspectionResult: {} })
    const r = new InspectionResource(http)
    await r.inspect({ siteUrl: 'https://a/', inspectionUrl: 'https://a/x' })
    const call = http.request.mock.calls[0]![0] as { body: Record<string, unknown> }
    expect(call.body.languageCode).toBeUndefined()
  })
})
