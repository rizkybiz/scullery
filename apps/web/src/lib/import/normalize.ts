// From the model's answer to a draft the form can show. The answer is treated as untrusted input:
// it passed the schema, but values can still be out of range, too long or inconsistent. Every rule
// here is the API's own (services/api), applied so the draft the person sees is one the API would
// accept, plus a few tidy-ups the spike showed models need. Plain logic, no framework imports.
import type { NewRecipe } from '../api/recipes.ts'
import type { Draft } from './schema.ts'
import { parseIsoDuration, type ImportSource } from './source.ts'

export type Normalized =
  { isRecipe: true; recipe: NewRecipe; warnings: string[] } | { isRecipe: false; title: string }

const MAX_ROWS = 200
const MAX_AMOUNT = 999_999
const MAX_MINUTES = 525_600
const MAX_TIMER_SECONDS = 86_400

// How each unit can be written. A unit is kept only if the source mentions it one of these ways:
// the eval runs showed models replacing a unit the API lacks with a near one ("3 sprigs" became
// a bunch, "2 handfuls" a cup, "3 eggs" 3 each), and a prompt rule alone did not stop it. Short
// codes (g, l, ml...) only count right after a number (digits or ½ ¼ ¾ ⅓ ⅔ ⅛), so the "g" in
// "garlic" is not a gram.
const UNIT_WRITTEN: Record<string, RegExp> = {
  tsp: /\b(tsps?|teaspoons?)\b|[\d½¼¾⅓⅔⅛]\s*t\b/i,
  tbsp: /\b(tbsps?|tbs|tablespoons?)\b|[\d½¼¾⅓⅔⅛]\s*T\b/i,
  fl_oz: /\b(fl\.?\s*oz|fluid\s+ounces?)\b/i,
  cup: /\bcups?\b/i,
  pint: /\bpints?\b/i,
  quart: /\bquarts?\b/i,
  gallon: /\bgallons?\b/i,
  ml: /[\d½¼¾⅓⅔⅛]\s*ml\b|\b(millilit(re|er)s?)\b/i,
  l: /[\d½¼¾⅓⅔⅛]\s*l\b|\b(lit(re|er)s?)\b/i,
  g: /[\d½¼¾⅓⅔⅛]\s*g\b|\bgrams?\b|\bgr\b/i,
  kg: /[\d½¼¾⅓⅔⅛]\s*kg\b|\bkilo(gram)?s?\b/i,
  oz: /\b(oz|ounces?)\b/i,
  lb: /\b(lbs?|pounds?)\b/i,
  each: /\beach\b/i,
  clove: /\bcloves?\b/i,
  slice: /\bslices?\b/i,
  stick: /\bsticks?\b/i,
  bunch: /\bbunch(es)?\b/i,
  can: /\b(cans?|tins?)\b/i,
  package: /\b(packages?|packets?|pkgs?|packs?)\b/i,
  pinch: /\bpinch(es)?\b/i,
  dash: /\bdash(es)?\b/i,
}

UNIT_WRITTEN['cup'] = /\bcups?\b|[\d½¼¾⅓⅔⅛]\s*c\.?(\s|$)/i // "½ c. milk"

// A unit with no spelling listed (one added to the API later) is trusted, not dropped.
export function unitMentioned(code: string, sourceText: string): boolean {
  const written = UNIT_WRITTEN[code]
  return written ? written.test(sourceText) : true
}

// The source's ingredient lines: JSON-LD gives one string per line, text one line per row.
function sourceLines(source: ImportSource): string[] {
  if (source.kind === 'jsonld') {
    const list = source.recipe['recipeIngredient']
    return Array.isArray(list)
      ? list.filter((item): item is string => typeof item === 'string')
      : []
  }
  return source.text.split('\n')
}

const stem = (word: string) => word.toLowerCase().replace(/(es|s)$/, '')

