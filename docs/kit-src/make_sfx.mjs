// The intro's sound effects, made with ElevenLabs text-to-sound-effects.
// Needs ELEVENLABS_API_KEY in the environment (never committed).
//   ELEVENLABS_API_KEY=... node docs/kit-src/make_sfx.mjs   -> server/public/intro/sfx/*.mp3
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
const key = process.env.ELEVENLABS_API_KEY;
if (!key) { console.error('No ELEVENLABS_API_KEY'); process.exit(1); }
const out = new URL('../../server/public/intro/sfx/', import.meta.url).pathname; mkdirSync(out, { recursive: true });
const SFX = {
  pop: ['soft cute cartoon pop, a bubble appearing, very short', 0.5],
  hop: ['tiny soft thump of a rabbit hopping on a carpet, light, short', 0.5],
  chew: ['rabbit nibbling and crunching, small quick chews, close up', 2.0],
  munch: ['rabbit munching dry hay, soft crunchy rustle', 2.0],
  sting: ['gentle low ominous piano note with a soft swell, sad, short', 2.5],
  warn: ['soft cartoon uh-oh boing, two descending notes, playful', 0.8],
  chime: ['bright soft notification chime, friendly, two notes', 0.8],
  click: ['small plastic gadget clicking into place, snap, short', 0.5],
  whoosh: ['light airy swoosh of a card sliding in, short', 0.6],
  ping: ['cheerful phone message ping with a tiny sparkle', 0.8],
  title: ['warm short ukulele and glockenspiel sting, cute, cheerful, opening title', 2.0],
  end: ['happy short glockenspiel and ukulele outro jingle, warm, resolving', 2.5],
  bed: ['gentle cosy acoustic background music, soft ukulele and light glockenspiel, calm, loopable, no drums', 22],
};
for (const [name, [text, dur]] of Object.entries(SFX)) {
  const res = await fetch('https://api.elevenlabs.io/v1/sound-generation', {
    method: 'POST', headers: { 'xi-api-key': key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, duration_seconds: dur, prompt_influence: 0.6 }),
  });
  if (!res.ok) { console.error(name, res.status, (await res.text()).slice(0, 200)); continue; }
  const buf = Buffer.from(await res.arrayBuffer());
  writeFileSync(join(out, `${name}.mp3`), buf);
  console.log(name, (buf.length / 1024).toFixed(0) + ' KB');
}
