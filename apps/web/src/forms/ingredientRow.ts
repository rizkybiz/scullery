// One ingredient line as the form holds it. Like the rest of the form state,
// every value is a string; the page converts when it builds the request.
// `key` is a client-side id so React can tell rows apart when one is removed.
export type IngredientRow = {
  key: string
  quantity: string
  unitCode: string // '' means no unit
  name: string
  preparation: string
}

export function newIngredientRow(): IngredientRow {
  return { key: crypto.randomUUID(), quantity: '', unitCode: '', name: '', preparation: '' }
}

export function isBlankRow(row: Omit<IngredientRow, 'key'>): boolean {
  return [row.name, row.quantity, row.preparation, row.unitCode].every(
    (value) => value.trim() === '',
  )
}