// The unit must be written on the source line for this ingredient. The line is found by the
// longest word of the ingredient's name; when no line has it (the model reworded the name), the
// whole source is searched instead, which is looser but never drops a unit that is there.
function unitWritten(code: string, name: string, source: ImportSource, lines: string[]): boolean {
  const words = name.match(/[a-z]{3,}/gi) ?? []
  const key = words.sort((a, b) => b.length - a.length)[0]
  const own = key ? lines.filter((line) => line.toLowerCase().includes(stem(key))) : []
  if (own.length > 0) return own.some((line) => unitMentioned(code, line))
  const all = source.kind === 'jsonld' ? JSON.stringify(source.recipe) : source.text
  return unitMentioned(code, all)
}

function text(value: string | null | undefined, max: number): string | null {
  const trimmed = (value ?? '').trim()
  return trimmed === '' ? null : trimmed.slice(0, max)
}

function inRange(value: number | null | undefined, min: number, max: number): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max
    ? value
    : null
}

export function normalizeDraft(
  draft: Draft,
  source: ImportSource,
  unitCodes: ReadonlySet<string>,
): Normalized {
  const title = text(draft.title, 200)
  if (!draft.is_recipe) return { isRecipe: false, title: title ?? 'Not a recipe' }

  const warnings: string[] = []
  const lines = sourceLines(source)

  const ingredients = draft.ingredients.slice(0, MAX_ROWS).flatMap((line) => {
    const name = text(line.name, 200)
    if (name === null) return []
    let min = inRange(line.quantity_min, 0, MAX_AMOUNT)
    let max = inRange(line.quantity_max, 0, MAX_AMOUNT)
    if (min === null && max !== null) [min, max] = [max, null] // "up to 3": keep the amount
    if (max !== null && min !== null && max <= min) max = null // "200 to 200" is just 200
    const unit =
      line.unit_code !== null &&
      unitCodes.has(line.unit_code) &&
      unitWritten(line.unit_code, name, source, lines)
        ? line.unit_code
        : null
    return [
      {
        name,
        quantity_min: min,
        quantity_max: max,
        unit_code: unit,
        preparation: text(line.preparation, 200),
        note: text(line.note, 500),
        section: text(line.section, 200),
        optional: line.optional === true,
      },
    ]
  })

  const steps = draft.steps.slice(0, MAX_ROWS).flatMap((step) => {
    const instruction = text(step.instruction, 5000)
    if (instruction === null) return []
    const timer = inRange(step.timer_seconds, 1, MAX_TIMER_SECONDS)
    return [
      {
        instruction,
        timer_seconds: timer === null ? null : Math.round(timer),
        section: text(step.section, 200),
      },
    ]
  })

  if (draft.ingredients.length > MAX_ROWS || draft.steps.length > MAX_ROWS) {
    warnings.push(`Only the first ${MAX_ROWS} ingredients and steps were kept.`)
  }
  if (ingredients.length === 0) warnings.push('No ingredients were found. Check the source.')
  if (steps.length === 0) warnings.push('No steps were found. Check the source.')

  // JSON-LD states times exactly ("PT1H30M"); parse them instead of trusting the model's arithmetic.
  let prep = inRange(draft.prep_minutes, 0, MAX_MINUTES)
  let cook = inRange(draft.cook_minutes, 0, MAX_MINUTES)
  if (source.kind === 'jsonld') {
    prep = parseIsoDuration(source.recipe['prepTime']) ?? prep
    cook = parseIsoDuration(source.recipe['cookTime']) ?? cook
  }

  const servings = inRange(draft.servings, 0, MAX_AMOUNT)
  return {
    isRecipe: true,
    warnings,
    recipe: {
      title: title ?? 'Untitled recipe',
      description: text(draft.description, 5000) ?? '',
      servings: servings === 0 ? null : servings,
      yield_text: text(draft.yield_text, 200),
      prep_minutes: prep === null ? null : Math.round(prep),
      cook_minutes: cook === null ? null : Math.round(cook),
      source_url: source.url,
      ingredients,
      steps,
    },
  }
}
