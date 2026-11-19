import { useId } from 'react'

type FormFieldProps = {
  label: string
  value: string
  onChange: (value: string) => void
  type?: 'text' | 'number'
  multiline?: boolean
  error?: string
}

export default function FormField({
  label,
  value,
  error,
  onChange,
  type = 'text',
  multiline = false,
}: FormFieldProps) {
  const errorId = useId()
  return (
    <>
      <label>
        {label}
        {multiline ? (
          <textarea
            value={value}
            aria-describedby={error ? errorId : undefined}
            aria-invalid={error ? true : undefined}
            onChange={(event) => onChange(event.target.value)}
          />
        ) : (
          <input
            value={value}
            aria-describedby={error ? errorId : undefined}
            aria-invalid={error ? true : undefined}
            onChange={(event) => onChange(event.target.value)}
            type={type}
          />
        )}
      </label>
      {error && (
        <span id={errorId} className="field-error">
          {error}
        </span>
      )}
    </>
  )
}
