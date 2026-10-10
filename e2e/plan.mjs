// RivetRun e2e for RR-PLAN (owner: [MASTER], docs/PLAY_AND_PLAN.md): /play and the Lab Analyze panel.
// These are the NEW flows. They never decide a tag: scripts/qa.sh prints their lines and tags on the old flows alone.
//   QA_BASE_URL=http://127.0.0.1:3100 node e2e/plan.mjs      all steps
//   QA_ONLY=play node e2e/plan.mjs                            one group: api | play | missions | analyze
// Its rooms are test rooms (/play?test=1, { test: true }): the server keeps them off every board.
// No model is called: POST /api/plan is answered inside the browser with a fixed plan (the "stubbed model").
// Exit code: 0 when no step failed (skips are allowed), 1 otherwise. A summary lands in <QA_SCREENS>/plan-summary.json.
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BASE = (process.env.QA_BASE_URL ?? 'http://127.0.0.1:3100').replace(/\/$/, '');
const stamp = new Date().toTimeString().slice(0, 5).replace(':', '');
const OUT = process.env.QA_SCREENS ?? path.join(HERE, 'screens', `${stamp}-plan`);
// QA_PLAN_ONLY wins: inside the gate QA_ONLY belongs to the smoke.
const ONLY = process.env.QA_PLAN_ONLY ?? process.env.QA_ONLY ?? '';
const PHONE = { width: 390, height: 844 };
const NAV_MS = 90_000;
/** The room counts down 30 s from the first join, then 5 s to the start; a race on the hands-on mission lasts about a minute. */
const COUNTDOWN_MS = 60_000;
const RACE_MS = 200_000;
const BRIEFING_MAX = 140;

mkdirSync(OUT, { recursive: true });

const results = [];
const warnings = [];
class Skip extends Error {}

const record = (name, status, detail, startedAt) => {
  results.push({ step: name, status, detail, ms: Date.now() - startedAt });
  console.log(`PLAN ${status.toUpperCase().padEnd(4)} ${name.padEnd(26)} ${detail}`);
};

async function step(name, body, page) {
  const startedAt = Date.now();
  try {
    record(name, 'pass', (await body()) ?? '', startedAt);
    return true;
  } catch (error) {
    if (error instanceof Skip) {
      record(name, 'skip', error.message, startedAt);
      return false;
    }
    const file = `plan-fail-${name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}`;
    const saved = page ? await shot(page, file).then(() => ` · see ${file}.png`, () => '') : '';
    record(name, 'fail', `${String(error?.message ?? error).split('\n')[0].slice(0, 300)}${saved}`, startedAt);
    return false;
  }
}

const wants = (group) => ONLY === '' || ONLY.split(',').includes(group);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const shot = (page, name) => page.screenshot({ path: path.join(OUT, `${name}.png`) });
const id = (name) => `[data-testid="${name}"]`;
const text = async (locator) => ((await locator.first().innerText().catch(() => '')) ?? '').replace(/\s+/g, ' ').trim();

function watch(page, label) {
  const seen = { pageErrors: [], checked: 0 };
  page.on('pageerror', (error) => seen.pageErrors.push(String(error.message).slice(0, 240)));
  page.on('response', (response) => {
    const url = response.url();
    if (url.startsWith(BASE) && response.status() >= 500 && !/\/api\/plan$/.test(url)) warnings.push(`${label}: HTTP ${response.status()} ${url.slice(BASE.length)}`);
  });
  return seen;
}

async function go(page, route) {
  const response = await page.goto(`${BASE}${route}`, { waitUntil: 'domcontentloaded', timeout: NAV_MS });
  return response?.status() ?? 0;
}

/** Fails on an uncaught page error since the last check; a page wider than the phone is a warning. */
async function assertHealthy(page, seen) {
  const fresh = seen.pageErrors.slice(seen.checked);
  seen.checked = seen.pageErrors.length;
  if (fresh.length > 0) throw new Error(`uncaught: ${fresh[0]}`);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  if (overflow > 2) warnings.push(`${new URL(page.url()).pathname}: page is ${overflow}px wider than the viewport`);
}

