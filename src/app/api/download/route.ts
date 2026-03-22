import { NextRequest, NextResponse } from 'next/server'
import { readFileSync } from 'fs'
import { join } from 'path'

export async function GET(req: NextRequest) {
  try {
    const files = [
      'SL_Chord_Engine.maxpat',
      'SL_Scanner.maxpat',
      'signallab_chord.js',
      'signallab_scanner.js',
    ]
    const JSZip = (await import('jszip')).default
    const zip = new JSZip()
    for (const file of files) {
      const path = join(process.cwd(), 'public', 'downloads', file)
      const content = readFileSync(path)
      zip.file(file, content)
    }
    const buffer = await zip.generateAsync({ type: 'nodebuffer' })
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': 'attachment; filename=SignalLab_M4L_Suite.zip',
      },
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
