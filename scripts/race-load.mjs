// Room Race load test: N scripted bots in one room, each with its own SSE stream, posting state at 5 Hz
// for a full race. Reports server CPU / memory, POST latency, SSE latency and dropped players.
//   node scripts/race-load.mjs            (BASE=http://localhost:3001 BOTS=30 MISSION=M5)
import { execFileSync } from 'node:child_process';

const BASE = process.env.BASE ?? 'http://localhost:3001';
const BOTS = Number(process.env.BOTS ?? 30);
const MISSION = process.env.MISSION ?? 'M5';
const POST_MS = 200;
/** Track length used for the synthetic progress; the server does not validate x. */
const TRACK_M = Number(process.env.TRACK_M ?? 70);
const BUILD = { locomotion: 'offroad_wheels', motor: 'motor_torque', battery: 'battery_large', sensors: ['camera', 'ultrasonic'], extras: ['bumper'] };
const ACTIONS = ['cruise', 'accelerate', 'slow_down', 'climb_mode'];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const percentile = (values, p) => {
  if (values.length === 0) return NaN;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)];
};
const stats = (values) => `p50 ${percentile(values, 50).toFixed(0)} ms · p95 ${percentile(values, 95).toFixed(0)} ms · max ${Math.max(...values).toFixed(0)} ms (n=${values.length})`;

