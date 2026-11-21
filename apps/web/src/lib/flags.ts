// The kill switches. Plain logic: they take the environment as an argument, so they can be tested.
//
// READ_ONLY (set to true, 1, yes, or anything but "off"): every action that changes something or
// spends something refuses (create, delete, and the recipe import), while browsing, signing in
// and signing out keep working. It exists so that if the demo is being abused, or spending money
// it should not, one environment variable stops it.
//
// IMPORT_DISABLED (same values): only the recipe import refuses; recipes can still be created by
// hand. For turning off the AI part alone, for example if a model misbehaves or the AI Gateway
// free tier runs out.
type Env = Record<string, string | undefined>

// Only an unset or explicitly "off" value leaves a switch off. Anything else, including "1",
// "yes" or a typo, turns it ON: someone in a hurry to stop a runaway demo must never type a value
// that quietly does nothing.
const OFF = new Set(['', 'false', '0', 'no', 'off'])

function isOn(value: string | undefined): boolean {
  return value !== undefined && !OFF.has(value.trim().toLowerCase())
}

export function isReadOnly(env: Env = process.env): boolean {
  return isOn(env['READ_ONLY'])
}

export const READ_ONLY_MESSAGE = 'The demo is read-only right now. Nothing can be changed.'

// The import is off when either switch is on: READ_ONLY stops all spending, not only writes.
export function isImportDisabled(env: Env = process.env): boolean {
  return isReadOnly(env) || isOn(env['IMPORT_DISABLED'])
}

export const IMPORT_DISABLED_MESSAGE =
  'Importing is turned off right now. You can still type a recipe in below.'
