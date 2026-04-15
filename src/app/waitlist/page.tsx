import { redirect } from 'next/navigation'

// Canonical waitlist / marketing page lives at /join.
// This redirect exists so external links pointing at /waitlist still work
// (no more 404-inside-sidebar bug).
export default function WaitlistPage() {
  redirect('/join')
}
