// Small display helpers for the recipe page. Plain logic, no framework imports.

// groupBySection splits a list into runs that share a section heading, keeping the order.
// [a(null), b("Sauce"), c("Sauce"), d(null)] becomes three groups: null, "Sauce", null.
// Only consecutive items are grouped: the recipe's order is the author's, never re-sorted.
export function groupBySection<T extends { section: string | null }>(
  items: readonly T[],
): { section: string | null; items: T[]; start: number }[] {
  const groups: { section: string | null; items: T[]; start: number }[] = []
  items.forEach((item, index) => {
    const last = groups[groups.length - 1]
    if (last && last.section === item.section) last.items.push(item)
    else groups.push({ section: item.section, items: [item], start: index + 1 })
  })
  return groups
}

// formatTimer turns seconds into "45 s", "5 min", "1 min 30 s", "2 h" or "1 h 15 min". From an
// hour up, seconds are dropped: nobody times a two-hour rise to the second.
export function formatTimer(seconds: number): string {
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const rest = seconds % 60
  if (hours > 0) return minutes === 0 ? `${hours} h` : `${hours} h ${minutes} min`
  if (minutes === 0) return `${rest} s`
  return rest === 0 ? `${minutes} min` : `${minutes} min ${rest} s`
}

// webAddress returns the URL only if it is http or https, so a stored javascript: or data:
// "URL" (the API accepts any text) can never become a link.
export function webAddress(text: string | null): string | null {
  if (text === null) return null
  try {
    const url = new URL(text)
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null
  } catch {
    return null
  }
}

// The parts of an ingredient that ingredientLine reads (the API's Ingredient has more).
type IngredientParts = {
  quantity_min: number | null
  quantity_max: number | null
  unit_code: string | null
  name: string
  preparation: string | null
  note: string | null
  optional: boolean
}

export type IngredientLine = {
  amount: string | null // "4–6 cloves", "½ tsp", "200 g"; null when there is none
  text: string // "garlic, thinly sliced"
  extras: string[] // "optional", then the note
}

const FRACTIONS: Record<string, string> = {
  '0.25': '¼',
  '0.5': '½',
  '0.75': '¾',
  '0.33': '⅓',
  '0.67': '⅔',
  '0.125': '⅛',
}

// formatQuantity writes 0.5 as ½ and 1.5 as 1½, the common kitchen fractions; anything else as a
// decimal of at most two places (0.3 stays 0.3, 1.2345 becomes 1.23).
export function formatQuantity(value: number): string {
  const whole = Math.floor(value)
  const rest = value - whole
  // Three places first (0.125 is ⅛), then two (0.333 and 0.33 are both ⅓).
  const fraction =
    FRACTIONS[String(Math.round(rest * 1000) / 1000)] ??
    FRACTIONS[String(Math.round(rest * 100) / 100)]
  if (rest > 0 && fraction) return whole === 0 ? fraction : `${whole}${fraction}`
  return String(Math.round(value * 100) / 100)
}

// Units written as abbreviations never take a plural; "each" is a count with no word at all.
const ABBREVIATIONS: Record<string, string> = {
  g: 'g',
  kg: 'kg',
  oz: 'oz',
  lb: 'lb',
  ml: 'ml',
  l: 'l',
  tsp: 'tsp',
  tbsp: 'tbsp',
  fl_oz: 'fl oz',
}

function unitWord(code: string, plural: boolean): string {
  if (code in ABBREVIATIONS) return ABBREVIATIONS[code]!
  if (!plural) return code
  return /(ch|sh|s|x)$/.test(code) ? `${code}es` : `${code}s` // pinches, dashes, cloves, cups
}

// ingredientLine is how the recipe page writes an ingredient. The API's raw_text puts a range as
// "4-6 clove garlic" and "(optional)" inside the text, and the page then added the note in
// brackets of its own ("parsley (optional) (a small handful)"). Built from the parts instead:
// an en dash for a range, a plural unit when there is more than one, and the optional flag and
// the note as one quiet aside.
export function ingredientLine(ingredient: IngredientParts): IngredientLine {
  const { quantity_min: min, quantity_max: max, unit_code: unit } = ingredient
  let amount: string | null = null
  if (min !== null) {
    const number =
      max !== null ? `${formatQuantity(min)}–${formatQuantity(max)}` : formatQuantity(min)
    const word = unit && unit !== 'each' ? unitWord(unit, (max ?? min) > 1) : null
    amount = word ? `${number} ${word}` : number
  } else if (unit && unit !== 'each') {
    amount = unit in ABBREVIATIONS ? ABBREVIATIONS[unit]! : unit
  }
  const text = ingredient.preparation
    ? `${ingredient.name}, ${ingredient.preparation}`
    : ingredient.name
  const extras = [ingredient.optional ? 'optional' : null, ingredient.note].filter(
    (extra): extra is string => extra !== null && extra !== '',
  )
  return { amount, text, extras }
}
