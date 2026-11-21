import { newStepRow, type StepRow } from '../forms/stepRow.ts'
import FormField from './FormField.tsx'

// The API's names for a step's fields, as they appear in its error locations.
export type StepField = 'instruction' | 'timer_seconds' | 'section'

type StepRowsProps = {
  rows: StepRow[]
  onChange: (rows: StepRow[]) => void
  // The message for one field of one step, or undefined.
  errorFor: (index: number, field: StepField) => string | undefined
}

// StepRows is the "Steps" part of the recipe form: a list of instructions that can be
// added to and removed from. The order of the rows is the order of the steps. Each step can
// have a timer (in minutes) and a section heading, under "More", which starts open when
// either has a value or an error.
export default function StepRows({ rows, onChange, errorFor }: StepRowsProps) {
  function update(index: number, patch: Partial<StepRow>) {
    onChange(rows.map((row, i) => (i === index ? { ...row, ...patch } : row)))
  }
  return (
    <>
      <h2>Steps</h2>
      <ol aria-label="Steps">
        {rows.map((row, index) => {
          const moreHasContent =
            row.timerMinutes !== '' ||
            row.section !== '' ||
            errorFor(index, 'timer_seconds') !== undefined ||
            errorFor(index, 'section') !== undefined
          return (
            <li key={row.key}>
              <FormField
                label={`Step ${index + 1}`}
                multiline={true}
                value={row.instruction}
                error={errorFor(index, 'instruction')}
                onChange={(value) => update(index, { instruction: value })}
              />
              <details open={moreHasContent}>
                <summary>More</summary>
                <FormField
                  label="Timer (minutes)"
                  type="number"
                  value={row.timerMinutes}
                  error={errorFor(index, 'timer_seconds')}
                  onChange={(value) => update(index, { timerMinutes: value })}
                />
                <FormField
                  label="Section"
                  value={row.section}
                  error={errorFor(index, 'section')}
                  onChange={(value) => update(index, { section: value })}
                />
              </details>
              <button type="button" onClick={() => onChange(rows.filter((_, i) => i !== index))}>
                Remove
              </button>
            </li>
          )
        })}
      </ol>
      <button type="button" onClick={() => onChange([...rows, newStepRow()])}>
        Add step
      </button>
    </>
  )
}
