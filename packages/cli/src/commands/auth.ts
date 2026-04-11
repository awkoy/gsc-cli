import { execSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { homedir, platform } from 'node:os'
import { join } from 'node:path'
import { GoogleAuth, type AuthClient } from 'google-auth-library'
import { GSCAuthError } from '@gsc-cli/sdk'

// ─── Constants ──────────────────────────────────────────────────────────────

const SCOPES = {
  webmasters: 'https://www.googleapis.com/auth/webmasters',
  webmastersReadonly: 'https://www.googleapis.com/auth/webmasters.readonly',
  cloudPlatform: 'https://www.googleapis.com/auth/cloud-platform',
} as const

const ENDPOINTS = {
  crmProjects: 'https://cloudresourcemanager.googleapis.com/v1/projects?pageSize=200',
  webmastersSites: 'https://www.googleapis.com/webmasters/v3/sites',
  serviceUsageBase: 'https://serviceusage.googleapis.com/v1',
} as const

const GSC_SERVICE_NAME = 'searchconsole.googleapis.com'
const QUOTA_HEADER = 'x-goog-user-project'
const ADC_FILENAME = 'application_default_credentials.json'
const GCLOUD_CONFIG_DIRNAME = 'gcloud'
const MAX_PROJECT_PROBES = 20

function gscEnableUrl(projectId: string): string {
  return `${ENDPOINTS.serviceUsageBase}/projects/${projectId}/services/${GSC_SERVICE_NAME}:enable`
}

const GSC_API_LIBRARY_URL =
  'https://console.cloud.google.com/apis/library/searchconsole.googleapis.com'
const GCP_PROJECT_CREATE_URL = 'https://console.cloud.google.com/projectcreate'
const GCLOUD_INSTALL_DOCS = 'https://cloud.google.com/sdk/docs/install'

const SA_FALLBACK_HINT =
  'Or set GOOGLE_APPLICATION_CREDENTIALS to a service account JSON to skip OAuth entirely.'

// ─── Error factory ──────────────────────────────────────────────────────────

interface AuthErrorOptions {
  hint?: string
  cause?: unknown
}

function authFailed(message: string, opts: AuthErrorOptions = {}): Error {
  const err = new Error(message, opts.cause !== undefined ? { cause: opts.cause } : undefined)
  return Object.assign(err, { code: 'AUTH_FAILED' as const, hint: opts.hint })
}

// ─── gcloud subprocess ──────────────────────────────────────────────────────

function runGcloud(args: string, opts: { interactive?: boolean } = {}): void {
  execSync(`gcloud ${args}`, {
    stdio: opts.interactive === true ? 'inherit' : 'pipe',
    encoding: 'utf8',
  })
}

function gcloudInstallCommand(): string {
  switch (platform()) {
    case 'darwin':
      return '`brew install --cask google-cloud-cli`'
    case 'win32':
      return '`winget install Google.CloudSDK`'
    default:
      return `see ${GCLOUD_INSTALL_DOCS}`
  }
}

function ensureGcloud(): void {
  try {
    runGcloud('--version')
  } catch {
    throw authFailed('gcloud CLI not found', {
      hint: `Install gcloud (${gcloudInstallCommand()}). ${SA_FALLBACK_HINT}`,
    })
  }
}

function runOAuthFlow(primaryScope: string): void {
  try {
    runGcloud(
      `auth application-default login --scopes=${primaryScope},${SCOPES.cloudPlatform}`,
      { interactive: true },
    )
  } catch {
    throw authFailed('OAuth flow failed or was cancelled', {
      hint: 'Try again with `gsc auth login`',
    })
  }
}

function revokeAdcCredentials(): void {
  try {
    runGcloud('auth application-default revoke --quiet')
  } catch {
    // may fail if no credentials, that's ok
  }
}

// ─── ADC file management ────────────────────────────────────────────────────

function adcFilePath(): string {
  const cfgDir = process.env.CLOUDSDK_CONFIG ?? join(homedir(), '.config', GCLOUD_CONFIG_DIRNAME)
  return join(cfgDir, ADC_FILENAME)
}

function readAdcFile(): Record<string, unknown> {
  const path = adcFilePath()
  let raw: string
  try {
    raw = readFileSync(path, 'utf8')
  } catch (cause) {
    throw authFailed(`ADC file not found at ${path}`, {
      hint: 'OAuth flow did not complete. Run `gsc auth login` again.',
      cause,
    })
  }
  return JSON.parse(raw) as Record<string, unknown>
}

function writeAdcFile(adc: Record<string, unknown>): void {
  writeFileSync(adcFilePath(), `${JSON.stringify(adc, null, 2)}\n`)
}

function writeQuotaProjectToAdc(projectId: string): void {
  const adc = readAdcFile()
  adc.quota_project_id = projectId
  writeAdcFile(adc)
}

/**
 * gcloud's `application-default login` may carry over a stale quota_project_id
 * from a previous account that the freshly-authenticated user has no permission
 * on. Strip it so our discovery calls don't inherit a poisoned quota header.
 */
function clearStaleQuotaProjectInAdc(): void {
  const adc = readAdcFile()
  if ('quota_project_id' in adc) {
    delete adc.quota_project_id
    writeAdcFile(adc)
  }
}

// ─── Google API calls via ADC ───────────────────────────────────────────────

interface CrmProject {
  projectId: string
  name?: string
  lifecycleState?: string
}

async function newAdcClient(): Promise<AuthClient> {
  const auth = new GoogleAuth({ scopes: [SCOPES.cloudPlatform] })
  return auth.getClient()
}

async function listAccessibleProjects(client: AuthClient): Promise<CrmProject[]> {
  try {
    const res = await client.request<{ projects?: CrmProject[] }>({ url: ENDPOINTS.crmProjects })
    return (res.data.projects ?? []).filter((p) => p.lifecycleState !== 'DELETE_REQUESTED')
  } catch (cause) {
    throw authFailed('failed to list GCP projects', {
      hint: 'Ensure your account has the cloud-platform scope. Try `gsc auth logout && gsc auth login`.',
      cause,
    })
  }
}

async function searchConsoleReachable(client: AuthClient, projectId: string): Promise<boolean> {
  try {
    await client.request({
      url: ENDPOINTS.webmastersSites,
      headers: { [QUOTA_HEADER]: projectId },
    })
    return true
  } catch {
    return false
  }
}

async function tryEnableSearchConsole(client: AuthClient, projectId: string): Promise<boolean> {
  try {
    await client.request({
      url: gscEnableUrl(projectId),
      method: 'POST',
      headers: { [QUOTA_HEADER]: projectId },
      data: {},
    })
    return true
  } catch {
    return false
  }
}

// ─── Project selection ──────────────────────────────────────────────────────

interface ProjectSelection {
  projectId: string
  apiJustEnabled: boolean
}

async function selectProject(
  client: AuthClient,
  preferredProject: string | undefined,
  log: (msg: string) => void,
): Promise<ProjectSelection> {
  if (preferredProject !== undefined) {
    if (await searchConsoleReachable(client, preferredProject)) {
      return { projectId: preferredProject, apiJustEnabled: false }
    }
    log(`Search Console API not reachable on "${preferredProject}" — attempting to enable...`)
    if (await tryEnableSearchConsole(client, preferredProject)) {
      return { projectId: preferredProject, apiJustEnabled: true }
    }
    throw authFailed(`Search Console API not reachable on project "${preferredProject}"`, {
      hint: `Enable it at ${GSC_API_LIBRARY_URL}?project=${preferredProject}`,
    })
  }

  const projects = await listAccessibleProjects(client)
  if (projects.length === 0) {
    throw authFailed('no GCP projects found', {
      hint: `Create one at ${GCP_PROJECT_CREATE_URL}`,
    })
  }

  const candidates = projects.slice(0, MAX_PROJECT_PROBES)
  log(`Scanning ${candidates.length} project(s) for Search Console API...`)

  // Pass 1: prefer projects where the API is already reachable (no propagation delay).
  for (const project of candidates) {
    if (await searchConsoleReachable(client, project.projectId)) {
      return { projectId: project.projectId, apiJustEnabled: false }
    }
  }

  // Pass 2: try to enable the API on each candidate. Requires Service Usage to be
  // enabled on that project as the quota target — skipped for auto-created Google
  // service projects (Gemini AI Studio, etc.).
  log('No project has it enabled — attempting to enable via API...')
  for (const project of candidates) {
    if (await tryEnableSearchConsole(client, project.projectId)) {
      return { projectId: project.projectId, apiJustEnabled: true }
    }
  }

  throw authFailed('no project has Search Console API enabled and auto-enable failed', {
    hint: `Enable Search Console API at ${GSC_API_LIBRARY_URL}, then re-run \`gsc auth login\`. Or pass --project=<id>.`,
  })
}

// ─── Public commands ────────────────────────────────────────────────────────

export interface AuthLoginOptions {
  readonly?: boolean
  project?: string
  stderr?: (msg: string) => void
}

export interface AuthLoginResult {
  authenticated: true
  method: 'gcloud-adc'
  scope: string
  quotaProject: string
  apiEnabled: boolean
}

const defaultLog = (msg: string): void => {
  process.stderr.write(`${msg}\n`)
}

export async function runAuthLogin(
  options: AuthLoginOptions = {},
): Promise<{ data: AuthLoginResult }> {
  const log = options.stderr ?? defaultLog
  const scope = options.readonly === true ? SCOPES.webmastersReadonly : SCOPES.webmasters

  ensureGcloud()

  log('Opening browser for Google OAuth...')
  runOAuthFlow(scope)
  clearStaleQuotaProjectInAdc()

  const client = await newAdcClient()
  const { projectId, apiJustEnabled } = await selectProject(client, options.project, log)
  log(`Using project: ${projectId}`)
  if (apiJustEnabled) {
    log('Enabled Search Console API (may take a moment to propagate).')
  }

  log('Setting quota project...')
  writeQuotaProjectToAdc(projectId)

  log('Done! Try: gsc sites list')
  return {
    data: {
      authenticated: true,
      method: 'gcloud-adc',
      scope,
      quotaProject: projectId,
      apiEnabled: apiJustEnabled,
    },
  }
}

export interface AuthStatusResult {
  authenticated: true
  method: 'application-default-credentials'
  hasToken: boolean
  email?: string
}

export async function runAuthStatus(): Promise<{ data: AuthStatusResult }> {
  try {
    const auth = new GoogleAuth({ scopes: [SCOPES.webmasters] })
    const client = await auth.getClient()
    const token = await client.getAccessToken()
    const data: AuthStatusResult = {
      authenticated: true,
      method: 'application-default-credentials',
      hasToken: token.token !== null,
    }
    const creds = client.credentials as Record<string, unknown> | undefined
    if (creds && typeof creds.client_email === 'string') {
      data.email = creds.client_email
    }
    return { data }
  } catch {
    throw Object.assign(new GSCAuthError('no credentials found', { code: 'AUTH_MISSING' }), {
      hint: 'Run `gsc auth login` or set GOOGLE_APPLICATION_CREDENTIALS env var',
    })
  }
}

export async function runAuthLogout(): Promise<{ data: { loggedOut: true } }> {
  revokeAdcCredentials()
  return { data: { loggedOut: true } }
}
