'use client'

/**
 * useGatedSend — the ONLY approved way to POST to outbound endpoints from the
 * frontend.
 *
 * All `/api/*\/send`, `/publish`, `/chase`, `/blast`, `/post` calls must flow
 * through this helper. Enforced by scripts/check-outbound-gated.sh which fails
 * the build if anything else hits those endpoints.
 *
 * Flow:
 *   1. POST `endpoint` with `previewBody` (no `confirmed` flag) — backend
 *      returns a preview payload.
 *   2. `buildConfig(preview)` maps that into a GateConfig; the approval modal
 *      renders and waits for user confirm.
 *   3. On confirm, POST `endpoint` again with `{ ...previewBody, confirmed: true }`
 *      and return the response.
 *
 * The backend side of the contract lives in `@/lib/require-confirmed` — every
 * outbound route uses it to gate the send branch.
 *
 * See HARD RULE: feedback_approve_before_send.md.
 */

import { useApprovalGate, type GateConfig } from './approval-gate'

export interface GatedSendOpts<P = any> {
  /** Endpoint that implements the two-step preview / confirmed contract. */
  endpoint: string
  /** Body for both preview and send. `confirmed: true` is appended on send. */
  previewBody?: Record<string, unknown>
  /**
   * Map the preview response into the modal config.
   *
   * If `skipServerPreview` is true, this is called with `previewBody` instead
   * and no preview fetch is made — useful for endpoints that don't implement
   * the two-step flow (e.g. social post publish).
   */
  buildConfig: (preview: P) => GateConfig
  /**
   * Skip the preview round-trip and build the gate config directly from
   * `previewBody`. Only safe when the caller already has everything needed
   * to render a faithful preview client-side.
   */
  skipServerPreview?: boolean
  /** Optional: runs after successful send. */
  onSent?: (data: any) => void
  /** Optional: runs on preview error. */
  onError?: (err: Error) => void
}

export interface GatedSendResult<R = any> {
  confirmed: boolean
  data: R | null
  error?: string
}

export function useGatedSend() {
  const gate = useApprovalGate()

  return async function gatedSend<P = any, R = any>(
    opts: GatedSendOpts<P>
  ): Promise<GatedSendResult<R>> {
    // Step 1: fetch preview (unless skipped)
    let preview: P
    if (opts.skipServerPreview) {
      preview = (opts.previewBody || {}) as unknown as P
    } else {
      try {
        const previewRes = await fetch(opts.endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...(opts.previewBody || {}) }),
        })
        preview = await previewRes.json()
        const asErr = preview as unknown as { error?: string }
        if (asErr.error) {
          const err = new Error(asErr.error)
          opts.onError?.(err)
          return { confirmed: false, data: null, error: asErr.error }
        }
      } catch (err: any) {
        const e = err instanceof Error ? err : new Error(String(err))
        opts.onError?.(e)
        return { confirmed: false, data: null, error: e.message }
      }
    }

    // Step 2: gate
    const config = opts.buildConfig(preview)
    const { confirmed } = await gate(config)
    if (!confirmed) return { confirmed: false, data: null }

    // Step 3: actually send
    try {
      const sendRes = await fetch(opts.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...(opts.previewBody || {}), confirmed: true }),
      })
      const data: R = await sendRes.json()
      const asErr = data as unknown as { error?: string }
      if (asErr.error) {
        return { confirmed: true, data: null, error: asErr.error }
      }
      opts.onSent?.(data)
      return { confirmed: true, data }
    } catch (err: any) {
      const e = err instanceof Error ? err : new Error(String(err))
      return { confirmed: true, data: null, error: e.message }
    }
  }
}
