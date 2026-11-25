// One instruction as the form holds it. `key` is a client-side id so React can tell
// rows apart when one is removed (never use the array index for that).
export type StepRow = {
  key: string
  instruction: string
  timerMinutes: string // '' for no timer; minutes, as people think of them (the API wants seconds)
  section: string // the heading it is grouped under: "For the sauce"
}

export function newStepRow(): StepRow {
  return { key: crypto.randomUUID(), instruction: '', timerMinutes: '', section: '' }
}