async function post(code, body) {
  const started = performance.now();
  const response = await fetch(`${BASE}/api/race/${code}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const json = await response.json().catch(() => null);
  return { ok: response.ok, json, ms: performance.now() - started };
}

/** One SSE client. Calls onSnapshot(snapshot, receivedAtEpochMs) per event. */
async function stream(code, signal, onSnapshot) {
  const response = await fetch(`${BASE}/api/race/${code}/events`, { signal });
  const decoder = new TextDecoder();
  let buffer = '';
  for await (const chunk of response.body) {
    const receivedAt = Date.now();
    buffer += decoder.decode(chunk, { stream: true });
    let end;
    while ((end = buffer.indexOf('\n\n')) >= 0) {
      const frame = buffer.slice(0, end);
      buffer = buffer.slice(end + 2);
      if (frame.startsWith('data: ')) onSnapshot(JSON.parse(frame.slice(6)), receivedAt);
    }
  }
}

function serverPid() {
  const port = new URL(BASE).port;
  return execFileSync('lsof', [`-tiTCP:${port}`, '-sTCP:LISTEN']).toString().trim().split('\n')[0];
}

const created = await fetch(`${BASE}/api/race`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ missionId: MISSION }) }).then((r) => r.json());
const code = created.code;
const pid = serverPid();
console.log(`Room ${code} on ${BASE} (server pid ${pid}), ${BOTS} bots, mission ${MISSION}`);

// Server CPU and memory, sampled once a second with ps (CPU % is of one core).
const cpu = [];
const rss = [];
const sampler = setInterval(() => {
  const [c, r] = execFileSync('ps', ['-o', '%cpu=,rss=', '-p', pid]).toString().trim().split(/\s+/).map(Number);
  cpu.push(c);
  rss.push(r / 1024);
}, 1000);

const abort = new AbortController();
const deliveryMs = []; // snapshot.serverNow → receipt, every client, during the race
const eventsPerClient = new Array(BOTS + 1).fill(0);
const endToEndMs = []; // bot POST sent → that x visible on the observer's stream
const sentAt = new Map(); // `${playerId}:${x}` → epoch ms
let last = created;

const bots = [];
for (let i = 0; i < BOTS; i++) {
  const joined = await post(code, { action: 'join', nickname: `bot_${String(i + 1).padStart(2, '0')}`, build: BUILD, briefing: i % 3 === 0 ? 'Speed is everything. Take risks.' : undefined });
  if (!joined.ok) throw new Error(`join ${i} failed: ${JSON.stringify(joined.json)}`);
  bots.push({ ...joined.json, x: 0, speed: 1.5 + Math.random() * 0.9, done: false });
}
console.log(`${bots.length} bots joined`);

const clients = [];
for (let c = 0; c <= BOTS; c++) {
  clients.push(
    stream(code, abort.signal, (snapshot, receivedAt) => {
      if (snapshot.status === 'racing') {
        eventsPerClient[c] += 1;
        deliveryMs.push(receivedAt - snapshot.serverNow);
      }
      if (c === BOTS) {
        // The last client is the observer (the big screen).
        last = snapshot;
        for (const player of snapshot.players) {
          const key = `${player.id}:${player.x}`;
          const at = sentAt.get(key);
          if (at !== undefined) {
            endToEndMs.push(receivedAt - at);
            sentAt.delete(key);
          }
        }
      }
    }).catch((error) => {
      if (!abort.signal.aborted) console.error(`stream ${c} died: ${error.message}`);
    }),
  );
}
await sleep(500);

await post(code, { action: 'start', missionId: MISSION });
while (last.status !== 'racing') await sleep(20);
const raceStarted = performance.now();
const cpuFrom = cpu.length;
console.log('racing…');

const postMs = [];
let postFailures = 0;
await Promise.all(
  bots.map(async (bot, index) => {
    await sleep((index * POST_MS) / BOTS); // phones are not in phase with each other
    while (!bot.done) {
      bot.x = Math.min(TRACK_M, Math.round((bot.x + bot.speed * (POST_MS / 1000) * (0.7 + Math.random() * 0.6)) * 1000) / 1000);
      bot.done = bot.x >= TRACK_M;
      sentAt.set(`${bot.playerId}:${bot.x}`, Date.now());
      const tick = performance.now();
      try {
        const result = await post(code, {
          action: 'state', playerId: bot.playerId, token: bot.token, raceNo: last.raceNo, x: bot.x, v: bot.speed,
          damagePct: Math.min(99, bot.x / 4), batteryPct: Math.max(1, 100 - bot.x / 2),
          lastAction: ACTIONS[Math.floor(bot.x / 5) % ACTIONS.length], lastActionP: 0.6 + (Math.floor(bot.x) % 35) / 100,
          thinking: Math.random() < 0.1, done: bot.done, finished: bot.done, score: bot.done ? 600 : null,
        });
        postMs.push(result.ms);
        if (!result.ok) postFailures += 1;
      } catch {
        postFailures += 1;
      }
      await sleep(Math.max(0, POST_MS - (performance.now() - tick)));
    }
  }),
);
const raceS = (performance.now() - raceStarted) / 1000;
await sleep(1500);
clearInterval(sampler);
abort.abort();
await Promise.allSettled(clients);

const final = await fetch(`${BASE}/api/race/${code}`).then((r) => r.json());
const finished = final.players.filter((p) => p.finished).length;
const dropped = final.players.filter((p) => p.dnfReason === 'timeout').map((p) => p.nickname);
const raceCpu = cpu.slice(cpuFrom);
const mean = (values) => values.reduce((sum, v) => sum + v, 0) / Math.max(1, values.length);
const eventRates = eventsPerClient.map((n) => n / raceS);

console.log(`\n=== Room Race load test — ${BOTS} bots, ${raceS.toFixed(1)} s race, ${new Date().toISOString()} ===`);
console.log(`Room status at the end: ${final.status} · players ${final.players.length} · finished ${finished} · dropped (silent DNF) ${dropped.length}${dropped.length ? `: ${dropped.join(', ')}` : ''}`);
console.log(`State POSTs: ${postMs.length} sent (${(postMs.length / raceS).toFixed(0)}/s) · failures ${postFailures} · round trip ${stats(postMs)}`);
console.log(`SSE clients: ${BOTS + 1} · events per client per second: min ${Math.min(...eventRates).toFixed(1)} · mean ${mean(eventRates).toFixed(1)} · max ${Math.max(...eventRates).toFixed(1)}`);
console.log(`SSE delivery (server snapshot → client receipt): ${stats(deliveryMs)}`);
console.log(`End to end (bot POST sent → visible on the observer stream): ${stats(endToEndMs)}`);
console.log(`Server CPU during the race (% of one core, 1 s samples): mean ${mean(raceCpu).toFixed(0)} % · peak ${Math.max(...raceCpu).toFixed(0)} %`);
console.log(`Server memory (RSS): peak ${Math.max(...rss).toFixed(0)} MB`);