const post = async (route, body) => {
  const response = await fetch(`${BASE}${route}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const raw = await response.text();
  let json = null;
  try {
    json = JSON.parse(raw);
  } catch {
    json = null;
  }
  return { status: response.status, json, raw: raw.slice(0, 200) };
};

/** Routes answer either the bare object or the API envelope `{ success, data }`. */
const payload = (json) => (json && typeof json === 'object' && 'data' in json && json.data && typeof json.data === 'object' ? json.data : json);

// ---- /play -----------------------------------------------------------------------------------------------------------
// The picker is /play ([UI]); when the room starts the phone moves to the existing race page, /race/<code>, which
// shows the race and the result.

const playStep = (page) => page.locator(id('play')).first().getAttribute('data-step').catch(() => null);

async function waitForStep(page, wanted, timeout) {
  const deadline = Date.now() + timeout;
  let last = null;
  while (Date.now() < deadline) {
    if (/\/race\//.test(page.url())) return 'race';
    last = await playStep(page);
    if (wanted.includes(last)) return last;
    await sleep(250);
  }
  throw new Error(`/play stayed on step "${last}" for ${Math.round(timeout / 1000)} s, expected ${wanted.join(' or ')}`);
}

/** Opens /play on one phone and waits until it is matched into a test room. Skips when the route is not built yet. */
async function openPlay(page) {
  const status = await go(page, '/play?test=1');
  if (status === 404) throw new Skip('/play is not built yet (404)');
  if (status !== 200) throw new Error(`GET /play → ${status}`);
  await page.locator(id('play')).first().waitFor({ state: 'visible', timeout: 30_000 }).catch(() => {
    throw new Error('no element with data-testid="play" on /play');
  });
  const reached = await waitForStep(page, ['mission', 'vehicle', 'wait', 'unavailable'], 20_000);
  if (reached !== 'vehicle' && reached !== 'mission') throw new Error(`not matched: step "${reached}" · ${(await text(page.locator(id('play-wait')))) || (await text(page.locator(id('play'))).then((t) => t.slice(0, 120)))}`);
}

/** Taps the card for one step and returns its test id. */
async function tap(page, selector, what) {
  const card = page.locator(selector).first();
  await card.waitFor({ state: 'visible', timeout: 10_000 }).catch(() => {
    throw new Error(`no ${what} card (${selector})`);
  });
  const name = await card.getAttribute('data-testid');
  await card.tap();
  return name;
}

/**
 * Follows one phone on the race page until the room's final order. With `drive`, holds the throttle and answers a
 * TAP CLIMB prompt, as a player would; without it the phone is left alone (an agent drives, or nobody does).
 */
async function raceToResult(page, { drive }) {
  await page.waitForURL(/\/race\/[A-Z0-9]+/i, { timeout: COUNTDOWN_MS + 30_000 });
  const code = new URL(page.url()).pathname.split('/').pop();
  const deadline = Date.now() + COUNTDOWN_MS + RACE_MS;
  let lastTap = 0;
  let lastPress = 0;
  let body = '';
  while (Date.now() < deadline) {
    body = (await page.locator('body').innerText().catch(() => '')).replace(/\s+/g, ' ');
    if (/Final order/i.test(body)) break;
    // The pedals and the keyboard exist only while the race runs, and the page ignores a held key's repeats: the key
    // is let go and pressed again every couple of seconds, so a press made during the start countdown is not the only one.
    if (drive && Date.now() - lastPress > 2000) {
      lastPress = Date.now();
      await page.keyboard.up('ArrowUp');
      await page.keyboard.down('ArrowUp');
    }
    // The one action button: CLIMB when the robot bogs down, JUMP when the sensors report a gap about a metre ahead.
    const gapM = Number(body.match(/in (\d+(?:\.\d+)?) m[^.]{0,40}JUMP IT/)?.[1] ?? 'NaN');
    if (drive && (/TAP CLIMB/.test(body) || gapM <= 1.2) && Date.now() - lastTap > 2500) {
      lastTap = Date.now();
      await page.keyboard.press('Space');
    }
    await sleep(300);
  }
  if (drive) await page.keyboard.up('ArrowUp');
  if (!/Final order/i.test(body)) throw new Error(`no final order on /race/${code} after ${Math.round((COUNTDOWN_MS + RACE_MS) / 1000)} s; the page said: "${body.slice(0, 140)}"`);
  const place = body.match(/\bP(\d)\s*of\s*(\d+)/);
  const finished = /RACE TIME/.test(body);
  // The reason beside this phone's own place, e.g. "DNF · stuck" or "DNF · lost connection".
  const dnf = finished ? null : (body.match(/P\d\s*of\s*\d+\s*(DNF[^a-z]{0,3}[a-z ]{0,24}?)\s*did not finish/)?.[1]?.trim() ?? 'DNF');
  const time = body.match(/(\d+(?:\.\d+)?) ?s\b[^.]{0,12}RACE TIME|(\d{1,2}:\d\d\.\d)/)?.[0] ?? null;
  const playAgain = await page.locator('a[href^="/play"]').first().isVisible().catch(() => false);
  return { code, place: place ? `P${place[1]} of ${place[2]}` : null, lanes: place ? Number(place[2]) : 0, finished, dnf, time, playAgain, body };
}

/**
 * Asks the server to record the run of one pick and waits until it is stored, as scripts/prewarm-play.mjs does
 * before the demo. A phone whose pick is stored is served that run: the server moves its lane (RR-GUARD).
 */
async function storeRun(query, waitMs) {
  const url = `${BASE}/api/play/ghost?${query}`;
  await fetch(url).catch(() => null);
  const deadline = Date.now() + waitMs;
  let last = {};
  while (Date.now() < deadline) {
    last = payload(await fetch(`${url}&status=1`).then((response) => response.json()).catch(() => null)) ?? {};
    if (last.status === 'ready' || last.status === 'unavailable') return last;
    await sleep(3000);
  }
  return { ...last, status: last.status ?? 'no answer' };
}

/** One phone context on /play, matched into a test room. */
async function phoneOnPlay(browser, label) {
  const context = await browser.newContext({ viewport: PHONE, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  return { context, page, seen: watch(page, label) };
}

// One phone at a time: a second software-rendered 3D page slows both below the race clock, and the room closes
// 45 s after its first finisher. Phone A taps three times and drives; phone B, in the next room, is never touched.
async function playSteps(browser) {
  const a = await phoneOnPlay(browser, 'play');
  let joined = false;
  let tapped = false;

  await step('/play · match', async () => {
    await openPlay(a.page);
    // With the mission step (the default since 14:37) no room is asked for until a mission is taken: the first tap.
    let mission = 'no mission step';
    if ((await playStep(a.page)) === 'mission') {
      await shot(a.page, 'play-00-mission');
      mission = `mission tap ${await tap(a.page, id('play-mission-M7'), 'M7 mission')}`;
      await waitForStep(a.page, ['vehicle'], 15_000);
    }
    const room = await text(a.page.locator(id('play-room')));
    const countdown = await text(a.page.locator(id('play-countdown')));
    if (!/\d/.test(countdown)) throw new Error(`no countdown on the vehicle step (play-countdown: "${countdown}")`);
    await shot(a.page, 'play-01-vehicle');
    await assertHealthy(a.page, a.seen);
    joined = true;
    return `${mission}; room ${room || '(no play-room)'}, countdown ${countdown}`;
  }, a.page);

  await step('/play · taps', async () => {
    if (!joined) throw new Skip('no room joined');
    const startedAt = Date.now();
    // Amendment 14:00 (docs/PLAY_AND_PLAN.md): mission → vehicle → driver, no strategy step. The page may still be
    // the earlier vehicle → driver → strategy: each step is taken only if the page shows it.
    let mission = '';
    if ((await playStep(a.page)) === 'mission') {
      mission = `${await tap(a.page, id('play-mission-M7'), 'M7 mission')} → `;
      await waitForStep(a.page, ['vehicle'], 5000);
      await shot(a.page, 'play-01b-vehicle');
    }
    const vehicle = await tap(a.page, id('play-vehicle-all_rounder'), 'All-rounder vehicle');
    await waitForStep(a.page, ['agent'], 5000);
    await shot(a.page, 'play-02-agent');
    const agents = await a.page.locator('[data-testid^="play-agent-"]').evaluateAll((cards) => cards.map((card) => card.getAttribute('data-testid').replace('play-agent-', '')));
    const agent = await tap(a.page, id('play-agent-human'), '"You drive" agent');
    let strategy = '';
    let strategies = 'no strategy step';
    if ((await waitForStep(a.page, ['strategy', 'waiting'], 5000)) === 'strategy') {
      await shot(a.page, 'play-03-strategy');
      strategies = `strategies: ${(await a.page.locator('[data-testid^="play-strategy-"]').evaluateAll((cards) => cards.map((card) => card.getAttribute('data-testid').replace('play-strategy-', '')))).join(', ')}`;
      strategy = ` → ${await tap(a.page, id('play-strategy-plan'), 'plan strategy')}`;
    }
    const tookMs = Date.now() - startedAt;
    await waitForStep(a.page, ['waiting'], 5000);
    await sleep(500);
    await shot(a.page, 'play-04-waiting');
    await assertHealthy(a.page, a.seen);
    tapped = true;
    return `${mission}${vehicle} → ${agent}${strategy} in ${(tookMs / 1000).toFixed(1)} s; ${mission ? 'mission step shown; ' : 'no mission step; '}agents offered: ${agents.join(', ')}; ${strategies}`;
  }, a.page);

  await step('/play · "You drive" → result', async () => {
    if (!tapped) throw new Skip('the three taps did not go through');
    const driven = await raceToResult(a.page, { drive: true });
    await sleep(600);
    await shot(a.page, 'play-06-result-driver');
    await assertHealthy(a.page, a.seen);
    if (!driven.place) throw new Error(`the final order does not show this phone's place; the page said: "${driven.body.slice(0, 140)}"`);
    // This step is about the flow: the phone that drove gets the room's official result. A scripted thumb may well
    // not finish the Play mission. A phone the room lost is a failure. One still on the track when the room closed
    // (45 s after its first finisher) is a warning here: in software rendering the phone's robot runs slower than
    // the room's clock, so the script cannot tell a slow test machine from a slow phone.
    if (!driven.finished && /lost connection/i.test(driven.dnf ?? '')) throw new Error(`the driving phone ended "${driven.dnf}" (${driven.place}); the page said: "${driven.body.slice(0, 160)}"`);
    if (!driven.finished && /race closed/i.test(driven.dnf ?? '')) warnings.push(`/play: the driving phone was still on the track when the room closed (${driven.place}); software rendering runs the phone's robot behind the room's clock`);
    if (!driven.playAgain) warnings.push('/play: the race result has no link back to /play ("Play again", docs/PLAY_AND_PLAN.md §4)');
    const outcome = driven.finished ? (driven.time ?? 'a race time') : `${driven.dnf} (a scripted thumb: throttle held, the action button on its prompts)`;
    return `room ${driven.code}: ${driven.place}, ${outcome}; ${driven.lanes} lanes${driven.lanes < 4 ? ' (the plan says bots fill to at least 4)' : ''}; Play again link: ${driven.playAgain ? 'yes' : 'NO'}`;
  }, a.page);
  await a.context.close();

  // The untouched phone gets the defaults (All-rounder, Jev, the plan): its agent has to bring it to a finish.
  const b = await phoneOnPlay(browser, 'play-idle');
  await step('/play · no taps → defaults', async () => {
    if (!joined) throw new Skip('/play did not match the first phone');
    // The demo prewarms every pick; an untouched phone's pick is All-rounder, Jev, the plan on the Play mission.
    const stored = await storeRun('mission=M7&preset=all_rounder&agent=jev-1.13.0&strategy=plan', 150_000);
    const storedLine = stored.status === 'ready' ? `its pick was stored first (${stored.finished ? `${stored.timeS} s` : 'a run that does not finish'}, ${stored.decisions ?? '?'} decisions)` : `its pick could NOT be stored first (${stored.status})`;
    if (stored.status !== 'ready') warnings.push(`/play: the default pick was not stored before the untouched phone raced (${stored.status}): it drove live`);
    await openPlay(b.page);
    const room = await text(b.page.locator(id('play-room')));
    const idle = await raceToResult(b.page, { drive: false });
    await sleep(600);
    await shot(b.page, 'play-07-result-idle');
    await assertHealthy(b.page, b.seen);
    if (!idle.finished) throw new Error(`an untouched phone (defaults: All-rounder, Jev, the plan) did not finish: ${idle.place ?? 'no place'}, ${idle.dnf}; ${storedLine}; the page said: "${idle.body.slice(0, 160)}"`);
    return `an untouched phone finished without a tap: ${idle.place}, ${idle.time ?? 'a race time'}; ${storedLine}${/cached run/i.test(idle.body) ? '; the phone said "cached run"' : ''}${room ? `; room ${room}` : ''}`;
  }, b.page);
  await b.context.close();
}

