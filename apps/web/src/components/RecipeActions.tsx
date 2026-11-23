'use client'

import { MoreVertical, Pencil, Trash2 } from 'lucide-react'
import Link from 'next/link'
import { useActionState, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { deleteRecipeAction } from '../app/(app)/recipes/actions.ts'

// The recipe's actions: a ⋮ button opening a menu (Edit, Delete), and a confirm step for Delete.
//
// The menu is shadcn/ui's DropdownMenu, built on Radix: arrow keys move through the items,
// Escape or a click outside closes it, and focus goes back to the ⋮ button. Choosing Delete
// opens the confirm row instead, with focus on its Cancel button (the safe choice); Cancel or
// Escape closes it and returns focus to ⋮.
//
// It renders two siblings, the menu and (when confirming) the confirm row, so the row can take
// the header's full width (basis-full) below the title.
//
// A Client Component because the menu is interactive state that only exists in the browser.
// The delete itself runs on the server, in deleteRecipeAction.
export default function RecipeActions({ id }: { id: string }) {
  const [confirming, setConfirming] = useState(false)
  const trigger = useRef<HTMLButtonElement>(null)
  const cancelButton = useRef<HTMLButtonElement>(null)
  // Set when Delete is chosen. As the menu closes it would hand focus back to ⋮; instead focus
  // goes to the confirm row's Cancel (by then the row is on the page). autoFocus is not enough:
  // the menu's own focus handling runs after the row mounts.
  const toConfirm = useRef(false)

  // state: the action's last error, if any; formAction: the form's action; isPending: true
  // while it runs. bind(null, id) fixes the first argument, so the form only has to submit.
  const [state, formAction, isPending] = useActionState(deleteRecipeAction.bind(null, id), null)

  function cancel() {
    setConfirming(false)
    trigger.current?.focus()
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button ref={trigger} variant="ghost" size="icon" aria-label="Recipe actions">
            <MoreVertical aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          className="min-w-40"
          onCloseAutoFocus={(event) => {
            if (!toConfirm.current) return
            toConfirm.current = false
            event.preventDefault()
            cancelButton.current?.focus()
          }}
        >
          <DropdownMenuItem asChild>
            <Link href={`/recipes/${id}/edit`} className="text-foreground no-underline">
              <Pencil aria-hidden="true" />
              Edit
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem
            variant="destructive"
            onSelect={() => {
              toConfirm.current = true
              setConfirming(true)
            }}
          >
            <Trash2 aria-hidden="true" />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {confirming && (
        <form
          action={formAction}
          className="flex basis-full flex-wrap items-center gap-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3"
          onKeyDown={(event) => {
            if (event.key === 'Escape') cancel()
          }}
        >
          <span className="mr-auto font-medium">Delete this recipe?</span>
          <Button
            ref={cancelButton}
            type="button"
            variant="outline"
            disabled={isPending}
            onClick={cancel}
          >
            Cancel
          </Button>
          <Button type="submit" variant="destructive" disabled={isPending}>
            {isPending ? 'Deleting…' : 'Delete'}
          </Button>
          {state?.error && (
            <p role="alert" className="basis-full text-sm text-destructive">
              {state.error}
            </p>
          )}
        </form>
      )}
    </>
  )
}
