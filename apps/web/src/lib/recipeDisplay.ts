// Small display helpers for the recipe page. Plain logic, no framework imports.

// groupBySection splits a list into runs that share a section heading, keeping the order.
// [a(null), b("Sauce"), c("Sauce"), d(null)] becomes three groups: null, "Sauce", null.
// Only consecutive items are grouped: the recipe's order is the author's, never re-sorted.
export function groupBySection<T extends { section: string | null }>(
  items: readonly T[],
): { section: string | null; items: T[]; start: number }[] {
  const groups: { section: string | null; items: T[]; start: number }[] = []
  items.forEach((item, index) => {
    const last = groups[groups.length - 1]
    if (last && last.section === item.section) last.items.push(item)
    else groups.push({ section: item.section, items: [item], start: index + 1 })
  })
  return groups
}

// formatTimer turns seconds into "45 s", "5 min" or "1 min 30 s".
export function formatTimer(seconds: number): string {
  const minutes = Math.floor(seconds / 60)
  const rest = seconds % 60
  if (minutes === 0) return `${rest} s`
  return rest === 0 ? `${minutes} min` : `${minutes} min ${rest} s`
}

// webAddress returns the URL only if it is http or https, so a stored javascript: or data:
// "URL" (the API accepts any text) can never become a link.
export function webAddress(text: string | null): string | null {
  if (text === null) return null
  try {
    const url = new URL(text)
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null
  } catch {
    return null
  }
}
