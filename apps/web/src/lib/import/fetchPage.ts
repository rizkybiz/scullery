// Fetching the page a person pasted a link to. Server-side fetching of a user-chosen URL is a
// server-side request forgery (SSRF) risk: a link to http://169.254.169.254/ or http://10.0.0.5/
// would make this server ask its own network for something. This app's functions run on Vercel,
// not inside the Google Cloud network (the API is reached by a signed request, not by network
// position), so the exposure is small, but the guard is cheap and belongs with the fetch:
//
// - only http and https, on their default ports;
// - every address the host name resolves to must be public (no loopback, private, link-local,
//   cloud metadata, carrier-grade NAT, multicast or reserved ranges, IPv4 or IPv6);
// - redirects are followed by hand, at most 3, and each new URL is checked the same way;
// - 10 seconds, 2 MB, and only HTML or plain text.
//
// A remaining gap, documented in the README: the address is checked, then fetch resolves the
// name again (DNS rebinding could change the answer in between). Closing it needs a fetch that
// connects to the checked address; acceptable here given where these functions run.
import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'

export class PageFetchError extends Error {
  // The message is shown to the person, so it says what went wrong in their terms. `retryable`
  // is true for what may pass on its own (a timeout, a 503), false for what will not (a 404).
  readonly retryable: boolean
  constructor(message: string, retryable = false) {
    super(message)
    this.name = 'PageFetchError'
    this.retryable = retryable
  }
}

const MAX_BYTES = 2 * 1024 * 1024
const TIMEOUT_MS = 10_000
const MAX_REDIRECTS = 3

function ipv4Blocked(address: string): boolean {
  const [a, b] = address.split('.').map(Number) as [number, number, number, number]
  return (
    a === 0 || // "this" network
    a === 10 || // private
    a === 127 || // loopback
    (a === 100 && b >= 64 && b <= 127) || // carrier-grade NAT
    (a === 169 && b === 254) || // link-local, including cloud metadata 169.254.169.254
    (a === 172 && b >= 16 && b <= 31) || // private
    (a === 192 && b === 168) || // private
    (a === 192 && b === 0) || // IETF protocol assignments, 192.0.0.0/24 and 192.0.2.0/24 docs
    (a === 198 && (b === 18 || b === 19)) || // benchmarking
    a >= 224 // multicast, reserved, broadcast
  )
}

function ipv6Blocked(address: string): boolean {
  const lower = address.toLowerCase()
  if (lower === '::' || lower === '::1') return true // unspecified, loopback
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(lower) // IPv4-mapped
  if (mapped) return ipv4Blocked(mapped[1]!)
  return (
    lower.startsWith('fc') || // unique local fc00::/7
    lower.startsWith('fd') ||
    /^fe[89ab]/.test(lower) || // link-local fe80::/10
    lower.startsWith('ff') || // multicast
    lower.startsWith('2001:db8') || // documentation
    lower.startsWith('64:ff9b') // NAT64, which can reach IPv4 private space
  )
}

export function addressBlocked(address: string): boolean {
  const family = isIP(address)
  if (family === 4) return ipv4Blocked(address)
  if (family === 6) return ipv6Blocked(address)
  return true
}

// checkUrl returns the URL if it may be fetched, or throws a PageFetchError saying why not.
export async function checkUrl(text: string): Promise<URL> {
  let url: URL
  try {
    url = new URL(text)
  } catch {
    throw new PageFetchError('That is not a web address.')
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new PageFetchError('Only http and https links can be imported.')
  }
  if (url.port !== '' || url.username !== '' || url.password !== '') {
    throw new PageFetchError('Links with a port or a user name cannot be imported.')
  }
  const host = url.hostname.replace(/^\[|\]$/g, '')
  let addresses: string[]
  if (isIP(host)) {
    addresses = [host]
  } else {
    try {
      addresses = (await lookup(host, { all: true, verbatim: true })).map((entry) => entry.address)
    } catch {
      throw new PageFetchError(`Could not find the site ${url.hostname}.`)
    }
  }
  if (addresses.length === 0 || addresses.some(addressBlocked)) {
    throw new PageFetchError('That address is not a public web site.')
  }
  return url
}

async function readCapped(response: Response): Promise<string> {
  const reader = response.body?.getReader()
  if (!reader) return ''
  const chunks: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > MAX_BYTES) {
      await reader.cancel()
      throw new PageFetchError('The page is too large to import (over 2 MB).')
    }
    chunks.push(value)
  }
  return new TextDecoder().decode(Buffer.concat(chunks))
}

// fetchPage returns the page's HTML (or text) and the URL it finally came from.
export async function fetchPage(text: string): Promise<{ html: string; url: string }> {
  let url = await checkUrl(text)
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    let response: Response
    try {
      response = await fetch(url, {
        redirect: 'manual',
        signal: AbortSignal.timeout(TIMEOUT_MS),
        headers: { accept: 'text/html,text/plain;q=0.9', 'user-agent': 'SculleryRecipeImport/1.0' },
      })
    } catch (error) {
      const timedOut = error instanceof Error && error.name === 'TimeoutError'
      throw new PageFetchError(
        timedOut ? 'The site took too long to answer.' : 'Could not reach the site.',
        true,
      )
    }
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location')
      await response.body?.cancel()
      if (!location) throw new PageFetchError('The site redirected without saying where to.')
      url = await checkUrl(new URL(location, url).href)
      continue
    }
    if (!response.ok) {
      await response.body?.cancel()
      throw new PageFetchError(
        `The site answered ${response.status}. It may need a sign-in, or block automatic visits.`,
        response.status >= 500 || response.status === 429,
      )
    }
    const type = response.headers.get('content-type') ?? ''
    if (!/^(text\/html|application\/xhtml\+xml|text\/plain)\b/i.test(type)) {
      await response.body?.cancel()
      throw new PageFetchError('That link is not a web page (it may be a PDF or an image).')
    }
    return { html: await readCapped(response), url: url.href }
  }
  throw new PageFetchError('The site redirected too many times.')
}
