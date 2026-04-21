#!/usr/bin/env node
// Nano Banana (Gemini 2.5 Flash Image) — Ferrari moodboard batch
// Reads reference image + scene prompts, writes variations to ~/Downloads/nm-ferrari-moodboard/

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const KEY = process.env.GEMINI_API_KEY || fs.readFileSync(new URL('../.env.local', import.meta.url), 'utf8').match(/GEMINI_API_KEY=(.+)/)?.[1]?.trim();
if (!KEY) { console.error('missing GEMINI_API_KEY'); process.exit(1); }

const REF = process.argv[2] || `${os.homedir()}/Desktop/Screenshot 2026-04-20 at 16.55.17.png`;
const OUT = `${os.homedir()}/Downloads/nm-ferrari-moodboard`;
fs.mkdirSync(OUT, { recursive: true });

const KEEP = 'Preserve the exact red Ferrari F355 from the reference — identical model, colour, bodywork, wheels, angle and proportions. Do not restyle the car. Only change the environment around it. Shot on 35mm film, cinematic colour grade, subtle grain, no CGI sheen.';

const SCENES = [
  // OUT-OF-PLACE / DERELICT
  ['01_council_estate',   `${KEEP} Place the car in the courtyard of an abandoned British council estate at dusk. Boarded-up windows, graffitied brick, broken glass on concrete, a washing line still strung between balconies. The Ferrari looks like it has always been parked there. Wide shot, three-quarter front.`],
  ['02_farm_track',       `${KEEP} Place the car on a muddy English farm track in overcast daylight. Deep tractor ruts, brown puddles, barbed wire fence, a collapsed corrugated-metal barn behind. Distant cows in a field. The car is immaculate and completely wrong for the setting. Eye-level three-quarter.`],
  ['03_derelict_petrol',  `${KEEP} Place the car on the forecourt of a long-abandoned 1970s British petrol station. Weeds pushing through cracked tarmac, rusted pumps, faded painted signage, moss on the canopy. Overcast grey sky. Wide documentary framing.`],
  ['04_scrapyard_dawn',   `${KEEP} Place the car inside a scrapyard at dawn. Crushed cars stacked three high either side forming a corridor of wrecks, mud underfoot, low golden sun cutting through. Crows on the stacks. The Ferrari is the only living thing.`],
  // BEAUTIFUL / EPIC — SCALE
  ['05_highland_pass',    `${KEEP} Place the car on an empty single-track Scottish highland pass at golden hour. The road snakes into distant mountains, heather and rust-coloured moorland, no fences, no people. Low sun rakes across the landscape. Wide landscape composition, car small in frame.`],
  ['06_slate_quarry',     `${KEEP} Place the car at the base of a Welsh slate quarry. Vertical grey walls rise cathedral-tall above it, dwarfing the vehicle. Hard afternoon shadow. Loose slate on the ground. Treat the quarry walls like architecture.`],
  ['07_black_sand_beach', `${KEEP} Place the car on a black volcanic sand beach, Iceland-style. Basalt columns on one side, pale grey surf rolling in on the other, low heavy sky. The Ferrari is the only warm-coloured object in the entire frame. Wide, still, painterly.`],
  // CAR AS CHARACTER / ARCHITECTURE
  ['08_hero_low_angle',   `${KEEP} Reframe as an extreme low worm's-eye hero shot. The Ferrari fills the frame, headlights blazing like twin stars, front grille dominant, shot from ground level looking up. Sky and a hint of landscape behind. Make the car feel mythic, monumental.`],
  ['09_tunnel_symmetry',  `${KEEP} Reframe in perfect one-point perspective inside a concrete road tunnel — Kubrick/Deakins symmetry. The car is dead-centre, vanishing point locked behind it, lines of overhead lights converging. Treat the car like a piece of architecture inside a larger architecture.`],
  ['10_top_down',         `${KEEP} Reframe as a top-down overhead aerial directly above the car on fresh black tarmac. Crisp white painted road lines run under and past it. Pure geometry, graphic composition, no horizon, no sky. The car reads as a shape first, a car second.`],
  ['11_arch_detail',      `${KEEP} Reframe as a tight architectural detail shot — quarter panel, rear wheel arch and Ferrari badge filling the frame. Raking hard side-light sculpts the curves. No full car visible. Treat it like product/architecture photography, not automotive.`],
];

const refB64 = fs.readFileSync(REF).toString('base64');
const MODEL = 'gemini-2.5-flash-image';
const URL_ = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${KEY}`;

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function gen([name, prompt], attempt = 1) {
  const body = {
    contents: [{
      parts: [
        { inlineData: { mimeType: 'image/png', data: refB64 } },
        { text: prompt },
      ],
    }],
  };
  const r = await fetch(URL_, { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(body) });
  if (r.status === 429) {
    const txt = await r.text();
    const delay = Number(txt.match(/"retryDelay":\s*"(\d+)s"/)?.[1] || 50);
    if (attempt > 4) { console.error(name, 'gave up after retries'); return; }
    console.log(`${name} → 429, waiting ${delay}s (attempt ${attempt})`);
    await sleep((delay + 2) * 1000);
    return gen([name, prompt], attempt + 1);
  }
  if (!r.ok) { console.error(name, r.status, (await r.text()).slice(0,300)); return; }
  const j = await r.json();
  const parts = j.candidates?.[0]?.content?.parts || [];
  const img = parts.find(p => p.inlineData)?.inlineData?.data;
  if (!img) { console.error(name, 'no image', JSON.stringify(j).slice(0,300)); return; }
  const out = path.join(OUT, `${name}.png`);
  fs.writeFileSync(out, Buffer.from(img, 'base64'));
  console.log('wrote', out);
}

const SLICE = process.env.ONLY ? SCENES.filter(s => process.env.ONLY.split(',').some(k => s[0].includes(k))) : SCENES;
for (const scene of SLICE) {
  await gen(scene);
  await sleep(15000);
}
console.log('\ndone →', OUT);
