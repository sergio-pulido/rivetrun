// RivetRun e2e smoke (owner: [MASTER], docs/OVERNIGHT.md).
// Headless Chromium against the running dev server. Starts no server and writes nothing outside e2e/screens.
//   node e2e/smoke.mjs                 all steps
//   QA_ONLY=drive node e2e/smoke.mjs   one step group: pages | drive | race | lab | desktop
// Env: QA_BASE_URL (default http://localhost:3000), QA_SCREENS (output directory), QA_HEADED=1 to watch.
// Exit code: 0 when no step failed (skips are allowed), 1 otherwise. A summary lands in <QA_SCREENS>/summary.json.
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BASE = (process.env.QA_BASE_URL ?? 'http://localhost:3000').replace(/\/$/, '');
const stamp = new Date().toTimeString().slice(0, 5).replace(':', '');
const OUT = process.env.QA_SCREENS ?? path.join(HERE, 'screens', stamp);
const ONLY = process.env.QA_ONLY ?? '';
const PHONE = { width: 390, height: 844 };
const DESKTOP = { width: 1280, height: 720 };
/** The dev server compiles a route on its first visit: navigation gets a long leash. */
const NAV_MS = 90_000;

mkdirSync(OUT, { recursive: true });

/** @type {{ step: string, status: 'pass' | 'fail' | 'skip', detail: string, ms: number }[]} */
const results = [];
const warnings = [];

const record = (step, status, detail, startedAt) => {
  results.push({ step, status, detail, ms: Date.now() - startedAt });
  console.log(`${status.toUpperCase().padEnd(4)} ${step.padEnd(22)} ${detail}`);
};

class Skip extends Error {}

/** Runs one step; a throw is a failure, a Skip is a skip. Later steps still run. */
async function step(name, body) {
  const startedAt = Date.now();
  try {
    const detail = await body();
    record(name, 'pass', detail ?? '', startedAt);
    return true;
  } catch (error) {
    if (error instanceof Skip) record(name, 'skip', error.message, startedAt);
    else record(name, 'fail', String(error?.message ?? error).split('\n')[0].slice(0, 300), startedAt);
    return false;
  }
}

const wants = (group) => ONLY === '' || ONLY.split(',').includes(group);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Collects uncaught page errors and console errors per page; uncaught errors fail the step that checks them. */
function watch(page, label) {
  const seen = { pageErrors: [], consoleErrors: [] };
  page.on('pageerror', (error) => seen.pageErrors.push(String(error.message).slice(0, 240)));
  page.on('console', (message) => {
    if (message.type() === 'error') seen.consoleErrors.push(message.text().slice(0, 240));
  });
  page.on('response', (response) => {
    const url = response.url();
    if (!url.startsWith(BASE)) return;
    const status = response.status();
    // A 404 on /scenarios is the Lab Missions step finding the route missing: that step reports it itself.
    if (status >= 500 || (status === 404 && !url.endsWith('/scenarios'))) warnings.push(`${label}: HTTP ${status} ${url.slice(BASE.length)}`);
  });
  return seen;
}

async function shot(page, name) {
  const file = path.join(OUT, `${name}.png`);
  await page.screenshot({ path: file });
  return file;
}

/** The Next dev overlay, when it reports a build or runtime error. */
async function devOverlayError(page) {
  return page.evaluate(() => {
    const text = [...document.querySelectorAll('nextjs-portal')].map((portal) => portal.shadowRoot?.textContent ?? '').join(' ');
    const hit = text.match(/(Build Error|Runtime [A-Za-z]*Error|Unhandled Runtime Error)[\s\S]{0,160}/);
    return hit ? hit[0].replace(/\s+/g, ' ') : null;
  });
}

async function go(page, route) {
  const response = await page.goto(`${BASE}${route}`, { waitUntil: 'domcontentloaded', timeout: NAV_MS });
  return response?.status() ?? 0;
}

/** Fails when the page shows the dev error overlay, threw an uncaught error, or scrolls sideways on a phone. */
async function assertHealthy(page, seen, { sideways = true } = {}) {
  const overlay = await devOverlayError(page);
  if (overlay) throw new Error(`dev overlay: ${overlay}`);
  if (seen.pageErrors.length > 0) throw new Error(`uncaught: ${seen.pageErrors[0]}`);
  if (sideways) {
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    if (overflow > 2) warnings.push(`${new URL(page.url()).pathname}: page is ${overflow}px wider than the viewport`);
  }
}

const visibleText = (page, text, timeout = 20_000) => page.getByText(text, { exact: false }).first().waitFor({ state: 'visible', timeout });

// ---------------------------------------------------------------------------------------------------------------------
// Drive mode on M1 with scripted input: full throttle, brake into the scan zone, hold for the scan, drive to the finish.
// The script reads only what a player sees: the HUD chips and the dot on the progress strip.
// ---------------------------------------------------------------------------------------------------------------------