/**
 * The mission step of the 14:00 amendment, which [UI] ships behind a switch (/play?missions=1): no room is asked for
 * before a mission is taken; the tap seats the phone in that mission's room. Checked up to the waiting step only.
 */
async function missionSteps(browser) {
  const phone = await phoneOnPlay(browser, 'play-missions');
  const matches = [];
  phone.page.on('request', (request) => {
    if (request.method() === 'POST' && /\/api\/race\/match$/.test(request.url())) matches.push(request.postDataJSON?.() ?? {});
  });
  await step('/play · mission step', async () => {
    const status = await go(phone.page, '/play?test=1&missions=1');
    if (status === 404) throw new Skip('/play is not built yet (404)');
    await phone.page.locator(id('play')).first().waitFor({ state: 'visible', timeout: 30_000 });
    const first = await waitForStep(phone.page, ['mission', 'vehicle', 'wait', 'unavailable'], 15_000);
    if (first !== 'mission') throw new Skip(`no mission step behind ?missions=1 (the page opened on "${first}")`);
    const offered = await phone.page.locator('[data-testid^="play-mission-M"]').evaluateAll((cards) => cards.map((card) => card.getAttribute('data-testid').replace('play-mission-', '')));
    if (offered.length < 2) throw new Error(`the mission step offers ${offered.length} mission(s): ${offered.join(', ')}`);
    const early = matches.length;
    await sleep(600);
    await shot(phone.page, 'play-08-missions');
    // Not the first card: the room must be the tapped mission's, not the default one.
    const wanted = offered[1];
    await tap(phone.page, id(`play-mission-${wanted}`), `${wanted} mission`);
    await waitForStep(phone.page, ['vehicle'], 15_000);
    const asked = matches[matches.length - 1] ?? {};
    if (asked.missionId !== wanted) throw new Error(`the match was asked with missionId ${JSON.stringify(asked.missionId)} after tapping ${wanted}`);
    const room = await text(phone.page.locator(id('play-room')));
    const shown = await text(phone.page.locator(id('play-mission')));
    await tap(phone.page, '[data-testid^="play-vehicle-"]', 'a vehicle');
    await waitForStep(phone.page, ['agent'], 5000);
    await tap(phone.page, '[data-testid^="play-agent-jev"]', 'Jev driver');
    await waitForStep(phone.page, ['waiting', 'strategy'], 5000);
    await shot(phone.page, 'play-09-mission-waiting');
    await assertHealthy(phone.page, phone.seen);
    const snapshot = room ? await fetch(`${BASE}/api/race/${room}`).then((response) => response.json()).catch(() => null) : null;
    const roomMission = payload(snapshot)?.missionId ?? payload(snapshot)?.room?.missionId ?? null;
    if (roomMission && roomMission !== wanted) throw new Error(`room ${room} runs ${roomMission}, the phone tapped ${wanted}`);
    return `missions offered: ${offered.join(', ')}; ${early === 0 ? 'no room asked for before the tap' : `${early} match call(s) BEFORE the tap`}; tapped ${wanted} → room ${room}${roomMission ? ` on ${roomMission}` : ''}; the page says "${shown.slice(0, 50)}"`;
  }, phone.page);
  await phone.context.close();
}

