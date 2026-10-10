#!/usr/bin/env node
// Load test for /play (RR-PLAN §6): N simulated phones match into auto rooms, pick, poll once a second and post a
// scripted result. Its rooms are test rooms: matched apart from real phones, absent from the /screen grid, and their
// runs reach no board and no episode log.
//
//   node scripts/loadtest-play.mjs [--base http://localhost:3000] [--clients 40] [--spread 5]
//   BASE_URL and CLIENTS work as environment variables too.
//
// Pass (exit 0): no 429 and no 5xx, every client reaches the results, p95 of the snapshot poll under 500 ms.
// A 503 from /api/race/match with `retryInS` is the matchmaker saying "every room is busy": the phone waits and
// retries, and it is counted apart, not as a failure. Fail: exit 1, with the reasons listed.
const args = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : fallback;
};
const BASE = String(arg('base', process.env.BASE_URL ?? 'http://localhost:3000')).replace(/\/$/, '');
const CLIENTS = Number(arg('clients', process.env.CLIENTS ?? 40));
const SPREAD_S = Number(arg('spread', 5));
const POLL_MS = 1000;
const GIVE_UP_MS = 6 * 60 * 1000;
const P95_LIMIT_MS = 500;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const stats = { polls: [], other: [], statuses: new Map(), busy: 0, errors: [] };
const PRESETS = ['speedster', 'mud_crawler', 'all_rounder', 'deep_diver'];
const STRATEGIES = ['plan', 'daredevil', 'careful', 'eco'];

async function call(kind, path, body) {
  const started = performance.now();
  let status = 0;
  let json = null;
  try {
    const response = await fetch(`${BASE}${path}`, body === undefined ? { cache: 'no-store' } : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    status = response.status;
    json = await response.json().catch(() => null);
  } catch (error) {
    stats.errors.push(`${kind} ${path}: ${error instanceof Error ? error.message : String(error)}`);
  }
  const ms = performance.now() - started;
  (kind === 'poll' ? stats.polls : stats.other).push(ms);
  stats.statuses.set(status, (stats.statuses.get(status) ?? 0) + 1);
  return { status, json };
}

async function phone(index) {
  await sleep(Math.random() * SPREAD_S * 1000);
  const deadline = Date.now() + GIVE_UP_MS;
  // 1. Match, waiting when every room is busy.
  let seat = null;
  while (!seat && Date.now() < deadline) {
    const { status, json } = await call('match', '/api/race/match', { test: true });
    if (status === 200 && json?.code) seat = json;
    else if (status === 503 && json?.retryInS) {
      stats.busy += 1;
      await sleep(Math.min(10, json.retryInS) * 1000);
    } else {
      await sleep(1000);
    }
  }
  if (!seat) return { index, reached: false, why: 'never matched' };
  // 2. Pick: three taps, the last one stands. Humans only, so nothing here calls a model.
  await sleep(500 + Math.random() * 2000);
  const pick = { presetId: PRESETS[index % PRESETS.length], agent: 'human', strategy: STRATEGIES[index % STRATEGIES.length] };
  await call('pick', `/api/race/${seat.code}/pick`, { playerId: seat.playerId, token: seat.token, pick });
  // 3. Poll once a second; drive a scripted run when the race is on; stop at the results.
  const finishAfterMs = 6000 + Math.random() * 8000;
  let racingSince = null;
  let posted = false;
  while (Date.now() < deadline) {
    const { status, json: snapshot } = await call('poll', `/api/race/${seat.code}`);
    if (status === 404) return { index, reached: posted, why: posted ? 'room removed after results' : 'room vanished', code: seat.code };
    if (status === 200 && snapshot) {
      if (snapshot.status === 'finished') return { index, reached: true, code: seat.code };
      if (snapshot.status === 'racing' && !posted) {
        racingSince ??= Date.now();
        const elapsed = Date.now() - racingSince;
        const done = elapsed >= finishAfterMs;
        await call('state', `/api/race/${seat.code}`, {
          action: 'state', playerId: seat.playerId, token: seat.token, raceNo: snapshot.raceNo,
          x: Math.min(70, (elapsed / 1000) * 2), v: done ? 0 : 2, damagePct: 0, batteryPct: Math.max(50, 100 - elapsed / 1000),
          lastAction: 'accelerate', done, finished: done, score: done ? 600 + (index % 100) : null,
        });
        posted = done;
      }
    }
    await sleep(POLL_MS);
  }
  return { index, reached: false, why: 'timed out', code: seat.code };
}

const percentile = (values, p) => {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
};

const started = Date.now();
console.log(`loadtest-play: ${CLIENTS} phones against ${BASE}, starts spread over ${SPREAD_S} s`);
const results = await Promise.all(Array.from({ length: CLIENTS }, (_, index) => phone(index)));
const reached = results.filter((result) => result.reached).length;
const rooms = new Set(results.map((result) => result.code).filter(Boolean)).size;
const bad = [...stats.statuses].filter(([status]) => status === 429 || status >= 500 || status === 0).filter(([status]) => status !== 503);
const busy503 = stats.statuses.get(503) ?? 0;
const unexplained503 = busy503 - stats.busy;
const p95 = percentile(stats.polls, 95);
const failures = [];
if (bad.length > 0) failures.push(`bad answers: ${bad.map(([status, count]) => `${count} × ${status === 0 ? 'no answer' : status}`).join(', ')}`);
if (unexplained503 > 0) failures.push(`${unexplained503} × 503 that was not the matchmaker's "busy"`);
if (reached < CLIENTS) failures.push(`${CLIENTS - reached} of ${CLIENTS} phones did not reach the results (${[...new Set(results.filter((r) => !r.reached).map((r) => r.why))].join(', ')})`);
if (p95 >= P95_LIMIT_MS) failures.push(`p95 poll ${p95.toFixed(0)} ms, limit ${P95_LIMIT_MS} ms`);

console.log(`  duration            ${((Date.now() - started) / 1000).toFixed(0)} s`);
console.log(`  rooms               ${rooms}`);
console.log(`  reached results     ${reached} of ${CLIENTS}`);
console.log(`  requests            ${stats.polls.length + stats.other.length} (${stats.polls.length} polls)`);
console.log(`  statuses            ${[...stats.statuses].sort((a, b) => a[0] - b[0]).map(([status, count]) => `${status}: ${count}`).join(' · ')}`);
console.log(`  matchmaker busy     ${stats.busy} (503 with retryInS, expected above ${8 * 8} phones at once)`);
console.log(`  poll ms             p50 ${percentile(stats.polls, 50).toFixed(0)} · p95 ${p95.toFixed(0)} · max ${Math.max(0, ...stats.polls).toFixed(0)}`);
console.log(`  other requests ms   p50 ${percentile(stats.other, 50).toFixed(0)} · p95 ${percentile(stats.other, 95).toFixed(0)}`);
if (stats.errors.length > 0) console.log(`  network errors      ${stats.errors.length}, first: ${stats.errors[0]}`);
console.log(failures.length === 0 ? 'PASS' : `FAIL\n  ${failures.join('\n  ')}`);
process.exit(failures.length === 0 ? 0 : 1);