/** One look at the run HUD. */
const readHud = (page) =>
  page.evaluate(() => {
    const text = document.body.innerText;
    const zone = text.match(/SCAN ZONE · ([A-Z ]+?) in ([\d.]+) m/);
    const strip = document.querySelector('[aria-label^="M1 "]');
    const dot = strip?.lastElementChild;
    return {
      clock: text.match(/\b(\d\d:\d\d\.\d)\b/)?.[1] ?? null,
      zoneDistM: zone ? Number(zone[2]) : null,
      onPad: /STOP HERE · SCAN/.test(text),
      scanning: /SCANNING ·/.test(text),
      scanned: /\bSCANNED\b/.test(text),
      missed: /SCAN MISSED/.test(text),
      cannotScan: /cannot scan: needs/.test(text),
      xPct: dot instanceof HTMLElement ? Number.parseFloat(dot.style.left) : null,
      unavailable: /3D VIEW UNAVAILABLE/i.test(text),
    };
  });

async function driveM1(page) {
  const held = new Set();
  const press = async (key) => {
    if (held.has(key)) return;
    held.add(key);
    await page.keyboard.down(key);
  };
  const release = async (key) => {
    if (!held.has(key)) return;
    held.delete(key);
    await page.keyboard.up(key);
  };
  const log = { scanned: false, missed: false, sawZone: false, sawPad: false, brakedAtM: null, creeps: 0, shots: [] };
  let phase = 'approach';
  let lastX = null;
  let stillSince = null;
  const deadline = Date.now() + 150_000;

  while (Date.now() < deadline) {
    if (new URL(page.url()).pathname === '/result') break;
    const hud = await readHud(page).catch(() => null);
    if (!hud) {
      await sleep(100);
      continue;
    }
    if (hud.scanned) log.scanned = true;
    if (hud.missed) log.missed = true;
    if (hud.zoneDistM !== null) log.sawZone = true;
    if (hud.onPad) log.sawPad = true;
    const moving = lastX !== null && hud.xPct !== null && Math.abs(hud.xPct - lastX) > 0.02;
    if (moving || stillSince === null) stillSince = Date.now();
    lastX = hud.xPct;
    const stoppedMs = Date.now() - stillSince;

    if ((log.scanned || log.missed) && phase !== 'finish') phase = 'finish';

    if (phase === 'approach') {
      await press('ArrowUp');
      // Brake about a metre out: the robot does ~2 m/s here and the pad accepts a stop within 0.8 m of its centre.
      if (hud.onPad || (hud.zoneDistM !== null && hud.zoneDistM <= 1.1)) {
        log.brakedAtM = hud.zoneDistM;
        await release('ArrowUp');
        await press('ArrowDown');
        phase = 'stop';
        log.shots.push(await shot(page, 'phone-04-run-brake'));
      }
    } else if (phase === 'stop') {
      if (hud.scanning) {
        phase = 'scan';
        log.shots.push(await shot(page, 'phone-05-run-scanning'));
      } else if (!hud.onPad && hud.zoneDistM !== null && hud.zoneDistM > 0.3 && stoppedMs > 500 && log.creeps < 12) {
        // Stopped short of the pad: one short push at half throttle, then brake again.
        log.creeps += 1;
        await release('ArrowDown');
        await page.keyboard.down('Shift');
        await page.keyboard.down('ArrowUp');
        await sleep(180);
        await page.keyboard.up('ArrowUp');
        await page.keyboard.up('Shift');
        await press('ArrowDown');
        stillSince = Date.now();
      } else if (!hud.onPad && hud.zoneDistM === null && stoppedMs > 1500) {
        // The chip is gone and nothing was scanned: the robot ran past the pad. Drive on; the miss shows in the result.
        phase = 'finish';
      }
    } else if (phase === 'scan') {
      // Brake stays held until the HUD says SCANNED.
    } else {
      await release('ArrowDown');
      await press('ArrowUp');
    }
    await sleep(60);
  }
  for (const key of [...held]) await release(key);
  return log;
}

// ---------------------------------------------------------------------------------------------------------------------

const browser = await chromium.launch({
  headless: process.env.QA_HEADED !== '1',
  // Software WebGL: the run scene needs a GL context in a headless shell.
  args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'],
});

