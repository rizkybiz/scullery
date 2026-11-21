// SPIKE (temporary): one button per candidate model. Signed-in only (proxy + requireSession
// in the action). Not linked from anywhere.
import { SpikeForm } from './SpikeForm.tsx'

export default function SpikePage() {
  return (
    <>
      <h1>Workflow + AI Gateway spike</h1>
      <p>Runs one workflow with one AI step on a fixed sample recipe.</p>
      <SpikeForm />
    </>
  )
}
