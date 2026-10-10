// Live Arena rehearsal: N races per mission with the four demo bots (Jev, GPT-6 Luna, DeepSeek Flash, GPT-6.1 Sol),
// driven through the big screen page in headless Chromium. Prints finishing order, times, each brain's median answer,
// late and unanswered decisions, and what the race cost. Paid models are called: about 4 US cents a race.
//   BASE=http://localhost:3001 node scripts/arena-rehearsal.mjs <out-dir> [M1,M2,M4] [races per mission]
import { chromium } from '../e2e/node_modules/playwright-core/index.mjs';
import { writeFileSync } from 'node:fs';
const BASE = process.env.BASE ?? 'http://localhost:3001'; const OUT = process.argv[2]; const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const missions = (process.argv[3] ?? 'M1,M2,M4').split(','); const rounds = Number(process.argv[4] ?? 3);
const api = async (path, body) => { for (let i = 0; i < 6; i++) { try { const r = await fetch(`${BASE}${path}`, body ? { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) } : undefined); return await r.json().catch(() => ({})); } catch { await sleep(1500); } } return {}; };
const LABELS = ['+ Jev', '+ GPT-6 Luna', '+ DeepSeek Flash', '+ GPT-6.1 Sol (reasoning)'];
const browser = await chromium.launch({ headless: true });
const rows = [];
for (const mission of missions) for (let round = 1; round <= rounds; round++) {
  const spentBefore = (await api('/api/arena/decide')).spentUsd;
  const { code } = await api('/api/race', { missionId: mission });
  const screen = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = []; screen.on('pageerror', (e) => errors.push(String(e).slice(0, 120)));
  const statuses = {}; screen.on('response', (r) => { const m = /arena\/decide\?model=([^&]+)/.exec(r.url()); if (m && r.status() !== 200) { const k = `${m[1]} ${r.status()}`; statuses[k] = (statuses[k] ?? 0) + 1; } });
  await screen.goto(`${BASE}/screen?room=${code}&arena=1`, { waitUntil: 'domcontentloaded', timeout: 90000 });
  for (const label of LABELS) {
    await screen.getByRole('button', { name: label, exact: true }).waitFor({ timeout: 60000 });
    for (let attempt = 0; attempt < 6; attempt++) {
      const before = (await api(`/api/race/${code}`)).players.length;
      await screen.getByRole('button', { name: label, exact: true }).evaluate((el) => el.click()).catch(() => {});
      await sleep(800);
      if ((await api(`/api/race/${code}`)).players.length > before) break;
    }
  }
  const lobby = await api(`/api/race/${code}`);
  if (lobby.players.length !== LABELS.length) console.log('  lobby has', lobby.players.map((p) => p.nickname).join(', '), '| screen says:', (await screen.locator('body').innerText()).replace(/\s+/g, ' ').match(/(Could not|At most|already|Checking)[^.]*\.?/)?.[0] ?? '');
  // The host's two presses, sent as the page sends them (the dev overlay badge covers part of the bar in headless).
  await api(`/api/race/${code}`, { action: 'start' }); await sleep(600);
  await api(`/api/race/${code}`, { action: 'start' });
  let snap; const t0 = Date.now();
  while (Date.now() - t0 < 200000) { snap = await api(`/api/race/${code}`); if (snap.status === 'finished') break; await sleep(400); }
  await sleep(1500);
  if (round === 1) await screen.screenshot({ path: `${OUT}/${mission}-finish.png` });
  const spent = (await api('/api/arena/decide')).spentUsd - spentBefore;
  const ranked = [...snap.players].sort((a, b) => (a.finished ? 0 : 1) - (b.finished ? 0 : 1) || (a.finished && b.finished ? a.raceMs - b.raceMs : b.x - a.x));
  const line = ranked.map((p, i) => `${i + 1}. ${p.nickname.replace(' (reasoning)', '*')} ${p.finished ? (p.raceMs / 1000).toFixed(1) + ' s' : 'DNF ' + p.dnfReason}${p.penaltyMs ? ' (+10 s scan)' : ''} [med ${p.medianLatencyMs ?? '-'} ms, late ${p.lateDecisions ?? '-'}, unanswered ${p.missedDecisions ?? '-'}]`).join(' · ');
  console.log(`${mission} race ${round}: ${line} · cost $${spent.toFixed(4)}${Object.keys(statuses).length ? ' · non-200: ' + JSON.stringify(statuses) : ''}${errors.length ? ' · page errors ' + errors.length : ''}`);
  rows.push({ mission, round, cost: spent, players: ranked.map((p, i) => ({ place: i + 1, name: p.nickname, model: p.model, finished: p.finished, raceS: p.finished ? p.raceMs / 1000 : null, penaltyS: p.penaltyMs / 1000, median: p.medianLatencyMs, late: p.lateDecisions, missed: p.missedDecisions, dnf: p.dnfReason })) });
  await screen.close();
}
writeFileSync(`${OUT}/rehearsal.json`, JSON.stringify(rows, null, 1));
await browser.close();
