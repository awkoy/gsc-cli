import { GoogleAuth } from 'google-auth-library'
import type { CliConfig } from '../config.js'

export interface DoctorOptions {
  config: CliConfig
  probe?: () => Promise<boolean>
}

export async function runDoctor(options: DoctorOptions) {
  // Check ADC credentials
  let authCheck: { ok: boolean; message: string; hint?: string }
  try {
    const auth = new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/webmasters'] })
    const client = await auth.getClient()
    await client.getAccessToken()
    const creds = client.credentials as Record<string, unknown>
    const email = typeof creds.client_email === 'string' ? creds.client_email : undefined
    authCheck = {
      ok: true,
      message: `authenticated${email !== undefined ? ` as ${email}` : ' via application-default-credentials'}`,
    }
  } catch {
    authCheck = {
      ok: false,
      message: 'not authenticated',
      hint: 'run `gsc auth login`',
    }
  }

  const siteCheck = options.config.defaultSite !== undefined
    ? { ok: true as const, message: `default site: ${options.config.defaultSite}` }
    : { ok: false as const, message: 'no default site set', hint: 'run `gsc config set defaultSite <url>`' }

  let networkOk = false
  let networkMessage = 'not probed'
  if (options.probe !== undefined) {
    try {
      networkOk = await options.probe()
      networkMessage = networkOk ? 'reachable' : 'unreachable'
    } catch (err) {
      networkMessage = err instanceof Error ? err.message : String(err)
    }
  }
  const networkCheck = { ok: networkOk, message: networkMessage }

  return {
    data: {
      ok: authCheck.ok && siteCheck.ok && networkCheck.ok,
      checks: {
        auth: authCheck,
        defaultSite: siteCheck,
        network: networkCheck,
      },
    },
  }
}
