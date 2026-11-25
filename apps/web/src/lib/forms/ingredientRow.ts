// One ingredient line as the form holds it. Like the rest of the form state, every text
// value is a string; the server converts when it builds the request.
// `key` is a client-side id so React can tell rows apart when one is removed.
export type IngredientRow = {
  key: string
  quantity: string
  quantityMax: string // '' unless the amount is a range, such as 2-3
  unitCode: string // '' means no unit
  name: string
  preparation: string // how it is cut or prepared: "minced"
  note: string // anything else: "to taste", "or use shallots"
  section: string // the heading it is grouped under: "For the sauce"
  optional: boolean
}

export function newIngredientRow(): IngredientRow {
  return {
    key: crypto.randomUUID(),
    quantity: '',
    quantityMax: '',
    unitCode: '',
    name: '',
    preparation: '',
    note: '',
    section: '',
    optional: false,
  }
}

// A row nobody has typed in. Ticking "optional" alone does not count as typing: a row
// with nothing else in it is still blank and is dropped.
export function isBlankRow(row: Omit<IngredientRow, 'key'>): boolean {
  return [
    row.name,
    row.quantity,
    row.quantityMax,
    row.preparation,
    row.unitCode,
    row.note,
    row.section,
  ].every((value) => value.trim() === '')
}
