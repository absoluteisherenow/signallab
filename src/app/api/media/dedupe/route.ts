import { listFiles, deleteFile } from '@/lib/storage'
import { NextResponse } from 'next/server'

/**
 * Sweep R2 for duplicate media objects and delete them.
 *
 * Two objects are considered duplicates if they share:
 *   - the same top-level category folder (media/{cat}/…)
 *   - the same exact byte size
 *
 * The newest upload in each group is kept, the rest are deleted. This
 * is a pragmatic heuristic, not cryptographic dedup — two different
 * photos with identical byte counts would collapse — but in practice
 * R2 filenames were unique-per-upload before the content-addressed
 * key change, so only true duplicates hit this condition.
 *
 * Future uploads are deduped at write time (content-addressed keys in
 * /api/upload and /api/media POST), so this endpoint is a one-shot
 * cleanup for pre-existing objects.
 */
export async function POST() {
  try {
    const all = await listFiles('media/')
    const groups = new Map<string, typeof all>()

    for (const item of all) {
      const cat = item.key.split('/')[1] ?? 'other'
      const sig = `${cat}:${item.size}`
      const bucket = groups.get(sig) ?? []
      bucket.push(item)
      groups.set(sig, bucket)
    }

    const toDelete: string[] = []
    let kept = 0
    for (const bucket of groups.values()) {
      if (bucket.length <= 1) { kept += bucket.length; continue }
      // Keep the newest, delete the rest
      bucket.sort((a, b) => new Date(b.uploaded).getTime() - new Date(a.uploaded).getTime())
      kept += 1
      for (const dup of bucket.slice(1)) toDelete.push(dup.key)
    }

    // Delete in small batches so we don't blow the Worker's subrequest budget
    const BATCH = 20
    let deleted = 0
    for (let i = 0; i < toDelete.length; i += BATCH) {
      const slice = toDelete.slice(i, i + BATCH)
      await Promise.all(slice.map(k => deleteFile(k).then(() => { deleted += 1 }).catch(() => {})))
    }

    return NextResponse.json({ scanned: all.length, kept, deleted, remaining: kept })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
