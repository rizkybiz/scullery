import { useId } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'

type FormFieldProps = {
  label: string
  value: string
  onChange: (value: string) => void
  type?: 'text' | 'number'
  multiline?: boolean
  error?: string
  className?: string
}

// One labelled field of the recipe form: a label above an input (or a textarea), and the
// field's error below it, linked by aria-describedby so a screen reader reads it with the field.
export default function FormField({
  label,
  value,
  error,
  onChange,
  type = 'text',
  multiline = false,
  className,
}: FormFieldProps) {
  const id = useId()
  const errorId = `${id}-error`
  const shared = {
    id,
    value,
    'aria-describedby': error ? errorId : undefined,
    'aria-invalid': error ? true : undefined,
  }
  return (
    <div className={cn('grid gap-1.5', className)}>
      <Label htmlFor={id}>{label}</Label>
      {multiline ? (
        <Textarea {...shared} onChange={(event) => onChange(event.target.value)} />
      ) : (
        <Input
          {...shared}
          type={type}
          inputMode={type === 'number' ? 'decimal' : undefined}
          onChange={(event) => onChange(event.target.value)}
        />
      )}
      {error && (
        <p id={errorId} className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  )
}
