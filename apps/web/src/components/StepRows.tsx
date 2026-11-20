import { newStepRow, type StepRow } from '../forms/stepRow.ts'
import FormField from './FormField.tsx'

type StepRowsProps = {
  rows: StepRow[]
  onChange: (rows: StepRow[]) => void
  // The message for one step, or undefined.
  errorFor: (index: number) => string | undefined
}

// StepRows is the "Steps" part of the new recipe form: a list of instructions that can
// be added to and removed from. The order of the rows is the order of the steps.
export default function StepRows({ rows, onChange, errorFor }: StepRowsProps) {
  return (
    <>
      <h2>Steps</h2>
      <ol aria-label="Steps">
        {rows.map((row, index) => (
          <li key={row.key}>
            <FormField
              label={`Step ${index + 1}`}
              multiline={true}
              value={row.instruction}
              error={errorFor(index)}
              onChange={(value) =>
                onChange(rows.map((r, i) => (i === index ? { ...r, instruction: value } : r)))
              }
            />
            <button type="button" onClick={() => onChange(rows.filter((_, i) => i !== index))}>
              Remove
            </button>
          </li>
        ))}
      </ol>
      <button type="button" onClick={() => onChange([...rows, newStepRow()])}>
        Add step
      </button>
    </>
  )
}
