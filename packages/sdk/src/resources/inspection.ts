import type { InspectionInput, InspectionResult } from '../types.js'
import type { HttpClient } from '../transport/http-client.js'

interface RawInspectionResponse {
  inspectionResult?: InspectionResult
}

export class InspectionResource {
  constructor(readonly httpClient: HttpClient) {}

  async inspect(input: InspectionInput): Promise<InspectionResult> {
    const body: Record<string, unknown> = {
      siteUrl: input.siteUrl,
      inspectionUrl: input.inspectionUrl,
    }
    if (input.languageCode !== undefined) body.languageCode = input.languageCode

    const res = await this.httpClient.request<RawInspectionResponse>({
      method: 'POST',
      path: 'https://searchconsole.googleapis.com/v1/urlInspection/index:inspect',
      body,
    })
    return res.inspectionResult ?? {}
  }
}
