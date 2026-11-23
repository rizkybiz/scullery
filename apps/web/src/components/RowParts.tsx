import { ChevronRight, Plus, Trash2 } from 'lucide-react'
import type { ReactNode } from 'react'
import { Button } from '@/components/ui/button'

// Pieces shared by the ingredient and step editors in the recipe form.

// "More": the less-used fields of a row, folded away. A native <details>, so it needs no state;
// `open` is where it starts (open when anything inside has a value or an error).
export function More({ open, children }: { open: boolean; children: ReactNode }) {
  return (
    <details open={open} className="group min-w-0 flex-1">
      <summary className="inline-flex min-h-11 cursor-pointer list-none items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground [&::-webkit-details-marker]:hidden">
        <ChevronRight
          aria-hidden="true"
          className="size-4 transition-transform group-open:rotate-90 motion-reduce:transition-none"
        />
        More
      </summary>
      <div className="grid gap-3 pt-1 pb-2">{children}</div>
    </details>
  )
}

// Removes one row. The visible word is "Remove"; the accessible name says which row.
export function RemoveButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      aria-label={label}
      onClick={onClick}
      className="text-muted-foreground hover:text-destructive"
    >
      <Trash2 aria-hidden="true" />
      Remove
    </Button>
  )
}

export function AddButton({ children, onClick }: { children: string; onClick: () => void }) {
  return (
    <Button type="button" variant="outline" onClick={onClick}>
      <Plus aria-hidden="true" />
      {children}
    </Button>
  )
}
