// The kill switch. With READ_ONLY set (to true, 1, yes, or anything but "off") every action that changes something (create, delete,
// and later the import agent) refuses, while browsing, signing in and signing out keep
// working. It exists so that if the demo is being abused, or spending money it should not,
// one environment variable stops all writes. Plain logic: takes the environment as an
// argument, so it can be tested.
type Env = Record<string, string | undefined>

// Only an unset or explicitly "off" value leaves writes enabled. Anything else, including
// "1", "yes" or a typo, turns the switch ON: someone in a hurry to stop a runaway demo
// must never type a value that quietly does nothing.
const OFF = new Set(['', 'false', '0', 'no', 'off'])

export function isReadOnly(env: Env = process.env): boolean {
  const value = env['READ_ONLY']
  return value !== undefined && !OFF.has(value.trim().toLowerCase())
}

export const READ_ONLY_MESSAGE = 'The demo is read-only right now. Nothing can be changed.'