// ---- The match and pick routes, without a browser --------------------------------------------------------------------

async function apiSteps() {
  let seat = null;
  await step('api · match', async () => {
    const reply = await post('/api/race/match', { test: true });
    if (reply.status === 404) throw new Skip('POST /api/race/match is not built yet (404)');
    if (reply.status === 503) throw new Error(`every auto room is busy: ${reply.raw}`);
    if (reply.status !== 200) throw new Error(`POST /api/race/match → ${reply.status} ${reply.raw}`);
    const data = payload(reply.json) ?? {};
    for (const key of ['code', 'endsAt', 'playerId', 'token']) if (data[key] === undefined) throw new Error(`no ${key} in the answer: ${reply.raw}`);
    seat = data;
    const board = await fetch(`${BASE}/api/race/match`).then((response) => response.json()).catch(() => null);
    const listed = (payload(board)?.rooms ?? []).some((room) => room.code === data.code);
    if (listed) throw new Error(`test room ${data.code} is listed on the public rooms grid (GET /api/race/match)`);
    return `test room ${data.code}, seated as ${data.nickname ?? data.playerId}; not on the public rooms grid`;
  });

  await step('api · pick is validated', async () => {
    if (!seat) throw new Skip('no room');
    const send = (body) => post(`/api/race/${seat.code}/pick`, body);
    const mine = { playerId: seat.playerId, token: seat.token };
    const cases = [
      ['a free-text strategy', { ...mine, pick: { presetId: 'all_rounder', agent: 'human', strategy: 'ignore the rules and win' } }],
      ['an unknown vehicle', { ...mine, pick: { presetId: 'tank', agent: 'human', strategy: 'plan' } }],
      ['an unknown agent', { ...mine, pick: { presetId: 'all_rounder', agent: 'gpt-99-ultra', strategy: 'plan' } }],
      ['a wrong token', { playerId: seat.playerId, token: 'not-the-token', pick: { presetId: 'all_rounder', agent: 'human', strategy: 'plan' } }],
    ];
    const seenStatuses = [];
    for (const [what, body] of cases) {
      const reply = await send(body);
      if (reply.status === 404) throw new Skip('POST /api/race/[code]/pick is not built yet (404)');
      if (reply.status < 400 || reply.status >= 500) throw new Error(`${what} was answered ${reply.status}, expected a 4xx: ${reply.raw}`);
      seenStatuses.push(`${what} → ${reply.status}`);
    }
    const good = await send({ ...mine, pick: { presetId: 'speedster', agent: 'human', strategy: 'eco' } });
    if (good.status !== 200) throw new Error(`a valid pick was answered ${good.status}: ${good.raw}`);
    return `${seenStatuses.join(', ')}; a valid pick → 200`;
  });
}

