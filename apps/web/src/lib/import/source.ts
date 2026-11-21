// Turning what the person gave us (a fetched page or pasted text) into the smallest useful input
// for the model. Plain logic, no network and no framework: the fetch happens elsewhere.
//
// Most recipe sites embed a schema.org Recipe as JSON-LD for search engines. When a page has one,
// the model gets only that object, trimmed to the recipe's own fields: far fewer tokens than the
// page, less room to go wrong, and less of the page's other text (ads, comments, anything planted)
// in front of the model. Otherwise it gets the page's visible text.

export type ImportSource =
  | { kind: 'jsonld'; recipe: Record<string, unknown>; url: string | null }
  | { kind: 'text'; text: string; url: string | null }

// Caps on what reaches the model. A real recipe is far smaller; anything bigger is not worth the
// tokens, and the cap bounds the cost of a hostile input.
export const MAX_SOURCE_CHARS = 20_000

// The JSON-LD fields worth sending. Everything else (ratings, author pages, video, nutrition)
// costs tokens and adds nothing to the draft.
const RECIPE_FIELDS = [
  'name',
  'description',
  'recipeYield',
  'prepTime',
  'cookTime',
  'totalTime',
  'recipeIngredient',
  'recipeInstructions',
] as const

const LD_JSON =
  /<script\b[^>]*type\s*=\s*["']?application\/ld\+json["']?[^>]*>([\s\S]*?)<\/script>/gi

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isRecipe(value: Record<string, unknown>): boolean {
  const type = value['@type']
  return type === 'Recipe' || (Array.isArray(type) && type.includes('Recipe'))
}

// findRecipe walks one parsed JSON-LD block: a Recipe, an array of things, or a @graph (the
// common Yoast shape, where the Recipe sits among WebPage, Person and Organization).
function findRecipe(value: unknown, depth = 0): Record<string, unknown> | null {
  if (depth > 5) return null
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findRecipe(item, depth + 1)
      if (found) return found
    }
    return null
  }
  if (!isRecord(value)) return null
  if (isRecipe(value)) return value
  return findRecipe(value['@graph'], depth + 1)
}

// recipeFromJsonLd returns the first schema.org Recipe in the page, trimmed to RECIPE_FIELDS, or
// null. A block that is not valid JSON is skipped, not fatal: pages ship broken ones.
export function recipeFromJsonLd(html: string): Record<string, unknown> | null {
  for (const match of html.matchAll(LD_JSON)) {
    let parsed: unknown
    try {
      parsed = JSON.parse(match[1]!.trim())
    } catch {
      continue
    }
    const recipe = findRecipe(parsed)
    if (!recipe) continue
    const trimmed: Record<string, unknown> = {}
    for (const field of RECIPE_FIELDS) {
      if (recipe[field] !== undefined) trimmed[field] = recipe[field]
    }
    if (trimmed['recipeIngredient'] || trimmed['recipeInstructions']) return trimmed
  }
  return null
}

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  frac12: '½',
  frac14: '¼',
  frac34: '¾',
  deg: '°',
  ndash: '–',
  mdash: '—',
}

function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+\d*);/gi, (whole, name: string) => {
    if (name[0] === '#') {
      const code =
        name[1] === 'x' || name[1] === 'X' ? parseInt(name.slice(2), 16) : Number(name.slice(1))
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : ''
    }
    return ENTITIES[name.toLowerCase()] ?? whole
  })
}

// visibleText turns HTML into the text a reader would see, one block per line. It is for
// feeding the model only: never for rendering. It drops script, style and similar blocks, but it
// does NOT drop text hidden with CSS; that is why the prompt treats all page text as data.
export function visibleText(html: string): string {
  const text = html
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style|noscript|svg|template|head|iframe)\b[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(
      /<\/(p|div|li|h[1-6]|tr|section|article|header|footer|nav|aside|main|ul|ol|table)>/gi,
      '\n',
    )
    .replace(/<li\b[^>]*>/gi, '\n- ')
    .replace(/<[^>]+>/g, ' ')
  return decodeEntities(text)
    .split('\n')
    .map((line) => line.replace(/[ \t\f\v ]+/g, ' ').trim())
    .filter((line) => line !== '')
    .join('\n')
}

// sourceFromHtml prefers the page's JSON-LD Recipe and falls back to its visible text.
export function sourceFromHtml(html: string, url: string | null): ImportSource {
  const recipe = recipeFromJsonLd(html)
  if (recipe) return { kind: 'jsonld', recipe, url }
  return { kind: 'text', text: visibleText(html).slice(0, MAX_SOURCE_CHARS), url }
}

export function sourceFromText(text: string): ImportSource {
  return { kind: 'text', text: text.trim().slice(0, MAX_SOURCE_CHARS), url: null }
}

// What the model reads. JSON-LD goes as compact JSON, capped like text.
export function renderSource(source: ImportSource): string {
  const body = source.kind === 'jsonld' ? JSON.stringify(source.recipe) : source.text
  return body.slice(0, MAX_SOURCE_CHARS)
}

// parseIsoDuration reads schema.org durations: "PT15M" is 15, "PT1H30M" is 90, "P0DT45M" is 45.
// Returns whole minutes, or null for anything else. Used to fill prep and cook times exactly
// instead of trusting the model with arithmetic.
export function parseIsoDuration(value: unknown): number | null {
  if (typeof value !== 'string') return null
  const match =
    /^P(?:(\d+(?:\.\d+)?)D)?(?:T(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)S)?)?$/i.exec(
      value.trim(),
    )
  if (!match || value.trim().toUpperCase() === 'P' || value.trim().toUpperCase() === 'PT')
    return null
  const [, d, h, m, s] = match
  const minutes = Number(d ?? 0) * 1440 + Number(h ?? 0) * 60 + Number(m ?? 0) + Number(s ?? 0) / 60
  return Number.isFinite(minutes) ? Math.round(minutes) : null
}
