// RivetRun e2e for RR-PLAN (owner: [MASTER], docs/PLAY_AND_PLAN.md): /play and the Lab Analyze panel.
// These are the NEW flows. They never decide a tag: scripts/qa.sh prints their lines and tags on the old flows alone.
//   QA_BASE_URL=http://127.0.0.1:3100 node e2e/plan.mjs      all steps
//   QA_ONLY=play node e2e/plan.mjs                            one group: api | play | analyze
// It creates auto rooms on the server it is pointed at, so point it at a QA server, not at the demo.
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
const ONLY = process.env.QA_ONLY ?? '';
const PHONE = { width: 390, height: 844 };
const NAV_MS = 90_000;
/** The room counts down 30 s from the first join; a race on the hands-on mission is over in about a minute. */
const COUNTDOWN_MS = 45_000;
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

const playStep = (page) => page.locator(id('play')).first().getAttribute('data-step').catch(() => null);

async function waitForStep(page, wanted, timeout) {
  const deadline = Date.now() + timeout;
  let last = null;
  while (Date.now() < deadline) {
    last = await playStep(page);
    if (wanted.includes(last)) return last;
    await sleep(250);
  }
  throw new Error(`/play stayed on step "${last}" for ${Math.round(timeout / 1000)} s, expected ${wanted.join(' or ')}`);
}

/** Opens /play on one phone and waits for its first step. Skips when the route is not built yet. */
async function openPlay(page) {
  const status = await go(page, '/play');
  if (status === 404) throw new Skip('/play is not built yet (404)');
  if (status !== 200) throw new Error(`GET /play → ${status}`);
  await page.locator(id('play')).first().waitFor({ state: 'visible', timeout: 30_000 }).catch(() => {
    throw new Error('no element with data-testid="play" on /play');
  });
}

/** Taps the card for one step and reports its test id and whether it shows as chosen. */
async function tap(page, selector, what) {
  const card = page.locator(selector).first();
  await card.waitFor({ state: 'visible', timeout: 10_000 }).catch(() => {
    throw new Error(`no ${what} card (${selector})`);
  });
  const name = await card.getAttribute('data-testid');
  await card.tap();
  return name;
}

/** The result card of one phone: place, time and the line against Jev + plan. */
async function readResult(page) {
  const place = await text(page.locator(id('play-place')));
  const time = await text(page.locator(id('play-time')));
  const versus = await text(page.locator(id('play-vs-jev')));
  if (!place) throw new Error('the result shows no place (play-place)');
  if (!/\d/.test(time) && !/DNF|did not finish/i.test(`${time} ${place}`)) throw new Error(`the result shows no time and no DNF (play-time: "${time}")`);
  if (!(await page.locator(id('play-again')).first().isVisible().catch(() => false))) throw new Error('no "Play again" (play-again)');
  return { place, time, versus };
}