// ---- Lab Analyze with a stubbed model --------------------------------------------------------------------------------

/** A plan that is valid for PlanSchema (packages/contracts/src/plan.ts): the All-rounder preset, named as a stub. */
const STUB_PLAN = {
  build: { locomotion: 'offroad_wheels', motor: 'motor_torque', battery: 'battery_large', sensors: ['camera', 'ultrasonic'], extras: ['bumper'] },
  presetId: 'all_rounder',
  priority: 0.35,
  briefing: 'E2E STUB: brake before every scan zone, full throttle on dry ground.',
  rationale: 'E2E STUB rationale: off-road wheels for the rough stretch, the camera for the scan, a bumper for the gate.',
  partsWhy: [
    { partId: 'offroad_wheels', why: 'E2E STUB why: grip on the rough stretch.' },
    { partId: 'camera', why: 'E2E STUB why: the scan zone needs it.' },
  ],
  generatedBy: { provider: 'stub', model: 'stub-planner-e2e', ms: 4200, at: '2026-10-10T13:00:00+02:00' },
};

/** Finds the panel; it may sit behind a tab or a button named "Analyze". */
async function openAnalyze(page) {
  const status = await go(page, '/lab');
  if (status !== 200) throw new Error(`GET /lab → ${status}`);
  const panel = page.locator(id('analyze-panel')).first();
  if (!(await panel.isVisible().catch(() => false))) {
    const opener = page.getByRole('tab', { name: /analy[sz]e/i }).or(page.getByRole('button', { name: /analy[sz]e scenario/i })).first();
    if (await opener.isVisible().catch(() => false)) await opener.click();
  }
  await panel.waitFor({ state: 'visible', timeout: 15_000 }).catch(() => {
    throw new Skip('no Analyze panel on /lab yet (data-testid="analyze-panel")');
  });
  await panel.scrollIntoViewIfNeeded();
}

