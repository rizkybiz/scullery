import type { Unit } from '../lib/api/units.ts'
import { newIngredientRow, type IngredientRow } from '../forms/ingredientRow.ts'
import FormField from './FormField.tsx'

// The API's names for an ingredient's fields, as they appear in its error locations.
export type IngredientField =
  'quantity_min' | 'quantity_max' | 'unit_code' | 'name' | 'preparation' | 'note' | 'section'

type IngredientRowsProps = {
  rows: IngredientRow[]
  onChange: (rows: IngredientRow[]) => void
  units: Unit[]
  // The message for one field of one row, or undefined. `field` is the API's
  // name for it, e.g. errorFor(0, 'name') for 'body.ingredients[0].name'.
  errorFor: (index: number, field: IngredientField) => string | undefined
}

// IngredientRows is the "Ingredients" part of the recipe form: one row per ingredient line,
// added, edited and removed in the browser. The order of the rows is the order shown.
//
// The everyday fields are always visible. Note, section and "optional" sit under "More",
// which starts open when any of them has a value or an error, so a value filled in by an
// import (or an existing recipe, when editing) is never hidden.
export default function IngredientRows({ rows, onChange, units, errorFor }: IngredientRowsProps) {
  function update(index: number, patch: Partial<IngredientRow>) {
    onChange(rows.map((row, i) => (i === index ? { ...row, ...patch } : row)))
  }
  return (
    <>
      <h2>Ingredients</h2>
      <ul aria-label="Ingredients">
        {rows.map((row, index) => {
          const moreHasContent =
            row.note !== '' ||
            row.section !== '' ||
            row.optional ||
            errorFor(index, 'note') !== undefined ||
            errorFor(index, 'section') !== undefined
          return (
            <li key={row.key}>
              <FormField
                label="Quantity"
                type="number"
                value={row.quantity}
                error={errorFor(index, 'quantity_min')}
                onChange={(v) => update(index, { quantity: v })}
              />
              <FormField
                label="to (for a range)"
                type="number"
                value={row.quantityMax}
                error={errorFor(index, 'quantity_max')}
                onChange={(v) => update(index, { quantityMax: v })}
              />
              <label>
                Unit
                <select
                  value={row.unitCode}
                  onChange={(event) => update(index, { unitCode: event.target.value })}
                >
                  <option value="">No unit</option>
                  {units.map((unit) => (
                    <option value={unit.code} key={unit.code}>
                      {unit.name}
                    </option>
                  ))}
                </select>
              </label>
              <FormField
                label="Ingredient"
                value={row.name}
                error={errorFor(index, 'name')}
                onChange={(v) => update(index, { name: v })}
              />
              <FormField
                label="Preparation"
                value={row.preparation}
                error={errorFor(index, 'preparation')}
                onChange={(v) => update(index, { preparation: v })}
              />
              <details open={moreHasContent}>
                <summary>More</summary>
                <FormField
                  label="Note"
                  value={row.note}
                  error={errorFor(index, 'note')}
                  onChange={(v) => update(index, { note: v })}
                />
                <FormField
                  label="Section"
                  value={row.section}
                  error={errorFor(index, 'section')}
                  onChange={(v) => update(index, { section: v })}
                />
                <label>
                  <input
                    type="checkbox"
                    checked={row.optional}
                    onChange={(event) => update(index, { optional: event.target.checked })}
                  />
                  Optional
                </label>
              </details>
              <button type="button" onClick={() => onChange(rows.filter((_, i) => i !== index))}>
                Remove
              </button>
            </li>
          )
        })}
      </ul>
      <button type="button" onClick={() => onChange([...rows, newIngredientRow()])}>
        Add ingredient
      </button>
    </>
  )
}
