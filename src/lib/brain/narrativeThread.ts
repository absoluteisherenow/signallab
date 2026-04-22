// Narrative thread loader + prompt-block formatter. Threads are the artist's
// medium-horizon stories (campaigns, rig narratives, "what this EP is about")
// — they span weeks and dozens of posts. Without a shared memory, one day's
// caption can undercut last week's framing.
//
// The brain loads active threads filtered to the current task, formats them
// into a `# Active narratives (do not contradict)` block, and injects before
// the task instruction. A soft_flag check (`threadConsistency`) runs post-gen
// and logs when the output contradicts a watch-out — advisory in v1.
//
// Cap: 6 active threads surface per prompt (sorted by priority DESC) to keep
// the prompt lean. Authors who have >6 threads should promote/archive.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { TaskType } from '../rules/types'

export interface NarrativeThread {
  id: string
  slug: string
  title: string
  body: string
  non_negotiables: string[]
  watch_outs: string[]
  applies_to: TaskType[]
  mission_id: string | null
  priority: number
}

const MAX_THREADS_IN_PROMPT = 6

/**
 * Load active narrative threads for a user, filtered to those that apply to
 * the current task. Returns [] when the table doesn't exist or the user has
 * none — never throws.
 */
export async function loadActiveThreads(
  sb: SupabaseClient,
  userId: string,
  task: TaskType
): Promise<NarrativeThread[]> {
  try {
    const { data, error } = await sb
      .from('narrative_threads')
      .select('id, slug, title, body, non_negotiables, watch_outs, applies_to, mission_id, priority')
      .eq('user_id', userId)
      .eq('status', 'active')
      .contains('applies_to', [task])
      .order('priority', { ascending: false })
      .limit(MAX_THREADS_IN_PROMPT)
    if (error || !data) return []
    return data.map((r: any) => ({
      id: r.id,
      slug: r.slug,
      title: r.title,
      body: r.body,
      non_negotiables: Array.isArray(r.non_negotiables) ? r.non_negotiables : [],
      watch_outs: Array.isArray(r.watch_outs) ? r.watch_outs : [],
      applies_to: Array.isArray(r.applies_to) ? r.applies_to : [],
      mission_id: r.mission_id || null,
      priority: typeof r.priority === 'number' ? r.priority : 50,
    }))
  } catch {
    return []
  }
}

/**
 * Format active threads as a system-prompt section. Returns empty string when
 * none — caller skips injection.
 */
export function formatThreadsBlock(threads: NarrativeThread[]): string {
  if (!threads.length) return ''
  const lines: string[] = ['# Active narratives (do not contradict)']
  for (const t of threads) {
    lines.push(`\n## ${t.title}`)
    lines.push(t.body)
    if (t.non_negotiables.length) {
      lines.push('Non-negotiables:')
      for (const n of t.non_negotiables) lines.push(`- ${n}`)
    }
    if (t.watch_outs.length) {
      lines.push('Avoid these contradictions:')
      for (const w of t.watch_outs) lines.push(`- ${w}`)
    }
  }
  return lines.join('\n')
}
