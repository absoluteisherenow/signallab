#!/usr/bin/env node
// Generates public/sw.js from scripts/sw.template.js by injecting a unique
// version tag as the cache name. Runs as part of `prebuild`.
//
// Version source order (first that works wins):
//   1. $CF_PAGES_COMMIT_SHA / $GITHUB_SHA  — set in CI (Cloudflare/GitHub)
//   2. `git rev-parse --short HEAD`         — local dev with clean repo
//   3. `dev-<timestamp>`                    — fallback so we never ship
//                                             with the literal __SW_VERSION__
//
// Why this exists: hand-bumping CACHE_NAME on every deploy is a footgun. If
// we forget, users get cached HTML pointing at chunk filenames that no
// longer exist on the CDN and the app goes blank. Auto-bumping removes the
// human step.

import { readFileSync, writeFileSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')

function resolveVersion() {
  const ci = process.env.CF_PAGES_COMMIT_SHA || process.env.GITHUB_SHA
  if (ci) return ci.slice(0, 8)
  try {
    const sha = execSync('git rev-parse --short=8 HEAD', { cwd: root, stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim()
    if (sha) return sha
  } catch {
    // not a git repo / git missing — fall through
  }
  return `dev-${Date.now()}`
}

const version = resolveVersion()
const templatePath = resolve(root, 'scripts/sw.template.js')
const outputPath = resolve(root, 'public/sw.js')

const template = readFileSync(templatePath, 'utf8')

if (!template.includes('__SW_VERSION__')) {
  console.error('[generate-sw] template missing __SW_VERSION__ marker — refusing to write')
  process.exit(1)
}

const generated =
  `// GENERATED FILE — do not edit. Source: scripts/sw.template.js\n` +
  `// Regenerated on every build via scripts/generate-sw.mjs.\n` +
  template.replaceAll('__SW_VERSION__', version)

writeFileSync(outputPath, generated)
console.log(`[generate-sw] wrote public/sw.js with version=${version}`)
