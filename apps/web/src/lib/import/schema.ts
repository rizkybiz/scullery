// The shape the model must answer in (structured output). It mirrors the API's NewRecipe, minus
// what the model should not decide (favorite, source URL: the app knows the URL). Every field
// says what it means in `.describe()`, which the model sees: the conventions live next to the
// fields they govern. normalize.ts then checks and tidies the answer; nothing here is trusted.
import { z } from 'zod'

export function draftSchema(unitCodes: readonly string[]) {
  // The unit must be one of the API's codes, so the model cannot invent "cloves" or "Tbsp".
  // With no units known (the API was unreachable), every unit is null.
  const unit =
    unitCodes.length > 0 ? z.enum(unitCodes as [string, ...string[]]).nullable() : z.null()

  const ingredient = z.object({
    name: z
      .string()
      .describe(
        'The ingredient itself, as written but without amount or unit: "garlic", "all-purpose flour".',
      ),
    quantity_min: z
      .number()
      .nullable()
      .describe(
        'The amount as a decimal (1 1/2 is 1.5, ¾ is 0.75). For a range like 2-3, the low end. Null when no amount is given.',
      ),
    quantity_max: z
      .number()
      .nullable()
      .describe('Only for a range: the high end (3 for "2-3"). Null for a single amount.'),
    unit_code: unit.describe(
      'One of the allowed unit codes, or null when there is no unit or none of the codes fits (then keep the word in the name, e.g. "rosemary sprig").',
    ),
    preparation: z
      .string()
      .nullable()
      .describe('How it is prepared: "minced", "diced", "softened". Null if not stated.'),
    note: z
      .string()
      .nullable()
      .describe(
        'Anything else about the line: "to taste", "for garnish", "or use shallots". Null if nothing.',
      ),
    section: z
      .string()
      .nullable()
      .describe(
        'The heading this line is listed under, such as "For the sauce", exactly as written. Null if the list has no headings.',
      ),
    optional: z.boolean().describe('True only when the recipe says the ingredient is optional.'),
  })

  const step = z.object({
    instruction: z.string().describe("One step, in the author's words."),
    timer_seconds: z
      .number()
      .int()
      .nullable()
      .describe(
        'Only when the step states one duration to wait or cook ("bake 25 minutes" is 1500). Null otherwise; never guess.',
      ),
    section: z
      .string()
      .nullable()
      .describe('The heading this step is listed under, exactly as written. Null if none.'),
  })

  return z.object({
    is_recipe: z
      .boolean()
      .describe(
        'False if the text is not a recipe (an article, a menu, a product page). Then leave the lists empty.',
      ),
    title: z.string().describe('The recipe name.'),
    description: z
      .string()
      .describe('A sentence or two about the dish if the source has one, otherwise empty.'),
    servings: z
      .number()
      .nullable()
      .describe('How many people it serves, as a number. Null if not stated.'),
    yield_text: z
      .string()
      .nullable()
      .describe(
        'What it makes when that is not a number of servings: "24 cookies", "1 loaf". Null otherwise.',
      ),
    prep_minutes: z.number().int().nullable().describe('Preparation time in minutes, if stated.'),
    cook_minutes: z.number().int().nullable().describe('Cooking time in minutes, if stated.'),
    ingredients: z.array(ingredient).describe('Every ingredient line, in the order given.'),
    steps: z.array(step).describe('The method, in order.'),
  })
}

export type Draft = z.infer<ReturnType<typeof draftSchema>>
