#!/usr/bin/env node
// Generate Apple Wallet pkpass assets from the authoritative NM emblem PNG.
// HARD RULE (memory: feedback_never_recreate_nm_logo): never hand-draw the
// emblem. We take public/nm-emblem.png, trim whitespace, recolor to Ash on
// transparent using brightness as alpha, then resize to Apple spec sizes.

import { readFileSync } from 'node:fs'
import { writeFile, mkdir } from 'node:fs/promises'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')
const EMBLEM_SRC = resolve(ROOT, 'public/nm-emblem.png')
const OUT_DIR = resolve(ROOT, 'assets/pkpass')

const ASH = { r: 240, g: 235, b: 226 }

async function emblemAshTransparent(size) {
  const { data, info } = await sharp(EMBLEM_SRC)
    .trim({ background: '#000000' })
    .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .raw()
    .toBuffer({ resolveWithObject: true })
  const w = info.width, h = info.height, ch = info.channels
  const rgba = Buffer.alloc(w * h * 4)
  for (let i = 0; i < w * h; i++) {
    rgba[i * 4] = ASH.r
    rgba[i * 4 + 1] = ASH.g
    rgba[i * 4 + 2] = ASH.b
    rgba[i * 4 + 3] = data[i * ch]
  }
  return sharp(rgba, { raw: { width: w, height: h, channels: 4 } }).png().toBuffer()
}

async function logoPng(widthPt, heightPt) {
  // Apple logo area: max 160×50 pt. Left-align a square emblem so it doesn't
  // stretch against the 3.2:1 logo rectangle.
  const emblem = await emblemAshTransparent(heightPt)
  return sharp({
    create: { width: widthPt, height: heightPt, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite([{ input: emblem, top: 0, left: 0 }])
    .png()
    .toBuffer()
}

async function backgroundPng(widthPt, heightPt) {
  // Apple spec: 180×220 pt background. iOS auto-applies a heavy gaussian blur,
  // so the emblem must be large and full-alpha to survive as a visible glow.
  const emblemSize = Math.round(widthPt * 0.95)
  const emblem = await emblemAshTransparent(emblemSize)
  const left = Math.round((widthPt - emblemSize) / 2)
  const top = heightPt - emblemSize - Math.round(heightPt * 0.02)
  return sharp({
    create: { width: widthPt, height: heightPt, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 1 } },
  })
    .composite([{ input: emblem, top, left }])
    .png()
    .toBuffer()
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true })
  for (const [name, size] of [['icon.png', 29], ['icon@2x.png', 58], ['icon@3x.png', 87]]) {
    await writeFile(resolve(OUT_DIR, name), await emblemAshTransparent(size))
    console.log(`wrote ${name} (${size}×${size})`)
  }
  for (const [name, w, h] of [['logo.png', 160, 50], ['logo@2x.png', 320, 100], ['logo@3x.png', 480, 150]]) {
    await writeFile(resolve(OUT_DIR, name), await logoPng(w, h))
    console.log(`wrote ${name} (${w}×${h})`)
  }
  for (const [name, w, h] of [['background.png', 180, 220], ['background@2x.png', 360, 440], ['background@3x.png', 540, 660]]) {
    await writeFile(resolve(OUT_DIR, name), await backgroundPng(w, h))
    console.log(`wrote ${name} (${w}×${h})`)
  }
  console.log(`\nDone. Assets in ${OUT_DIR}`)
}

main().catch(err => { console.error(err); process.exit(1) })
