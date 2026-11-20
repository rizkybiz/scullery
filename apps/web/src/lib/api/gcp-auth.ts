import 'server-only'
import { getVercelOidcToken } from '@vercel/oidc'
import { IdentityPoolClient, Impersonated } from 'google-auth-library'

// How this app proves to Google Cloud that a request comes from our Vercel project,
// without storing any secret:
//
//   1. Vercel mints a short-lived OIDC token for this deployment (getVercelOidcToken).
//   2. Google's Security Token Service checks it against the workload identity pool in
//      infra/terraform (right issuer, audience, team, project) and returns a federated
//      credential.
//   3. That credential acts as a service account, which asks Google for an ID token whose
//      audience is the Cloud Run URL.
//   4. The ID token goes in the Authorization header; Cloud Run checks it and the
//      service account's run.invoker permission.
//
// Configuration comes from four environment variables (outputs of the Terraform). When
// none are set, nothing is added and the API is called as-is, which is how local
// development against the Go API on this machine works.

const CONFIG_NAMES = [
  'GCP_PROJECT_NUMBER',
  'GCP_WORKLOAD_IDENTITY_POOL_ID',
  'GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID',
  'GCP_SERVICE_ACCOUNT_EMAIL',
] as const

type Config = {
  projectNumber: string
  poolId: string
  providerId: string
  serviceAccountEmail: string
}

// null means "not configured": use no Google sign-in at all. Partly configured is a
// mistake, and fails loudly rather than quietly calling the API without credentials.
function readConfig(): Config | null {
  const values = CONFIG_NAMES.map((name) => process.env[name])
  if (values.every((value) => !value)) return null

  const missing = CONFIG_NAMES.filter((name) => !process.env[name])
  if (missing.length > 0) {
    throw new Error(`Google Cloud sign-in is partly configured. Missing: ${missing.join(', ')}.`)
  }
  return {
    projectNumber: process.env.GCP_PROJECT_NUMBER!,
    poolId: process.env.GCP_WORKLOAD_IDENTITY_POOL_ID!,
    providerId: process.env.GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID!,
    serviceAccountEmail: process.env.GCP_SERVICE_ACCOUNT_EMAIL!,
  }
}

const CLOUD_PLATFORM = 'https://www.googleapis.com/auth/cloud-platform'

// Builds the chain in steps 1-3 above. Nothing is fetched until an ID token is asked for.
function buildIdTokenSource(config: Config): Impersonated {
  const federated = new IdentityPoolClient({
    type: 'external_account',
    audience: `//iam.googleapis.com/projects/${config.projectNumber}/locations/global/workloadIdentityPools/${config.poolId}/providers/${config.providerId}`,
    subject_token_type: 'urn:ietf:params:oauth:token-type:jwt',
    token_url: 'https://sts.googleapis.com/v1/token',
    scopes: [CLOUD_PLATFORM],
    // Vercel's token only exists while a request is being handled, so it is fetched
    // when Google asks for it, never at module load.
    subject_token_supplier: { getSubjectToken: () => getVercelOidcToken() },
  })
  return new Impersonated({
    sourceClient: federated,
    targetPrincipal: config.serviceAccountEmail,
    targetScopes: [CLOUD_PLATFORM],
    lifetime: 3600,
  })
}

// An ID token is valid for about an hour, and getting one costs two network calls, so
// keep them. Refresh a little early so a token never expires mid-request.
const REFRESH_BEFORE_EXPIRY_MS = 5 * 60 * 1000
const cache = new Map<string, { token: string; expiresAtMs: number }>()
// One exchange at a time per audience: a burst of requests shares a single one.
const inFlight = new Map<string, Promise<string>>()
let source: Impersonated | undefined

function expiryOf(jwt: string): number {
  const payload = JSON.parse(Buffer.from(jwt.split('.')[1] ?? '', 'base64url').toString()) as {
    exp: number
  }
  return payload.exp * 1000
}

async function mint(config: Config, audience: string): Promise<string> {
  source ??= buildIdTokenSource(config)
  const token = await source.fetchIdToken(audience, { includeEmail: true })
  cache.set(audience, { token, expiresAtMs: expiryOf(token) })
  return token
}

// getIdToken returns an ID token for calling the service at `url`, or null when Google
// sign-in is not configured. The audience is the service's origin: Cloud Run rejects a
// token whose audience does not match the URL it is served from.
export async function getIdToken(url: string): Promise<string | null> {
  const config = readConfig()
  if (!config) return null

  const audience = new URL(url).origin
  const cached = cache.get(audience)
  if (cached && cached.expiresAtMs - Date.now() > REFRESH_BEFORE_EXPIRY_MS) {
    return cached.token
  }

  let pending = inFlight.get(audience)
  if (!pending) {
    pending = mint(config, audience).finally(() => inFlight.delete(audience))
    inFlight.set(audience, pending)
  }
  return pending
}