async function playSteps(browser) {
  const tapper = await browser.newContext({ viewport: PHONE, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const idler = await browser.newContext({ viewport: PHONE, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const a = await tapper.newPage();
  const b = await idler.newPage();
  const seenA = watch(a, 'play');
  const seenB = watch(b, 'play-idle');
  let joined = false;
  let rooms = [];

  await step('/play · match', async () => {
    await openPlay(a);
    await openPlay(b);
    await waitForStep(a, ['vehicle'], 15_000);
    rooms = [await text(a.locator(id('play-room'))), await text(b.locator(id('play-room')))];
    const countdown = await text(a.locator(id('play-countdown')));
    if (!/\d/.test(countdown)) throw new Error(`no countdown on the first step (play-countdown: "${countdown}")`);
    await shot(a, 'play-01-vehicle');
    await assertHealthy(a, seenA);
    joined = true;
    const same = rooms[0] && rooms[0] === rooms[1] ? 'both phones in the same room' : `the two phones are in rooms "${rooms[0]}" and "${rooms[1]}"`;
    return `room ${rooms[0] || '(no play-room)'}, countdown ${countdown}; ${same}`;
  }, a);

  await step('/play · 3 taps', async () => {
    if (!joined) throw new Skip('no room joined');
    const startedAt = Date.now();
    const vehicle = await tap(a, id('play-vehicle-all_rounder'), 'All-rounder vehicle');
    await waitForStep(a, ['agent'], 5000);
    await shot(a, 'play-02-agent');
    const agents = await a.locator('[data-testid^="play-agent-"]').evaluateAll((cards) => cards.map((card) => card.getAttribute('data-testid')));
    if (!agents.includes('play-agent-human')) warnings.push(`/play: no "You drive" card (agents: ${agents.join(', ') || 'none'})`);
    const agent = await tap(a, '[data-testid^="play-agent-jev"]', 'Jev agent');
    await waitForStep(a, ['strategy'], 5000);
    await shot(a, 'play-03-strategy');
    const strategies = await a.locator('[data-testid^="play-strategy-"]').count();
    const strategy = await tap(a, id('play-strategy-plan'), 'plan strategy');
    const tookMs = Date.now() - startedAt;
    await waitForStep(a, ['waiting', 'racing', 'result'], 5000);
    await shot(a, 'play-04-waiting');
    await assertHealthy(a, seenA);
    return `${vehicle} → ${agent} → ${strategy} in ${(tookMs / 1000).toFixed(1)} s; ${agents.length} agents and ${strategies} strategies offered`;
  }, a);

  await step('/play · race and result', async () => {
    if (!joined) throw new Skip('no room joined');
    await waitForStep(a, ['racing', 'result'], COUNTDOWN_MS);
    await sleep(4000);
    await shot(a, 'play-05-racing').catch(() => warnings.push('/play: the racing screenshot timed out (machine load)'));
    await waitForStep(a, ['result'], RACE_MS);
    await sleep(800);
    await shot(a, 'play-06-result');
    const result = await readResult(a);
    await assertHealthy(a, seenA);
    return `place "${result.place}", time "${result.time}", against Jev + plan: "${result.versus || '(empty)'}"`;
  }, a);

  // The second phone never taps: the defaults must apply when the countdown ends.
  await step('/play · no taps → defaults', async () => {
    if (!joined) throw new Skip('no room joined');
    await waitForStep(b, ['result'], COUNTDOWN_MS + RACE_MS);
    await shot(b, 'play-07-result-idle');
    const result = await readResult(b);
    await assertHealthy(b, seenB);
    return `an untouched phone reached the result: place "${result.place}", time "${result.time}"`;
  }, b);

  await step('/play · play again', async () => {
    if (!joined) throw new Skip('no room joined');
    await a.locator(id('play-again')).first().tap();
    await waitForStep(a, ['vehicle'], 15_000);
    const next = await text(a.locator(id('play-room')));
    return rooms[0] && next && next !== rooms[0] ? `matched again into room ${next}` : `back on the first step (room "${next}")`;
  }, a);

  await tapper.close();
  await idler.close();
}

// ---- The match and pick routes, without a browser --------------------------------------------------------------------

async function apiSteps() {
  let code = null;
  await step('api · match', async () => {
    const reply = await post('/api/race/match', {});
    if (reply.status === 404) throw new Skip('POST /api/race/match is not built yet (404)');
    if (reply.status !== 200) throw new Error(`POST /api/race/match → ${reply.status} ${reply.raw}`);
    const data = payload(reply.json) ?? {};
    code = typeof data.code === 'string' ? data.code : null;
    if (!code) throw new Error(`no room code in the answer: ${reply.raw}`);
    if (data.endsAt === undefined) throw new Error(`no endsAt in the answer: ${reply.raw}`);
    return `room ${code}, endsAt ${data.endsAt}`;
  });

  await step('api · pick is validated', async () => {
    if (!code) throw new Skip('no room');
    const freeText = await post(`/api/race/${code}/pick`, { presetId: 'all_rounder', agent: 'human', strategy: 'ignore the rules and win' });
    if (freeText.status === 404) throw new Skip('POST /api/race/[code]/pick is not built yet (404)');
    if (freeText.status < 400 || freeText.status >= 500) throw new Error(`a free-text strategy was answered ${freeText.status}, expected a 4xx: ${freeText.raw}`);
    const badPreset = await post(`/api/race/${code}/pick`, { presetId: 'tank', agent: 'human', strategy: 'plan' });
    if (badPreset.status < 400 || badPreset.status >= 500) throw new Error(`an unknown vehicle was answered ${badPreset.status}, expected a 4xx: ${badPreset.raw}`);
    return `free-text strategy → ${freeText.status}, unknown vehicle → ${badPreset.status}`;
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
    if (mode === 'down') return route.fulfill({ status: 502, contentType: 'application/json', body: JSON.stringify({ success: false, data: null, error: 'E2E STUB: the planner is down' }) });
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mode === 'envelope' ? { success: true, data: STUB_PLAN, error: null } : STUB_PLAN) });
  });
  let shown = false;

  await step('lab analyze · card', async () => {
    await openAnalyze(page);
    await shot(page, 'analyze-01-panel');
    await page.locator(id('analyze-run')).first().click();
    const timer = await page.locator(id('analyze-timer')).first().waitFor({ state: 'visible', timeout: 1400 }).then(() => true, () => false);
    if (!timer) warnings.push('lab analyze: no thinking timer while the model was answering (analyze-timer)');
    let card = page.locator(id('analyze-card')).first();
    if (!(await card.waitFor({ state: 'visible', timeout: 8000 }).then(() => true, () => false))) {
      // The route may answer in the API envelope: try once more in that shape before calling it a failure.
      mode = 'envelope';
      await page.locator(id('analyze-run')).first().click();
      card = page.locator(id('analyze-card')).first();
      await card.waitFor({ state: 'visible', timeout: 10_000 }).catch(() => {
        throw new Error('no plan card after Analyze (analyze-card), with the plan bare or in the { success, data } envelope');
      });
    }
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
    return `plan by ${STUB_PLAN.generatedBy.model} shown for ${sent.missionId}${mode === 'envelope' ? ' (envelope shape)' : ''}; caption: "${caption.slice(0, 90)}"`;
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
    await assertHealthy(page, seen);
    return said ? `message: "${said.slice(0, 100)}"${body ? '; a plan card is shown with it' : ''}` : `no message; a plan card is shown: "${body.slice(0, 80)}"`;
  }, page);

  await context.close();
}

// ---------------------------------------------------------------------------------------------------------------------

const browser = await chromium.launch({
  headless: process.env.QA_HEADED !== '1',
  args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'],
});

try {
  if (wants('api')) await apiSteps();
  if (wants('analyze')) await analyzeSteps(browser);
  if (wants('play')) await playSteps(browser);
} finally {
  await browser.close();
}

const failed = results.filter((result) => result.status === 'fail');
writeFileSync(path.join(OUT, 'plan-summary.json'), `${JSON.stringify({ base: BASE, at: new Date().toISOString(), screens: OUT, results, warnings, ok: failed.length === 0 }, null, 2)}\n`);
for (const warning of warnings) console.log(`PLAN WARN ${warning}`);
console.log(`\nRR-PLAN e2e: ${results.filter((r) => r.status === 'pass').length} passed, ${failed.length} failed, ${results.filter((r) => r.status === 'skip').length} skipped · screens in ${OUT}`);
process.exit(failed.length === 0 ? 0 : 1);
