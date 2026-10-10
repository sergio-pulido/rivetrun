// RivetRun e2e smoke (owner: [MASTER], docs/OVERNIGHT.md).
// Headless Chromium against QA_BASE_URL. scripts/qa.sh points it at a production build of the commit under test;
// on its own it defaults to the dev server. It starts no server and writes nothing outside e2e/screens.
//   node e2e/smoke.mjs                 all steps
//   QA_ONLY=drive node e2e/smoke.mjs   one step group: pages | drive | jev | m5 | lab | missions | fallback | race | arena | desktop
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

/** Runs one step; a throw is a failure, a Skip is a skip. Later steps still run. A failure leaves a screenshot of `page`. */
async function step(name, body, page) {
  const startedAt = Date.now();
  try {
    const detail = await body();
    record(name, 'pass', detail ?? '', startedAt);
    return true;
  } catch (error) {
    if (error instanceof Skip) {
      record(name, 'skip', error.message, startedAt);
      return false;
    }
    const file = `fail-${name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}`;
    const saved = page ? await shot(page, file).then(() => ` · see ${file}.png`, () => '') : '';
    record(name, 'fail', `${String(error?.message ?? error).split('\n')[0].slice(0, 300)}${saved}`, startedAt);
    return false;
  }
}

const wants = (group) => ONLY === '' || ONLY.split(',').includes(group);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Collects uncaught page errors and console errors per page; uncaught errors fail the step that checks them. */
function watch(page, label) {
  const seen = { pageErrors: [], consoleErrors: [], checked: 0 };
  page.on('pageerror', (error) => seen.pageErrors.push(String(error.message).slice(0, 240)));
  page.on('console', (message) => {
    // Failed requests are reported with their URL by the response listener below; the browser's own line has none.
    if (message.type() === 'error' && !/Failed to load resource/.test(message.text())) seen.consoleErrors.push(message.text().slice(0, 240));
  });
  page.on('response', (response) => {
    const url = response.url();
    if (!url.startsWith(BASE)) return;
    const status = response.status();
    // A 404 on /scenarios or on the Brief one past the last mission is a step probing for it, not a broken link.
    const probe = url.endsWith('/scenarios') || /\/brief\/M\d+$/.test(url);
    // The Jev-down context fails /api/decide and /api/ghost on purpose.
    if (label === 'jev-down' && /\/api\/(decide|ghost)/.test(url)) return;
    if (status >= 500 || (status === 404 && !probe)) warnings.push(`${label}: HTTP ${status} ${url.slice(BASE.length)}`);
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
  // Only errors since the last check: one early error must not fail every later step.
  const fresh = seen.pageErrors.slice(seen.checked);
  seen.checked = seen.pageErrors.length;
  if (fresh.length > 0) throw new Error(`uncaught: ${fresh[0]}`);
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
      scanPct: Number(text.match(/HOLD STILL · (\d+) %/)?.[1] ?? 0),
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
  const log = { scanned: false, missed: false, sawZone: false, sawPad: false, sawScanning: false, maxScanPct: 0, brakedAtM: null, creeps: 0, reloads: 0, repressed: 0, shots: [] };
  let phase = 'approach';
  let lastX = null;
  let stillSince = null;
  let deadline = Date.now() + 150_000;
  // The dev server reloads the page when a session saves a file the run imports. The new page has no key held,
  // so the script lets go of everything and drives the restarted run from the start line.
  let reloaded = false;
  const onLoad = () => {
    reloaded = true;
  };
  page.on('load', onLoad);

  while (Date.now() < deadline) {
    if (new URL(page.url()).pathname === '/result') break;
    if (reloaded) {
      reloaded = false;
      log.reloads += 1;
      for (const key of [...held]) await release(key);
      if (!log.scanned && !log.missed) phase = 'approach';
      lastX = null;
      stillSince = null;
      if (log.reloads <= 2) deadline = Date.now() + 150_000;
      await sleep(500);
      continue;
    }
    const hud = await readHud(page).catch(() => null);
    if (!hud) {
      await sleep(100);
      continue;
    }
    if (hud.scanned) log.scanned = true;
    if (hud.missed) log.missed = true;
    if (hud.zoneDistM !== null) log.sawZone = true;
    if (hud.onPad) log.sawPad = true;
    if (hud.scanning) {
      log.sawScanning = true;
      log.maxScanPct = Math.max(log.maxScanPct, hud.scanPct);
    }
    const moving = lastX !== null && hud.xPct !== null && Math.abs(hud.xPct - lastX) > 0.02;
    if (moving || stillSince === null) stillSince = Date.now();
    lastX = hud.xPct;
    const stoppedMs = Date.now() - stillSince;

    if ((log.scanned || log.missed) && phase !== 'finish') phase = 'finish';
    // Throttle held and nothing moving for 4 s: the page lost the key (focus, a soft refresh). Press it again.
    if ((phase === 'approach' || phase === 'finish') && stoppedMs > 4000 && held.has('ArrowUp')) {
      log.repressed += 1;
      await release('ArrowUp');
      stillSince = Date.now();
    }

    if (phase === 'approach') {
      await press('ArrowUp');
      // Brake about a metre out: the robot does ~2 m/s here and the pad accepts a stop within 0.8 m of its centre.
      if (hud.onPad || (hud.zoneDistM !== null && hud.zoneDistM <= 1.1)) {
        log.brakedAtM = hud.zoneDistM;
        await release('ArrowUp');
        await press('ArrowDown');
        phase = 'stop';
      }
    } else if (phase === 'stop') {
      if (hud.scanning) {
        phase = 'scan';
        // The robot stands still for the 1.5 s hold: the one moment a slow screenshot costs nothing.
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
      // Brake stays held until the HUD says SCANNED. The toast is brief and the screenshot above may outlast it:
      // a scan that was seen running and ended with the zone chip gone and no SCAN MISSED is a completed scan.
      if (!hud.scanning && !hud.onPad && hud.zoneDistM === null && !hud.missed) log.scanned = true;
      else if (!hud.scanning && hud.onPad && stoppedMs > 4000) phase = 'stop';
    } else {
      await release('ArrowDown');
      await press('ArrowUp');
    }
    await sleep(60);
  }
  page.off('load', onLoad);
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
    }, page);

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
    }, page);

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
    }, page);
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
    }, page);

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
      if (drive.reloads > 0) warnings.push(`run: the dev server reloaded the page ${drive.reloads} time(s) mid-run; the script restarted the run`);
      return `Finished${time ? ` in ${time} s` : ''}`;
    }, page);

    await step('drive M1 · scan', async () => {
      if (!drive) throw new Error('no run to judge');
      if (!drive.sawZone && !drive.sawPad) throw new Error('the HUD never announced the scan zone');
      if (!drive.scanned) throw new Error(`scan not completed (missed=${drive.missed}, scanning seen=${drive.sawScanning} up to ${drive.maxScanPct} %, braked at ${drive.brakedAtM} m, creeps=${drive.creeps})`);
      return `braked at ${drive.brakedAtM} m from the pad, ${drive.creeps} creep(s), SCANNED${drive.reloads ? ` · ${drive.reloads} dev reload(s) during the run` : ''}`;
    }, page);
  }

  if (wants('drive')) {
    // The run just driven (throttle, brake, a stop, throttle again) goes to the server, which replays its input log
    // (OVN-BRAIN-7) and refuses a run that does not reproduce. An honest run must be accepted.
    await step('submit M1 run', async () => {
      if (new URL(page.url()).pathname !== '/result') throw new Skip('no Result page to submit from');
      const field = page.locator('#nickname');
      await field.scrollIntoViewIfNeeded();
      await field.fill('qa_master');
      const answered = page.waitForResponse((response) => response.url().endsWith('/api/runs') && response.request().method() === 'POST', { timeout: 20_000 });
      await page.getByRole('button', { name: /^submit$/i }).click();
      const response = await answered;
      const body = await response.text().catch(() => '');
      await sleep(800);
      await shot(page, 'phone-07a-submitted');
      if (response.status() >= 300) throw new Error(`POST /api/runs → ${response.status()}: ${body.replace(/\s+/g, ' ').slice(0, 200)}`);
      return `accepted (${response.status()})`;
    }, page);

    // OVN-UI-4: after a finished run the Brief shows the personal best for this mission and robot.
    await step('personal best', async () => {
      await go(page, '/brief/M1');
      await visibleText(page, 'Garage Test');
      const best = page.getByText(/your best/i).first();
      await best.waitFor({ state: 'visible', timeout: 8000 });
      await best.scrollIntoViewIfNeeded();
      await sleep(500);
      await shot(page, 'phone-07b-brief-best');
      const line = (await page.locator('body').innerText()).match(/your best[^\n]*(\n[^\n]*)?/i)?.[0].replace(/\s+/g, ' ') ?? '';
      return line.slice(0, 90);
    }, page);
  }

  // ---- The other half of the 60-second path: Jev drives M1 from Play Now to the Result -----------------------------
  if (wants('jev')) {
    await step('jev M1 · finish', async () => {
      await go(page, '/');
      await page.getByRole('button', { name: 'Jev drives' }).click();
      await visibleText(page, '· Jev drives ·');
      await page.getByRole('link', { name: /PLAY NOW/ }).click();
      const coachStart = page.locator('button.rr-btn-primary').first();
      const coached = await coachStart.waitFor({ state: 'visible', timeout: 4000 }).then(
        () => true,
        () => false,
      );
      if (coached) {
        await shot(page, 'phone-10-coach-jev');
        await coachStart.click();
      }
      await page.waitForURL('**/run/M1', { timeout: NAV_MS });
      let fallback = false;
      let midRun = false;
      const deadline = Date.now() + 150_000;
      while (Date.now() < deadline && new URL(page.url()).pathname !== '/result') {
        const text = await page.locator('body').innerText().catch(() => '');
        if (/FALLBACK/.test(text)) fallback = true;
        if (!midRun && /00:(0[6-9]|1\d)\.\d/.test(text)) {
          midRun = true;
          await shot(page, 'phone-11-run-jev');
        }
        await sleep(500);
      }
      await page.waitForURL('**/result', { timeout: 10_000 });
      const headline = (await page.locator('h1').first().innerText()).trim();
      await sleep(2000);
      await shot(page, 'phone-12-result-jev');
      await assertHealthy(page, seen);
      if (!/finished/i.test(headline)) throw new Error(`result headline is "${headline}"`);
      if (fallback) warnings.push('jev run: FALLBACK was shown on the HUD (Jev slow or unavailable for at least one decision)');
      const time = (await page.locator('body').innerText()).match(/(\d+\.\d)\s*s/)?.[1];
      // Back to Drive mode for the steps that follow.
      await go(page, '/');
      await page.getByRole('button', { name: 'You drive' }).click();
      return `${coached ? 'coach marks shown, ' : ''}Jev finished${time ? ` in ${time} s` : ''}${fallback ? ', with FALLBACK decisions' : ', no FALLBACK'}`;
    }, page);
  }

  // ---- Q12: a first-timer on the Room Challenge. Full throttle all the way; do only what the stuck prompt says. ------
  if (wants('m5')) {
    await step('drive M5 · stuck prompt', async () => {
      await go(page, '/brief/M5');
      await page.getByRole('link', { name: /^Drive$/ }).first().click();
      const coachStart = page.locator('button.rr-btn-primary').first();
      if (await coachStart.waitFor({ state: 'visible', timeout: 2500 }).then(() => true, () => false)) await coachStart.click();
      await page.waitForURL('**/run/M5', { timeout: NAV_MS });
      await page.locator('[aria-label^="M5 "]').waitFor({ state: 'visible', timeout: NAV_MS });
      await page.keyboard.down('ArrowUp');
      const prompts = new Set();
      let taps = 0;
      let lastTap = 0;
      let shotTaken = false;
      const deadline = Date.now() + 170_000;
      while (Date.now() < deadline && new URL(page.url()).pathname !== '/result') {
        const alerts = await page.locator('[role="alert"]').allInnerTexts().catch(() => []);
        const text = alerts.join(' ').replace(/\s+/g, ' ');
        const prompt = text.match(/STUCK IN \d+ s[^a-z]*?(TAP CLIMB|EASE OFF THE THROTTLE|HOLD WINCH|GIVE IT THROTTLE|THIS BUILD CANNOT PASS HERE)/);
        if (prompt) {
          prompts.add(prompt[1]);
          if (!shotTaken) {
            shotTaken = true;
            await shot(page, 'phone-13-m5-stuck-prompt');
          }
          if (prompt[1] === 'TAP CLIMB' && Date.now() - lastTap > 2500) {
            lastTap = Date.now();
            taps += 1;
            await page.keyboard.press('Space');
          }
        }
        await sleep(120);
      }
      await page.keyboard.up('ArrowUp');
      await page.waitForURL('**/result', { timeout: 10_000 });
      const headline = (await page.locator('h1').first().innerText()).trim();
      await sleep(1500);
      await shot(page, 'phone-14-result-m5');
      await assertHealthy(page, seen);
      const seenPrompts = [...prompts].join(', ') || 'none';
      if (!/finished/i.test(headline)) throw new Error(`result headline is "${headline}" (prompts seen: ${seenPrompts}; climb taps: ${taps})`);
      const time = (await page.locator('body').innerText()).match(/(\d+\.\d)\s*s/)?.[1];
      return `Finished${time ? ` in ${time} s` : ''} at full throttle; prompts seen: ${seenPrompts}; climb taps: ${taps}`;
    }, page);
  }

  if (wants('lab')) {
    await step('/lab', async () => {
      const status = await go(page, '/lab');
      if (status !== 200) throw new Error(`GET /lab → ${status}`);
      await visibleText(page, 'Brain Arena');
      await sleep(800);
      await shot(page, 'phone-08-lab');
      const labTab = page.getByRole('tab', { name: /Lab Missions/i }).or(page.getByRole('button', { name: /Lab Missions/i })).first();
      let tab = 'no Lab Missions tab';
      if (await labTab.isVisible().catch(() => false)) {
        await labTab.click();
        await sleep(800);
        await shot(page, 'phone-08b-lab-missions');
        tab = /grid simulation/i.test(await page.locator('body').innerText()) ? 'Lab Missions tab says "grid simulation"' : 'Lab Missions tab does NOT say "grid simulation"';
      }
      await assertHealthy(page, seen);
      return `Brain Arena visible; ${tab}`;
    }, page);

    // One Lab Mission start to finish: the Maze, driven by [LAB]'s key sequence (the maze does not depend on the seed).
    await step('lab mission · maze', async () => {
      const status = await go(page, '/scenarios');
      if (status === 404) throw new Skip('/scenarios is not there yet (OVN-LAB-3)');
      if (status !== 200) throw new Error(`GET /scenarios → ${status}`);
      const card = page.locator('[data-testid="scenario-maze"]');
      await card.waitFor({ state: 'visible', timeout: 20_000 });
      await sleep(800);
      await shot(page, 'phone-09-scenarios');
      const honesty = await page.locator('[data-testid="scenario-honesty"]').first().innerText().catch(() => '');
      if (!/grid/i.test(honesty)) throw new Error(`the picker does not say Lab Missions use a grid simulation (found: "${honesty.slice(0, 80)}")`);
      await card.click();
      await page.waitForURL('**/scenarios/maze', { timeout: NAV_MS });
      const start = page.locator('[data-testid="scenario-start"]');
      await start.waitFor({ state: 'visible', timeout: 20_000 });
      await sleep(500);
      await shot(page, 'phone-09b-maze-brief');
      await start.click();
      // The board mounts a moment after Start; keys sent before the pad is there are lost.
      await page.locator('[data-testid="pad-up"]').waitFor({ state: 'visible', timeout: 20_000 });
      await sleep(300);
      const keys = { U: 'ArrowUp', R: 'ArrowRight', D: 'ArrowDown', L: 'ArrowLeft' };
      for (const move of 'DDRRDDRRDDLLDDLLDDRRDDLLDDRRRRRRUULLUUUURRUURRDDRRDDDDDDRRR') {
        await page.keyboard.press(keys[move]);
        await sleep(25);
      }
      await sleep(6000);
      await shot(page, 'phone-09c-maze-run');
      const result = page.locator('[data-testid="scenario-result"]');
      await result.waitFor({ state: 'visible', timeout: 75_000 });
      await sleep(1200);
      await shot(page, 'phone-09d-maze-result');
      const heading = (await page.locator('[data-testid="scenario-result-heading"]').innerText()).trim();
      const score = Number.parseInt((await page.locator('[data-testid="scenario-score"]').innerText()).replace(/[^0-9]/g, ''), 10);
      await assertHealthy(page, seen);
      if (!/scenario complete/i.test(heading)) throw new Error(`result heading is "${heading}" (score ${score})`);
      if (!(score > 600)) throw new Error(`score ${score}, expected above 600`);
      return `"${heading}", score ${score}; the picker says: "${honesty.replace(/\s+/g, ' ').slice(0, 70)}"`;
    }, page);
  }
  // ---- Every mission opens: its Brief, and its run scene for a few seconds (terrain, weather, lights) ---------------
  if (wants('missions')) {
    const missions = [];
    for (let n = 1; n <= 20; n += 1) {
      const status = await go(page, `/brief/M${n}`).catch(() => 0);
      if (status !== 200) break;
      missions.push(`M${n}`);
    }
    await step(`briefs M1–M${missions.length}`, async () => {
      if (missions.length < 7) throw new Error(`only ${missions.length} mission Brief(s) answer 200`);
      const bad = [];
      for (const id of missions) {
        const before = seen.pageErrors.length;
        await go(page, `/brief/${id}`);
        await page.getByRole('link', { name: /^(Drive|Deploy)$/ }).first().waitFor({ state: 'visible', timeout: 20_000 }).catch(() => bad.push(`${id}: no Drive button`));
        await sleep(700);
        await shot(page, `brief-${id}`);
        const overlay = await devOverlayError(page);
        if (overlay) bad.push(`${id}: ${overlay}`);
        if (seen.pageErrors.length > before) bad.push(`${id}: ${seen.pageErrors[before]}`);
      }
      seen.checked = seen.pageErrors.length;
      if (bad.length > 0) throw new Error(bad.join('; '));
      return `${missions.length} Briefs render`;
    }, page);

    await step(`run scenes M2–M${missions.length}`, async () => {
      const bad = [];
      // Jev mode: the robot drives itself, so each scene is seen moving (weather, lights, terrain) with a few live
      // decisions instead of a whole precomputed ghost per mission. M1's scene is covered by the Drive run above.
      await go(page, '/');
      await page.getByRole('button', { name: 'Jev drives' }).click();
      await sleep(400);
      for (const id of missions.slice(1)) {
        const before = seen.pageErrors.length;
        await go(page, `/run/${id}`);
        const strip = await page.locator(`[aria-label^="${id} "]`).waitFor({ state: 'visible', timeout: NAV_MS }).then(
          () => true,
          () => false,
        );
        if (!strip) bad.push(`${id}: the HUD never appeared`);
        // Long enough for the first frames and a few seconds of driving.
        await sleep(7000);
        await shot(page, `run-${id}`);
        const text = await page.locator('body').innerText().catch(() => '');
        if (/3D VIEW UNAVAILABLE|could not start/i.test(text)) bad.push(`${id}: ${text.match(/3D VIEW UNAVAILABLE[^\n]*|The run could not start[^\n]*/i)?.[0]}`);
        const overlay = await devOverlayError(page);
        if (overlay) bad.push(`${id}: ${overlay}`);
        if (seen.pageErrors.length > before) bad.push(`${id}: ${seen.pageErrors[before]}`);
      }
      // Leave the last run page before the next step so its timers stop.
      await go(page, '/');
      seen.checked = seen.pageErrors.length;
      if (bad.length > 0) throw new Error(bad.join('; '));
      return `${missions.length - 1} run scenes load without an error`;
    }, page);
  }

  if (seen.consoleErrors.length > 0) warnings.push(`phone: ${seen.consoleErrors.length} console error(s), first: ${seen.consoleErrors[0]}`);
  await phone.close();

  // ---- Jev unavailable: the heuristic drives, the HUD says FALLBACK, the run finishes (docs/DEMO_PLAN.md) -----------
  // [BRAIN]'s switch (bb08914): a cookie makes /api/decide and /api/ghost fail for this browser context only.
  if (wants('fallback')) {
    const down = await browser.newContext({ viewport: PHONE, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    await down.addCookies([{ name: 'rr_jev_fault', value: 'fail', url: BASE }]);
    const downPage = await down.newPage();
    const downSeen = watch(downPage, 'jev-down');
    await step('jev down · fallback', async () => {
      await go(downPage, '/');
      await downPage.getByRole('button', { name: 'Jev drives' }).click();
      await visibleText(downPage, '· Jev drives ·');
      await downPage.getByRole('link', { name: /PLAY NOW/ }).click();
      const coachStart = downPage.locator('button.rr-btn-primary').first();
      if (await coachStart.waitFor({ state: 'visible', timeout: 4000 }).then(() => true, () => false)) await coachStart.click();
      await downPage.waitForURL('**/run/M1', { timeout: NAV_MS });
      let fallback = false;
      let midRun = false;
      const deadline = Date.now() + 150_000;
      while (Date.now() < deadline && new URL(downPage.url()).pathname !== '/result') {
        const text = await downPage.locator('body').innerText().catch(() => '');
        if (/FALLBACK/.test(text)) fallback = true;
        if (!midRun && fallback && /00:(0[6-9]|1\d)\.\d/.test(text)) {
          midRun = true;
          await shot(downPage, 'phone-15-run-fallback');
        }
        await sleep(500);
      }
      await downPage.waitForURL('**/result', { timeout: 10_000 });
      const headline = (await downPage.locator('h1').first().innerText()).trim();
      await sleep(2000);
      await shot(downPage, 'phone-16-result-fallback');
      const body = await downPage.locator('body').innerText();
      if (downSeen.pageErrors.length > 0) throw new Error(`uncaught: ${downSeen.pageErrors[0]}`);
      if (!/finished/i.test(headline)) throw new Error(`with Jev down the result headline is "${headline}"`);
      if (!fallback) throw new Error('with the Jev fault cookie set the HUD never said FALLBACK (a production server honours the cookie only with RIVETRUN_JEV_FAULT_SWITCH=1)');
      const said = body.match(/[^\n]*fallback[^\n]*/i)?.[0] ?? 'the Result does not mention the fallback';
      return `Finished with FALLBACK on the HUD; Result: "${said.trim().slice(0, 80)}"`;
    }, downPage);
    await down.close();
  }

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
    }, screen);

    await step('room race · lobby', async () => {
      await screen.getByRole('button', { name: 'Start a Room Race' }).click();
      await screen.waitForURL(/\/screen\?room=/, { timeout: NAV_MS });
      // Nobody on the grid yet: the attract loop replays the track.
      await sleep(6000);
      await shot(screen, 'screen-01b-attract');
      await screen.getByRole('radio', { name: /^M1\b/ }).first().click();
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
    }, screen);

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
    }, screen);
  }

  // ---- The live Brain Arena (OVN-BRAIN-6): /screen?room=CODE&arena=1, Jev against the fixed rules. No paid model. ----
  if (wants('arena')) {
    await step('arena race · Jev vs rules', async () => {
      await go(screen, '/screen');
      await screen.getByRole('button', { name: 'Start a Room Race' }).click();
      await screen.waitForURL(/\/screen\?room=/, { timeout: NAV_MS });
      await go(screen, `${new URL(screen.url()).pathname}${new URL(screen.url()).search}&arena=1`);
      const jev = screen.getByRole('button', { name: /^\+ Jev$/ });
      if (!(await jev.waitFor({ state: 'visible', timeout: 15_000 }).then(() => true, () => false))) throw new Skip('no arena host bar on this build (OVN-BRAIN-6 not in it)');
      await screen.getByRole('radio', { name: /^M1\b/ }).first().click();
      await jev.click();
      await visibleText(screen, '1 in the room');
      await screen.getByRole('button', { name: /^\+ Fixed rules$/ }).click();
      await visibleText(screen, '2 in the room');
      await shot(screen, 'screen-06-arena-lobby');
      await screen.getByRole('button', { name: 'Open build phase' }).click();
      const startNow = screen.getByRole('button', { name: 'Start now' });
      await startNow.waitFor({ state: 'visible', timeout: 20_000 });
      await startNow.click();
      await visibleText(screen, 'BRAIN ARENA · LIVE', 30_000);
      await sleep(7000);
      await shot(screen, 'screen-07-arena-live');
      await visibleText(screen, 'BRAIN ARENA · FINISH', 180_000);
      await sleep(1500);
      await shot(screen, 'screen-08-arena-finish');
      await assertHealthy(screen, screenSeen, { sideways: false });
      const text = await screen.locator('body').innerText();
      const times = text.match(/\b\d{1,2}\.\d s\b/g) ?? [];
      if (times.length === 0 && !/DNF/i.test(text)) throw new Error('FINISH shown but no time or DNF on the board');
      return `Jev and the fixed rules raced M1; times on the board: ${times.slice(0, 4).join(', ') || 'DNF only'}`;
    }, screen);
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
      const fresh = screenSeen.pageErrors.slice(screenSeen.checked);
      if (fresh.length > 0) throw new Error(`uncaught: ${fresh[0]}`);
      return 'Home, Workshop, Brief M1, /lab';
    }, screen);
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
