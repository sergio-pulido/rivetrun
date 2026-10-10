#!/usr/bin/env node
// RR-SOUND (docs/SOUND_PACK.md): generates the ElevenLabs pack into apps/web/public/sfx, levels it and writes the
// index the app reads (apps/web/src/game/audio/samplePack.json).
//
//   node scripts/gen-sound.mjs            generate what is missing, level it, write the index
//   node scripts/gen-sound.mjs --index    no API calls: level and index the files that are on disk (dropped in by hand)
//   node scripts/gen-sound.mjs --list     print the pack and what is missing; calls nothing, writes nothing
//   node scripts/gen-sound.mjs --voice <voice_id>   use this voice instead of picking one
//
// Idempotent: a file that exists is never generated again, and never levelled twice.
// The key is read from apps/web/.env.local (ELEVENLABS_API_KEY) and is never printed or logged.
// API as documented at https://elevenlabs.io/docs/api-reference (checked 2026-10-10):
//   POST /v1/sound-generation?output_format=…   { text, duration_seconds (0.5–30), prompt_influence (0–1), loop, model_id }
//   POST /v1/text-to-speech/{voice_id}?output_format=…   { text, model_id, voice_settings }
//   GET  /v2/voices?category=premade&page_size=…   { voices: [{ voice_id, name, category, labels, description }], has_more, next_page_token }
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'apps/web/public/sfx');
const INDEX = path.join(ROOT, 'apps/web/src/game/audio/samplePack.json');
const ENV = path.join(ROOT, 'apps/web/.env.local');
const API = 'https://api.elevenlabs.io';
const FORMAT = 'mp3_44100_128';
const BUDGET_BYTES = 2.5 * 1024 * 1024;
const NO = ', no music, no voices';

/** Loudness targets, LUFS: the ambience sits well under the procedural sounds, the announcer on top. */
const LEVEL = { ambience: { lufs: -30, peakDb: -3, channels: 2 }, shot: { lufs: -18, peakDb: -1.5, channels: 1 }, voice: { lufs: -16, peakDb: -1.5, channels: 1 } };

const PACK = [
  { name: 'amb_m7_quake', kind: 'ambience', seconds: 20, text: `Aftermath of an earthquake in a ruined city: low distant rumble, settling debris and small concrete crumbles, wind whistling through broken buildings, far-off sirens fading in and out${NO}` },
  { name: 'amb_m9_polar', kind: 'ambience', seconds: 20, text: `Polar research station at night: steady howling wind, ice creaking, faint metallic hum of a generator, light snow hiss${NO}` },
  { name: 'amb_storm', kind: 'ambience', seconds: 20, text: `Heavy rain on open ground with gusting wind and distant rolling thunder${NO}` },
  { name: 'amb_workshop', kind: 'ambience', seconds: 20, text: `Quiet maker workshop: soft hum of a 3D printer working, a small fan, occasional click of tools on a bench, calm and warm${NO}` },
  { name: 'amb_arena', kind: 'ambience', seconds: 20, text: `Indoor robotics arena before a race: low electronic hum, soft crowd murmur, occasional excited cheer${NO}` },
  { name: 'fx_quake_tremor', kind: 'shot', seconds: 4, text: 'Strong earthquake aftershock: deep rumble swelling and fading, rattling debris and glass' },
  { name: 'fx_race_go', kind: 'shot', seconds: 1.5, text: 'Electronic race start horn, bright and punchy' },
  { name: 'fx_win_sting', kind: 'shot', seconds: 2.5, text: 'Short triumphant synth fanfare, modern, upbeat' },
  { name: 'fx_lose_sting', kind: 'shot', seconds: 2, text: 'Short playful descending synth jingle, light, not sad' },
  { name: 'fx_photo_finish', kind: 'shot', seconds: 2, text: 'Camera flash burst with a rising whoosh' },
  { name: 'vo_countdown', kind: 'voice', text: 'Three. Two. One. Go!' },
  { name: 'vo_jev_lead', kind: 'voice', text: 'Jev takes the lead!' },
  { name: 'vo_human_lead', kind: 'voice', text: 'A human takes the lead!' },
  { name: 'vo_photo_finish', kind: 'voice', text: 'Photo finish!' },
  { name: 'vo_ai_wins', kind: 'voice', text: 'The AI wins it!' },
  { name: 'vo_human_wins', kind: 'voice', text: 'The human wins it!' },
  { name: 'vo_best_combo', kind: 'voice', text: 'New best combo of the day!' },
  { name: 'vo_thinking', kind: 'voice', text: 'Too slow: still thinking!' },
];

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const option = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
const fileOf = (name) => path.join(OUT, `${name}.mp3`);
const present = (name) => existsSync(fileOf(name)) && statSync(fileOf(name)).size > 0;
const say = (line) => process.stdout.write(`${line}\n`);