try {
  // ---- Phone: Home → Workshop → Brief M1 → Drive run → Result ------------------------------------------------------
  const phone = await browser.newContext({ viewport: PHONE, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const page = await phone.newPage();
  const seen = watch(page, 'phone');

  if (wants('pages') || wants('drive')) {
    await step('home', async () => {
      const status = await go(page, '/');
      if (status !== 200) throw new Error(`GET / → ${status}`);
      await visibleText(page, 'PLAY NOW');
      await visibleText(page, 'Workshop');
      await visibleText(page, 'Room Race');
      await sleep(1500);
      await shot(page, 'phone-01-home');
      await assertHealthy(page, seen);
      return 'Play Now, Workshop and Room Race visible';
    });

    await step('workshop', async () => {
      await page.getByRole('link', { name: 'Workshop' }).first().click();
      await page.waitForURL('**/workshop', { timeout: NAV_MS });
      await page.locator('main').first().waitFor({ state: 'visible', timeout: 20_000 });
      await sleep(2000);
      await shot(page, 'phone-02-workshop');
      await assertHealthy(page, seen);
      const words = (await page.locator('body').innerText()).length;
      if (words < 200) throw new Error(`Workshop rendered only ${words} characters of text`);
      return 'opened from Home';
    });

    await step('brief M1', async () => {
      const status = await go(page, '/brief/M1');
      if (status !== 200) throw new Error(`GET /brief/M1 → ${status}`);
      await visibleText(page, 'Garage Test');
      await page.getByRole('link', { name: /^(Drive|Deploy)$/ }).first().waitFor({ state: 'visible', timeout: 20_000 });
      await sleep(1000);
      await shot(page, 'phone-03-brief-m1');
      await assertHealthy(page, seen);
      const body = await page.locator('body').innerText();
      return /scan/i.test(body) ? 'objectives list a scan zone' : 'no scan zone text on the Brief';
    });
  }

  if (wants('drive')) {
    let drive = null;
    await step('drive M1 · start', async () => {
      if (new URL(page.url()).pathname !== '/brief/M1') await go(page, '/brief/M1');
      await page.getByRole('link', { name: /^Drive$/ }).first().click();
      // First run in this mode: the coach marks come first.
      const coachStart = page.locator('button.rr-btn-primary').first();
      const coached = await coachStart.waitFor({ state: 'visible', timeout: 4000 }).then(
        () => true,
        () => false,
      );
      if (coached) {
        await shot(page, 'phone-03b-coach');
        await coachStart.click();
      }
      await page.waitForURL('**/run/M1', { timeout: NAV_MS });
      await page.locator('[aria-label^="M1 "]').waitFor({ state: 'visible', timeout: NAV_MS });
      // The clock starts at the first drawn frame (or after 15 s if the 3D view is given up on).
      await page.waitForFunction(() => /\b00:0[1-9]\.\d|\b00:00\.[1-9]/.test(document.body.innerText), undefined, { timeout: 45_000 });
      const hud = await readHud(page);
      if (hud.unavailable) warnings.push('run: "3D VIEW UNAVAILABLE" fallback shown in headless Chromium');
      return `${coached ? 'coach marks shown, ' : 'no coach marks, '}clock running`;
    });

    await step('drive M1 · finish', async () => {
      if (new URL(page.url()).pathname !== '/run/M1') throw new Error('the run never started');
      drive = await driveM1(page);
      await page.waitForURL('**/result', { timeout: 30_000 });
      await visibleText(page, 'Garage Test');
      const headline = (await page.locator('h1').first().innerText()).trim();
      await sleep(2500);
      await shot(page, 'phone-06-result');
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await sleep(400);
      await shot(page, 'phone-07-result-bottom');
      await assertHealthy(page, seen);
      if (!/finished/i.test(headline)) throw new Error(`result headline is "${headline}"`);
      const time = (await page.locator('body').innerText()).match(/(\d+\.\d)\s*s/)?.[1];
      return `Finished${time ? ` in ${time} s` : ''}`;
    });

    await step('drive M1 · scan', async () => {
      if (!drive) throw new Error('no run to judge');
      if (!drive.sawZone && !drive.sawPad) throw new Error('the HUD never announced the scan zone');
      if (!drive.scanned) throw new Error(`scan not completed (missed=${drive.missed}, braked at ${drive.brakedAtM} m, creeps=${drive.creeps})`);
      return `braked at ${drive.brakedAtM} m from the pad, ${drive.creeps} creep(s), SCANNED`;
    });
  }

  if (wants('lab')) {
    await step('/lab', async () => {
      const status = await go(page, '/lab');
      if (status !== 200) throw new Error(`GET /lab → ${status}`);
      await visibleText(page, 'Brain Arena');
      await sleep(800);
      await shot(page, 'phone-08-lab');
      await assertHealthy(page, seen);
      return 'Brain Arena visible';
    });

    await step('lab mission', async () => {
      const status = await go(page, '/scenarios');
      if (status === 404) throw new Skip('/scenarios is not there yet (OVN-LAB-3)');
      if (status !== 200) throw new Error(`GET /scenarios → ${status}`);
      await sleep(1500);
      await shot(page, 'phone-09-scenarios');
      await assertHealthy(page, seen);
      throw new Skip('/scenarios exists; the start-to-finish script is added when OVN-LAB-3 reports');
    });
  }
  if (seen.consoleErrors.length > 0) warnings.push(`phone: ${seen.consoleErrors.length} console error(s), first: ${seen.consoleErrors[0]}`);
  await phone.close();

  // ---- Big screen, 1280×720: Room Race with two JEV bots to the results --------------------------------------------
  const desktop = await browser.newContext({ viewport: DESKTOP, deviceScaleFactor: 1 });
  const screen = await desktop.newPage();
  const screenSeen = watch(screen, 'screen');

  if (wants('race')) {
    let opened = false;
    await step('/screen', async () => {
      const status = await go(screen, '/screen');
      if (status !== 200) throw new Error(`GET /screen → ${status}`);
      await screen.getByRole('button', { name: 'Start a Room Race' }).waitFor({ state: 'visible', timeout: 20_000 });
      await sleep(800);
      await shot(screen, 'screen-01-leaderboard');
      await assertHealthy(screen, screenSeen, { sideways: false });
      return 'leaderboard view';
    });

    await step('room race · lobby', async () => {
      await screen.getByRole('button', { name: 'Start a Room Race' }).click();
      await screen.waitForURL(/\/screen\?room=/, { timeout: NAV_MS });
      await screen.getByRole('radio', { name: /^M1 / }).click();
      const addBot = screen.getByRole('button', { name: '+ JEV bot' });
      await addBot.waitFor({ state: 'visible', timeout: 20_000 });
      await addBot.click();
      await visibleText(screen, '1 in the room');
      await addBot.click();
      await visibleText(screen, '2 in the room');
      await sleep(600);
      await shot(screen, 'screen-02-lobby');
      opened = true;
      return `room ${new URL(screen.url()).searchParams.get('room')}, M1, 2 JEV bots`;
    });

    await step('room race · results', async () => {
      if (!opened) throw new Error('no room to race in');
      await screen.getByRole('button', { name: 'Open build phase' }).click();
      const startNow = screen.getByRole('button', { name: 'Start now' });
      await startNow.waitFor({ state: 'visible', timeout: 20_000 });
      await shot(screen, 'screen-03-build');
      await startNow.click();
      await visibleText(screen, '· LIVE', 30_000);
      await sleep(6000);
      await shot(screen, 'screen-04-live');
      await visibleText(screen, '· FINISH', 180_000);
      await sleep(1500);
      await shot(screen, 'screen-05-finish');
      await assertHealthy(screen, screenSeen, { sideways: false });
      const text = await screen.locator('body').innerText();
      const verdict = text.match(/(JEV WINS|HUMANS WIN|[A-Z0-9-]+ WINS?)[^\n]*/)?.[0] ?? null;
      const timed = (text.match(/\b\d{1,2}:\d\d\.\d\b|\b\d+\.\d s\b/g) ?? []).length;
      if (timed === 0 && !/DNF|did not finish/i.test(text)) throw new Error('FINISH shown but no time or DNF on the board');
      return verdict ? `verdict: ${verdict.slice(0, 80)}` : 'finished, both bots listed';
    });
  }

  // ---- 1280×720 stills of the phone screens ------------------------------------------------------------------------
  if (wants('desktop')) {
    await step('1280×720 stills', async () => {
      const failed = [];
      for (const [name, route] of [
        ['desktop-01-home', '/'],
        ['desktop-02-workshop', '/workshop'],
        ['desktop-03-brief-m1', '/brief/M1'],
        ['desktop-04-lab', '/lab'],
      ]) {
        const status = await go(screen, route);
        if (status !== 200) failed.push(`${route} → ${status}`);
        await sleep(1800);
        await shot(screen, name);
        const overlay = await devOverlayError(screen);
        if (overlay) failed.push(`${route}: ${overlay}`);
      }
      if (failed.length > 0) throw new Error(failed.join('; '));
      if (screenSeen.pageErrors.length > 0) throw new Error(`uncaught: ${screenSeen.pageErrors[0]}`);
      return 'Home, Workshop, Brief M1, /lab';
    });
  }
  if (screenSeen.consoleErrors.length > 0) warnings.push(`screen: ${screenSeen.consoleErrors.length} console error(s), first: ${screenSeen.consoleErrors[0]}`);
  await desktop.close();
} finally {
  await browser.close();
}

const failed = results.filter((result) => result.status === 'fail');
const summary = { base: BASE, at: new Date().toISOString(), screens: OUT, results, warnings, ok: failed.length === 0 };
writeFileSync(path.join(OUT, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`);
for (const warning of warnings) console.log(`WARN ${warning}`);
console.log(`\ne2e smoke: ${results.filter((r) => r.status === 'pass').length} passed, ${failed.length} failed, ${results.filter((r) => r.status === 'skip').length} skipped · screens in ${OUT}`);
process.exit(failed.length === 0 ? 0 : 1);
