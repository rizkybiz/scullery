import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

// cn joins class names, dropping falsy ones, and lets a later Tailwind class override an earlier
// one ("px-2" then "px-4" leaves "px-4"). The shadcn/ui components use it for their className prop.
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