/** The key from the environment or apps/web/.env.local. Returned to the caller only; never written anywhere. */
function readKey() {
  if (process.env.ELEVENLABS_API_KEY) return process.env.ELEVENLABS_API_KEY.trim();
  if (!existsSync(ENV)) return null;
  for (const line of readFileSync(ENV, 'utf8').split('\n')) {
    const match = line.replace(/^\s*export\s+/, '').match(/^ELEVENLABS_API_KEY\s*=\s*(.*)$/);
    if (match) return match[1].trim().replace(/^(['"])(.*)\1$/, '$2') || null;
  }
  return null;
}

/** One API call. On failure the message carries the status and the API's own reason, never the request. */
async function call(key, method, url, body) {
  const response = await fetch(url, {
    method,
    headers: { 'xi-api-key': key, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (response.ok) return response;
  let reason = '';
  try {
    const detail = (await response.json()).detail;
    reason = typeof detail === 'string' ? detail : (detail?.message ?? detail?.status ?? JSON.stringify(detail)?.slice(0, 200) ?? '');
  } catch {
    reason = '';
  }
  throw new Error(`ElevenLabs ${method} ${new URL(url).pathname} → HTTP ${response.status}${reason ? `: ${reason}` : ''}`);
}

const ENERGY = [['energetic', 3], ['excited', 3], ['announcer', 3], ['hyped', 3], ['lively', 2], ['upbeat', 2], ['enthusiastic', 2], ['expressive', 1], ['confident', 1], ['bright', 1]];

/** One energetic premade English voice from the account's voices list: the best match of its labels and description. */
async function pickVoice(key) {
  const voices = [];
  let token;
  do {
    const query = new URLSearchParams({ category: 'premade', page_size: '100', ...(token ? { next_page_token: token } : {}) });
    const page = await (await call(key, 'GET', `${API}/v2/voices?${query}`)).json();
    voices.push(...(page.voices ?? []));
    token = page.has_more ? page.next_page_token : undefined;
  } while (token);
  const english = voices.filter((voice) => {
    const language = String(voice.labels?.language ?? 'en').toLowerCase();
    return voice.category === 'premade' && (language === 'en' || language.startsWith('english'));
  });
  if (english.length === 0) throw new Error('the voices list has no premade English voice');
  const score = (voice) => {
    const words = `${Object.values(voice.labels ?? {}).join(' ')} ${voice.description ?? ''}`.toLowerCase();
    return ENERGY.reduce((sum, [word, points]) => sum + (words.includes(word) ? points : 0), 0);
  };
  const best = english.sort((a, b) => score(b) - score(a) || String(a.name).localeCompare(String(b.name)))[0];
  return { id: best.voice_id, name: best.name, score: score(best) };
}

async function generate(key, item, voice) {
  const response = item.kind === 'voice'
    ? await call(key, 'POST', `${API}/v1/text-to-speech/${voice.id}?output_format=${FORMAT}`, {
      text: item.text,
      model_id: 'eleven_multilingual_v2',
      // Lower stability and some style: livelier delivery. Fields as documented; the rest stay at their defaults.
      voice_settings: { stability: 0.35, similarity_boost: 0.75, style: 0.45, use_speaker_boost: true },
    })
    : await call(key, 'POST', `${API}/v1/sound-generation?output_format=${FORMAT}`, {
      text: item.text,
      duration_seconds: item.seconds,
      prompt_influence: 0.3,
      loop: item.kind === 'ambience',
      model_id: 'eleven_text_to_sound_v2',
    });
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length < 1000) throw new Error(`${item.name}: the API returned ${bytes.length} bytes`);
  writeFileSync(fileOf(item.name), bytes);
}

const hasFfmpeg = spawnSync('ffmpeg', ['-version'], { stdio: 'ignore' }).status === 0;
const ffmpeg = (inputArgs) => spawnSync('ffmpeg', ['-hide_banner', '-nostdin', ...inputArgs], { encoding: 'utf8' });

/** Mean and peak level and the length of a file, from ffmpeg. */
function measure(file) {
  const out = ffmpeg(['-i', file, '-af', 'volumedetect', '-f', 'null', '-']).stderr ?? '';
  const number = (pattern) => { const match = out.match(pattern); return match ? Number(match[1]) : null; };
  const time = out.match(/Duration: (\d+):(\d+):(\d+\.\d+)/);
  return { meanDb: number(/mean_volume: (-?[\d.]+) dB/), peakDb: number(/max_volume: (-?[\d.]+) dB/), seconds: time ? Number(time[1]) * 3600 + Number(time[2]) * 60 + Number(time[3]) : null };
}

/**
 * Levels one file in place. Three seconds or more: loudnorm in two passes with linear gain, so a loop keeps its
 * seam. Shorter: plain gain to the peak target, because loudnorm cannot judge a clip that short.
 */
function level(item) {
  const file = fileOf(item.name);
  const target = LEVEL[item.kind];
  const before = measure(file);
  const temp = path.join(OUT, `.${item.name}.tmp.mp3`);
  let filter;
  if ((before.seconds ?? 0) >= 3) {
    const probe = ffmpeg(['-i', file, '-af', `loudnorm=I=${target.lufs}:TP=${target.peakDb}:LRA=11:print_format=json`, '-f', 'null', '-']).stderr ?? '';
    const found = probe.slice(probe.lastIndexOf('{'), probe.lastIndexOf('}') + 1);
    const m = JSON.parse(found);
    filter = `loudnorm=I=${target.lufs}:TP=${target.peakDb}:LRA=11:measured_I=${m.input_i}:measured_TP=${m.input_tp}:measured_LRA=${m.input_lra}:measured_thresh=${m.input_thresh}:offset=${m.target_offset}:linear=true`;
  } else {
    if (before.peakDb === null) throw new Error(`${item.name}: ffmpeg could not measure it`);
    filter = `volume=${(target.peakDb - before.peakDb).toFixed(2)}dB`;
  }
  const done = ffmpeg(['-y', '-i', file, '-af', filter, '-ar', '44100', '-ac', String(target.channels), '-codec:a', 'libmp3lame', '-b:a', '128k', temp]);
  if (done.status !== 0) {
    rmSync(temp, { force: true });
    throw new Error(`${item.name}: ffmpeg failed to level it`);
  }
  renameSync(temp, file);
}

const readIndex = () => {
  try {
    return JSON.parse(readFileSync(INDEX, 'utf8'));
  } catch {
    return { files: {} };
  }
};

/** The index the app imports: one entry per file on disk, with what was measured. Stable, so a rerun changes nothing. */
function writeIndex(previous, voice) {
  const files = {};
  for (const item of PACK) {
    if (!present(item.name)) continue;
    const kept = previous.files?.[item.name];
    const bytes = statSync(fileOf(item.name)).size;
    const measured = hasFfmpeg ? measure(fileOf(item.name)) : { meanDb: kept?.meanDb ?? null, peakDb: kept?.peakDb ?? null, seconds: kept?.seconds ?? null };
    files[item.name] = { kind: item.kind, bytes, seconds: measured.seconds, meanDb: measured.meanDb, peakDb: measured.peakDb, levelled: kept?.levelled === true && kept.bytes === bytes };
  }
  const index = {
    note: 'Written by scripts/gen-sound.mjs (RR-SOUND). Lists the recorded sounds that exist in apps/web/public/sfx; the app asks only for these.',
    voice: voice ?? previous.voice ?? null,
    files,
  };
  writeFileSync(INDEX, `${JSON.stringify(index, null, 2)}\n`);
  return index;
}

async function main() {
  const missing = PACK.filter((item) => !present(item.name));
  if (flag('--list')) {
    for (const item of PACK) say(`${present(item.name) ? 'have   ' : 'missing'}  ${item.name.padEnd(16)} ${item.kind.padEnd(8)} ${item.seconds ? `${item.seconds} s` : 'speech'}  ${item.text}`);
    say(`${PACK.length - missing.length} of ${PACK.length} on disk in ${path.relative(ROOT, OUT)}`);
    return 0;
  }
  mkdirSync(OUT, { recursive: true });
  const previous = readIndex();
  let voice = previous.voice ?? null;
  let blocked = false;

  if (!flag('--index') && missing.length > 0) {
    const key = readKey();
    if (!key) {
      say('ELEVENLABS_API_KEY is not set in apps/web/.env.local: nothing was generated.');
      say(`Add the key and run this again, or drop these files into ${path.relative(ROOT, OUT)} and run it with --index:`);
      say(`  ${missing.map((item) => `${item.name}.mp3`).join(' ')}`);
      blocked = true;
    } else {
      if (missing.some((item) => item.kind === 'voice')) {
        const asked = option('--voice');
        voice = asked ? { id: asked, name: voice?.id === asked ? voice.name : 'chosen by hand' } : (voice?.id ? voice : await pickVoice(key));
        say(`voice: ${voice.name} (${voice.id})`);
      }
      for (const item of missing) {
        await generate(key, item, voice);
        say(`generated  ${item.name}.mp3  ${statSync(fileOf(item.name)).size} bytes`);
      }
    }
  }

  // Level what has not been levelled yet. The index remembers, so a file is never re-encoded twice.
  let index = writeIndex(previous, voice);
  if (hasFfmpeg) {
    for (const item of PACK) {
      const entry = index.files[item.name];
      if (!entry || entry.levelled) continue;
      level(item);
      const after = measure(fileOf(item.name));
      index.files[item.name] = { ...entry, bytes: statSync(fileOf(item.name)).size, seconds: after.seconds, meanDb: after.meanDb, peakDb: after.peakDb, levelled: true };
      say(`levelled   ${item.name}.mp3  mean ${after.meanDb} dB  peak ${after.peakDb} dB`);
    }
    writeFileSync(INDEX, `${JSON.stringify(index, null, 2)}\n`);
  } else if (Object.keys(index.files).length > 0) {
    say('ffmpeg is not installed: the files were not levelled. The ambience may be louder than the procedural sounds.');
  }

  index = readIndex();
  const total = Object.values(index.files).reduce((sum, entry) => sum + entry.bytes, 0);
  say(`${Object.keys(index.files).length} of ${PACK.length} files, ${(total / 1024 / 1024).toFixed(2)} MB of ${(BUDGET_BYTES / 1024 / 1024).toFixed(1)} MB`);
  if (total > BUDGET_BYTES) {
    say('Over the budget: the pack must stay at or under 2.5 MB. Shorten or drop an ambience loop.');
    return 1;
  }
  return blocked ? 2 : 0;
}

main().then(
  (code) => process.exit(code),
  (error) => {
    // The message only: never the request, its headers or the environment.
    say(`gen-sound: ${error instanceof Error ? error.message : 'failed'}`);
    process.exit(1);
  },
);
