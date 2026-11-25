import { useId } from 'react'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import type { Unit } from '@/lib/api/units.ts'
import { newIngredientRow, type IngredientRow } from '@/lib/forms/ingredientRow.ts'
import FormField from './FormField.tsx'
import { AddButton, More, RemoveButton } from './RowParts.tsx'

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
    <section aria-labelledby="ingredients-heading" className="space-y-3">
      <h2 id="ingredients-heading">Ingredients</h2>
      <ul aria-label="Ingredients" className="space-y-3">
        {rows.map((row, index) => (
          <IngredientEditor
            key={row.key}
            row={row}
            position={index + 1}
            units={units}
            errorFor={(field) => errorFor(index, field)}
            update={(patch) => update(index, patch)}
            remove={() => onChange(rows.filter((_, i) => i !== index))}
          />
        ))}
      </ul>
      <AddButton onClick={() => onChange([...rows, newIngredientRow()])}>Add ingredient</AddButton>
    </section>
  )
}

// One ingredient line: amount and unit on one row, name and preparation on the next, the rest
// under "More". Its own component so it can have ids (useId) for its unit and optional fields.
function IngredientEditor({
  row,
  position,
  units,
  errorFor,
  update,
  remove,
}: {
  row: IngredientRow
  position: number
  units: Unit[]
  errorFor: (field: IngredientField) => string | undefined
  update: (patch: Partial<IngredientRow>) => void
  remove: () => void
}) {
  const id = useId()
  const moreHasContent =
    row.note !== '' ||
    row.section !== '' ||
    row.optional ||
    errorFor('note') !== undefined ||
    errorFor('section') !== undefined
  return (
    <li className="rounded-lg border bg-card p-3 sm:p-4">
      <div className="grid gap-3">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-[7rem_7rem_1fr]">
          <FormField
            label="Quantity"
            type="number"
            value={row.quantity}
            error={errorFor('quantity_min')}
            onChange={(v) => update({ quantity: v })}
          />
          <FormField
            label="to (for a range)"
            type="number"
            value={row.quantityMax}
            error={errorFor('quantity_max')}
            onChange={(v) => update({ quantityMax: v })}
          />
          <div className="col-span-2 grid gap-1.5 sm:col-span-1">
            <Label htmlFor={`${id}-unit`}>Unit</Label>
            <select
              id={`${id}-unit`}
              value={row.unitCode}
              onChange={(event) => update({ unitCode: event.target.value })}
              className="h-11 w-full rounded-md border border-input bg-transparent px-3 text-base shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30"
            >
              <option value="">No unit</option>
              {units.map((unit) => (
                <option value={unit.code} key={unit.code}>
                  {unit.name}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <FormField
            label="Ingredient"
            value={row.name}
            error={errorFor('name')}
            onChange={(v) => update({ name: v })}
          />
          <FormField
            label="Preparation"
            value={row.preparation}
            error={errorFor('preparation')}
            onChange={(v) => update({ preparation: v })}
          />
        </div>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <More open={moreHasContent}>
            <div className="grid gap-3 sm:grid-cols-2">
              <FormField
                label="Note"
                value={row.note}
                error={errorFor('note')}
                onChange={(v) => update({ note: v })}
              />
              <FormField
                label="Section"
                value={row.section}
                error={errorFor('section')}
                onChange={(v) => update({ section: v })}
              />
            </div>
            <Label htmlFor={`${id}-optional`} className="min-h-11 cursor-pointer font-normal">
              <Checkbox
                id={`${id}-optional`}
                checked={row.optional}
                onCheckedChange={(checked) => update({ optional: checked === true })}
              />
              Optional
            </Label>
          </More>
          <RemoveButton label={`Remove ingredient ${position}`} onClick={remove} />
        </div>
      </div>
    </li>
  )
}
