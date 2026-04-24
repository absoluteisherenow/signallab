// Brain verdict endpoint. Takes a finalised caption (or any text output) and
// runs it through the brain's post-check layer without regenerating. Used by
// the broadcast preview so low-confidence or rule-violating drafts surface a
// warning BEFORE Anthony hits "Preview + Approve".
//
// Returns:
//   - invariants: per-rule pass/fail verdicts with severity
//   - redTeam: Haiku adversarial pass (fabrications, AI tells, clichés)
//   - council: 5-advisor verdict when the task is high-stakes
//   - confidence: derived [0-1] score — 1.0 minus penalties for each hard_block
//     (0.3) and soft_flag (0.1) failure. Clamped [0, 1].
//
// No generation, no regeneration. Pure evaluation. Safe to run per-keystroke
// if desired (though the redTeam + council calls aren't free — wire UI to
// debounce or fire on explicit "Check" button).

import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/api-auth'
import { getOperatingContext } from '@/lib/operatingContext'
import { runOutputChecks } from '@/lib/rules'
import { runRedTeam } from '@/lib/brain/redTeamCheck'
import { runCouncil, shouldAutoCouncil, type CouncilVerdict } from '@/lib/brain/council'
import { CONFIDENCE_ABSTAIN_THRESHOLD } from '@/lib/brain/confidence'
import type { TaskType, InvariantVerdict } from '@/lib/rules/types'

export const dynamic = 'force-dynamic'

const VALID_TASKS = new Set<TaskType>([
  'caption.instagram',
  'caption.tiktok',
  'caption.threads',
  'release.announce',
  'release.rollout',
  'gig.content',
  'gig.advance',
  'gig.recap',
  'ad.creative',
  'ad.launch',
  'assistant.chat',
  'brief.weekly',
  'invoice.draft',
  'invoice.send',
  'invoice.reminder',
  'trend.scan',
  'gmail.scan',
])

function deriveConfidence(verdicts: InvariantVerdict[]): number {
  let score = 1.0
  for (const v of verdicts) {
    if (v.passed) continue
    if (v.severity === 'hard_block') score -= 0.3
    else if (v.severity === 'soft_flag') score -= 0.1
  }
  return Math.max(0, Math.min(1, Math.round(score * 100) / 100))
}

export async function POST(req: NextRequest) {
  const gate = await requireUser(req)
  if (gate instanceof NextResponse) return gate
  const { user } = gate

  const body = await req.json().catch(() => ({}))
  const output = typeof body.output === 'string' ? body.output.trim() : ''
  const task = (VALID_TASKS.has(body.task) ? body.task : null) as TaskType | null
  if (!output) return NextResponse.json({ error: 'output required' }, { status: 400 })
  if (!task) return NextResponse.json({ error: 'valid task required' }, { status: 400 })

  // Verified grounding the user attached on the composer side — collaborators,
  // tagged handles, first comment, hashtags. Red-team treats everything here
  // as fact so it doesn't flag user-confirmed names as fabricated.
  const rawG = (body.grounding && typeof body.grounding === 'object') ? body.grounding : {}
  const grounding = {
    collaborators: Array.isArray(rawG.collaborators) ? rawG.collaborators.filter((v: unknown) => typeof v === 'string') : [],
    userTagHandles: Array.isArray(rawG.userTagHandles) ? rawG.userTagHandles.filter((v: unknown) => typeof v === 'string') : [],
    firstComment: typeof rawG.firstComment === 'string' ? rawG.firstComment : '',
    hashtags: Array.isArray(rawG.hashtags) ? rawG.hashtags.filter((v: unknown) => typeof v === 'string') : [],
  }

  const wantCouncil =
    body.council === true || (body.council !== false && shouldAutoCouncil(task))
  const wantRedTeam = body.runRedTeam !== false

  const ctx = await getOperatingContext({ userId: user.id, task })
  const verdicts = runOutputChecks(output, ctx.rules, ctx)

  const tasks: Array<Promise<any>> = []
  tasks.push(
    wantRedTeam
      ? runRedTeam({
          userId: user.id,
          output,
          ctx,
          taskInstruction: `Review finalised ${task} output before approve-and-send.`,
          grounding,
        }).catch(() => null)
      : Promise.resolve(null)
  )
  tasks.push(
    wantCouncil
      ? runCouncil({
          userId: user.id,
          question: `Is this ${task} output the right call? Score it for credibility, clarity, and whether it serves the North Star (more bookings + followers without credibility loss).`,
          sharedContext: [
            ctx.priority.formatted && `Priority: ${ctx.priority.formatted}`,
            `Proposed output:\n${output}`,
          ]
            .filter(Boolean)
            .join('\n\n'),
          task,
        }).catch(() => null)
      : Promise.resolve(null)
  )

  const [redTeam, council] = (await Promise.all(tasks)) as [InvariantVerdict | null, CouncilVerdict | null]

  const allVerdicts = redTeam ? [...verdicts, redTeam] : verdicts
  const confidence = deriveConfidence(allVerdicts)

  return NextResponse.json({
    ok: true,
    task,
    confidence,
    abstain_threshold: CONFIDENCE_ABSTAIN_THRESHOLD,
    abstain: confidence < CONFIDENCE_ABSTAIN_THRESHOLD,
    invariants: allVerdicts,
    redTeam,
    council,
  })
}