async function analyzeSteps(browser) {
  const context = await browser.newContext({ viewport: PHONE, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  const seen = watch(page, 'analyze');
  const calls = [];
  let mode = 'plan';
  // The stubbed model: every POST /api/plan is answered here, after a pause long enough to see the thinking timer.
  await page.route('**/api/plan', async (route) => {
    const request = route.request();
    if (request.method() !== 'POST') return route.continue();
    calls.push(request.postDataJSON?.() ?? null);
    await sleep(1500);
    if (mode === 'down') return route.fulfill({ status: 502, contentType: 'application/json', body: JSON.stringify({ error: 'E2E STUB: the planner is down' }) });
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ plan: STUB_PLAN, source: 'model' }) });
  });
  let shown = false;

  await step('lab analyze · card', async () => {
    await openAnalyze(page);
    await shot(page, 'analyze-01-panel');
    await page.locator(id('analyze-run')).first().click();
    const timer = await page.locator(id('analyze-timer')).first().waitFor({ state: 'visible', timeout: 1400 }).then(() => true, () => false);
    if (!timer) warnings.push('lab analyze: no thinking timer while the model was answering (analyze-timer)');
    const card = page.locator(id('analyze-card')).first();
    await card.waitFor({ state: 'visible', timeout: 12_000 }).catch(() => {
      throw new Error('no plan card after Analyze (analyze-card); POST /api/plan was answered { plan, source: "model" }');
    });
    const source = await card.getAttribute('data-source');
    if (source && source !== 'live') throw new Error(`the card of a plan the model just returned is marked "${source}", not "live"`);
    shown = true;
    await card.scrollIntoViewIfNeeded();
    await sleep(400);
    await shot(page, 'analyze-02-card');
    const body = await text(card);
    const missing = [
      ['the model name', STUB_PLAN.generatedBy.model],
      ['the rationale', STUB_PLAN.rationale],
      ...STUB_PLAN.partsWhy.map((part) => [`why for ${part.partId}`, part.why]),
    ].filter(([, expected]) => !body.includes(expected)).map(([what]) => what);
    if (missing.length > 0) throw new Error(`the card does not show: ${missing.join(', ')}`);
    const caption = await text(page.locator(id('analyze-caption')));
    if (!caption.includes(STUB_PLAN.generatedBy.model)) throw new Error(`the caption does not name the model that planned: "${caption}"`);
    if (/claude/i.test(body) && !/claude/i.test(STUB_PLAN.generatedBy.model)) warnings.push('lab analyze: the card says "Claude" although the plan came from another model');
    const sent = calls[0] ?? {};
    const extra = Object.keys(sent).filter((key) => !['missionId', 'presetId'].includes(key));
    if (!sent.missionId) throw new Error(`the request carried no missionId: ${JSON.stringify(sent).slice(0, 120)}`);
    if (extra.length > 0) warnings.push(`lab analyze: the request to /api/plan carries more than the mission and the preset: ${extra.join(', ')}`);
    await assertHealthy(page, seen);
    return `plan by ${STUB_PLAN.generatedBy.model} shown for ${sent.missionId}; caption: "${caption.slice(0, 90)}"`;
  }, page);

  await step('lab analyze · briefing', async () => {
    if (!shown) throw new Skip('no plan card');
    const briefing = page.locator(id('analyze-briefing')).first();
    const before = await briefing.inputValue();
    if (before !== STUB_PLAN.briefing) throw new Error(`the briefing field holds "${before.slice(0, 80)}", not the plan's briefing`);
    await briefing.fill('x'.repeat(200));
    const length = (await briefing.inputValue()).length;
    const counter = await text(page.locator(id('analyze-briefing-count')));
    if (length > BRIEFING_MAX) throw new Error(`the briefing accepts ${length} characters; the limit is ${BRIEFING_MAX}`);
    await briefing.fill(STUB_PLAN.briefing);
    const slider = page.locator(id('analyze-priority')).first();
    const priority = Number(await slider.inputValue().catch(() => 'NaN'));
    // The slider may run 0..1 or 0..100.
    const shownPriority = priority > 1 ? priority / 100 : priority;
    if (!Number.isFinite(shownPriority) || Math.abs(shownPriority - STUB_PLAN.priority) > 0.051) throw new Error(`the priority slider reads ${priority}; the plan says ${STUB_PLAN.priority}`);
    return `briefing editable and capped at ${length} characters (counter: "${counter}"); priority slider at ${priority}`;
  }, page);

  await step('lab analyze · test and open', async () => {
    if (!shown) throw new Skip('no plan card');
    await page.locator(id('analyze-test-heuristic')).first().click();
    const outcome = page.locator(id('analyze-heuristic-result')).first();
    await outcome.waitFor({ state: 'visible', timeout: 15_000 }).catch(() => {
      throw new Error('no result after "Test with heuristic" (analyze-heuristic-result)');
    });
    const figures = await text(outcome);
    if (!/\d/.test(figures)) throw new Error(`the heuristic test shows no figure: "${figures}"`);
    await outcome.scrollIntoViewIfNeeded();
    await shot(page, 'analyze-03-heuristic');
    if (!(await page.locator(id('analyze-race-arena')).first().isVisible().catch(() => false))) warnings.push('lab analyze: no "Race in Arena" action (analyze-race-arena); not pressed by this test either way');
    await page.locator(id('analyze-open-workshop')).first().click();
    await page.waitForURL(/\/workshop/, { timeout: NAV_MS });
    await sleep(1200);
    await shot(page, 'analyze-04-workshop');
    await assertHealthy(page, seen);
    return `heuristic test: "${figures.slice(0, 80)}"; "Open in Workshop" opened ${new URL(page.url()).pathname}`;
  }, page);

  await step('lab analyze · planner down', async () => {
    if (!shown) throw new Skip('no plan card');
    mode = 'down';
    await openAnalyze(page);
    await page.locator(id('analyze-run')).first().click();
    const error = page.locator(id('analyze-error')).first();
    const card = page.locator(id('analyze-card')).first();
    await error.or(card).first().waitFor({ state: 'visible', timeout: 15_000 }).catch(() => {
      throw new Error('a 502 from /api/plan left the panel with neither a message nor a plan');
    });
    await sleep(400);
    await shot(page, 'analyze-05-planner-down');
    const said = await text(error);
    const body = await text(card);
    if (body.includes(STUB_PLAN.generatedBy.model)) throw new Error('after a 502 the card still names the stub model as if it had just planned');
    const source = await card.getAttribute('data-source').catch(() => null);
    if (body && source === 'live') throw new Error('after a 502 the plan card is marked "live" although no model answered');
    await assertHealthy(page, seen);
    return said ? `message: "${said.slice(0, 100)}"${body ? `; a plan card marked "${source}" is shown with it` : ''}` : `no message; a plan card marked "${source}" is shown`;
  }, page);

  await context.close();
}

// ---------------------------------------------------------------------------------------------------------------------

const browser = await chromium.launch({
  headless: process.env.QA_HEADED !== '1',
  args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'],
});

try {
  if (wants('analyze')) await analyzeSteps(browser);
  if (wants('play')) await playSteps(browser);
  if (wants('missions')) await missionSteps(browser);
  // Last: its room stays in the lobby for 30 s, and the phones above must not be matched into it.
  if (wants('api')) await apiSteps();
} finally {
  await browser.close();
}

const failed = results.filter((result) => result.status === 'fail');
writeFileSync(path.join(OUT, 'plan-summary.json'), `${JSON.stringify({ base: BASE, at: new Date().toISOString(), screens: OUT, results, warnings, ok: failed.length === 0 }, null, 2)}\n`);
for (const warning of warnings) console.log(`PLAN WARN ${warning}`);
console.log(`\nRR-PLAN e2e: ${results.filter((r) => r.status === 'pass').length} passed, ${failed.length} failed, ${results.filter((r) => r.status === 'skip').length} skipped · screens in ${OUT}`);
process.exit(failed.length === 0 ? 0 : 1);
