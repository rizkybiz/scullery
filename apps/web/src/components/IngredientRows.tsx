import type { Unit } from '../lib/api/units.ts'
import { newIngredientRow, type IngredientRow } from '../forms/ingredientRow.ts'
import FormField from './FormField.tsx'

type IngredientRowsProps = {
  rows: IngredientRow[]
  onChange: (rows: IngredientRow[]) => void
  units: Unit[]
  // The message for one field of one row, or undefined. `field` is the API's
  // name for it, e.g. errorFor(0, 'name') for 'body.ingredients[0].name'.
  errorFor: (
    index: number,
    field: 'quantity_min' | 'unit_code' | 'name' | 'preparation',
  ) => string | undefined
}

// IngredientRows is the "Ingredients" part of the recipe form: one row per ingredient line,
// added, edited and removed in the browser. The order of the rows is the order shown.
export default function IngredientRows({ rows, onChange, units, errorFor }: IngredientRowsProps) {
  function update(index: number, patch: Partial<IngredientRow>) {
    onChange(rows.map((row, i) => (i === index ? { ...row, ...patch } : row)))
  }
  return (
    <>
      <h2>Ingredients</h2>
      <ul aria-label="Ingredients">
        {rows.map((row, index) => (
          <li key={row.key}>
            <FormField
              label="Quantity"
              type="number"
              value={row.quantity}
              error={errorFor(index, 'quantity_min')}
              onChange={(v) => update(index, { quantity: v })}
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
            <button type="button" onClick={() => onChange(rows.filter((_, i) => i !== index))}>
              Remove
            </button>
          </li>
        ))}
      </ul>
      <button type="button" onClick={() => onChange([...rows, newIngredientRow()])}>
        Add ingredient
      </button>
    </>
  )
}
