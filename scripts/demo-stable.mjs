// Stable demo: build and serve the last COMMITTED main from its own git worktree (../rivetrun-demo),
// so nothing a session is still editing in this checkout can reach the demo. See docs/DEMO_PLAN.md.
//   pnpm demo:stable                 build committed main, serve on 0.0.0.0:3001
//   pnpm demo:stable -- --ref <ref>  build and serve that git ref instead (a tag, branch or commit), e.g.
//                                    --ref "$(git tag -l 'demo-good-*' | sort | tail -1)" for the last tag QA passed
//   pnpm demo:stable -- --tunnel     also open the Cloudflare quick tunnel first and bake its URL into the build
//   pnpm demo:stable -- --build-only build and stop (checks that committed main builds)
// NEXT_PUBLIC_SITE_URL, when set, is used as the public URL instead of a tunnel. DEMO_PORT overrides 3001.
import { execFileSync, spawn } from 'node:child_process';
import { copyFileSync, existsSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = fileURLToPath(new URL('..', import.meta.url));
const demo = path.resolve(repo, '..', 'rivetrun-demo');
const web = path.join(demo, 'apps', 'web');
const port = String(process.env.DEMO_PORT ?? 3001);
const args = process.argv.slice(2);
const flags = new Set(args);
/** The git ref to build: --ref <ref>, default main. */
const refIndex = args.indexOf('--ref');
const ref = refIndex >= 0 ? args[refIndex + 1] : 'main';
if (!ref || ref.startsWith('--')) {
  console.error('--ref needs a git ref, e.g. --ref demo-good-0730');
  process.exit(1);
}
const URL_PATTERN = /https:\/\/(?!api\.)[a-z0-9-]+\.trycloudflare\.com/;

const git = (args, cwd = repo) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
const run = (command, args, cwd, env = process.env) => execFileSync(command, args, { cwd, env, stdio: 'inherit' });

/** Checks the worktree out at the ref's commit (detached: main itself stays checked out here). */
function syncWorktree() {
  let sha;
  try {
    // ^{commit} resolves an annotated tag to the commit it points at.
    sha = git(['rev-parse', '--verify', '--quiet', `${ref}^{commit}`]);
  } catch {
    console.error(`"${ref}" is not a commit, tag or branch in this repository.`);
    process.exit(1);
  }
  if (!existsSync(path.join(demo, '.git'))) {
    git(['worktree', 'add', '--detach', demo, sha]);
  } else {
    // The demo worktree holds no work of its own: anything changed there is a build leftover.
    git(['checkout', '--detach', '--force', sha], demo);
  }
  const uncommitted = git(['status', '--porcelain', '--untracked-files=no']).split('\n').filter(Boolean).length;
  console.log(`Demo worktree ${demo} at ${ref} = ${sha.slice(0, 7)} (${git(['log', '-1', '--format=%s', sha])})`);
  if (ref === 'main' && uncommitted > 0) console.log(`Note: ${uncommitted} uncommitted file(s) in the main checkout are NOT in this demo.`);
  return sha;
}

/** Opens the quick tunnel and resolves with its URL once a connection is registered. */
function openTunnel() {
  return new Promise((resolve, reject) => {
    const attempt = (n) => {
      let url = null;
      let up = false;
      const child = spawn('cloudflared', ['tunnel', '--no-autoupdate', '--protocol', process.env.TUNNEL_PROTOCOL ?? 'http2', '--url', `http://localhost:${port}`], {
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      const scan = (chunk) => {
        const text = chunk.toString();
        url ??= text.match(URL_PATTERN)?.[0] ?? null;
        if (url && !up && text.includes('Registered tunnel connection')) {
          up = true;
          resolve({ url, child });
        }
      };
      child.stdout.on('data', scan);
      child.stderr.on('data', scan);
      child.on('error', (error) =>
        reject(new Error(error.code === 'ENOENT' ? 'cloudflared is not installed. Install it with: brew install cloudflared' : error.message)),
      );
      child.on('exit', () => {
        if (up) return;
        if (n < 5) attempt(n + 1);
        else reject(new Error('The Cloudflare quick tunnel did not come up after 5 attempts.'));
      });
    };
    attempt(1);
  });
}

const sha = syncWorktree();
const envFile = path.join(repo, 'apps', 'web', '.env.local');
if (existsSync(envFile)) copyFileSync(envFile, path.join(web, '.env.local'));
else console.log('Note: apps/web/.env.local is missing, so the demo has no JEV_API_KEY (the heuristic will drive).');
run('pnpm', ['install', '--frozen-lockfile', '--prefer-offline'], demo);

let tunnel = null;
let siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/$/, '') || '';
const urlFile = path.join(web, '.site-url');
rmSync(urlFile, { force: true });
if (flags.has('--tunnel') && !flags.has('--build-only')) {
  tunnel = await openTunnel();
  siteUrl = tunnel.url;
  writeFileSync(urlFile, `${siteUrl}\n`);
}

// The public URL is baked into the client bundle (share links) and read at request time (QR codes).
// Each build goes to a candidate directory and only replaces the live one when it succeeds, so a commit
// that does not build never takes the demo down: the last good build keeps being served.
const CANDIDATE = '.next-candidate';
const LIVE = '.next-live';
const stamp = path.join(web, LIVE, 'DEMO_COMMIT');
// The commit and ref are baked into the build: /api/version and the big screen's footer show them.
const buildEnv = { ...process.env, NEXT_PUBLIC_SITE_URL: siteUrl, NEXT_PUBLIC_DEMO_COMMIT: sha, NEXT_PUBLIC_DEMO_REF: ref, NEXT_DIST_DIR: CANDIDATE };
let served = sha;
try {
  rmSync(path.join(web, CANDIDATE), { recursive: true, force: true });
  run('pnpm', ['exec', 'next', 'build'], web, buildEnv);
  rmSync(path.join(web, LIVE), { recursive: true, force: true });
  renameSync(path.join(web, CANDIDATE), path.join(web, LIVE));
  writeFileSync(stamp, `${sha}\n`);
} catch {
  // next build has already printed the errors above.
  if (!existsSync(stamp)) {
    console.error(`\n${ref} (${sha.slice(0, 7)}) does not build and there is no earlier good build to serve.`);
    tunnel?.child.kill('SIGTERM');
    process.exit(1);
  }
  served = readFileSync(stamp, 'utf8').trim();
  console.error(`\n${ref} (${sha.slice(0, 7)}) does NOT build (errors above). Keeping the last good build, ${served.slice(0, 7)}.`);
  if (flags.has('--build-only')) process.exit(1);
}
if (flags.has('--build-only')) {
  console.log(`\n${ref} (${sha.slice(0, 7)}) builds. Nothing was started.`);
  process.exit(0);
}
const env = { ...process.env, NEXT_PUBLIC_SITE_URL: siteUrl, NEXT_DIST_DIR: LIVE };

console.log(`\nStable demo of ${served.slice(0, 7)} on http://localhost:${port}${siteUrl ? `  ·  public: ${siteUrl}  ·  big screen: ${siteUrl}/screen` : ''}\n`);
const server = spawn('pnpm', ['exec', 'next', 'start', '-H', '0.0.0.0', '-p', port], { cwd: web, env, stdio: 'inherit' });
const stop = () => {
  server.kill('SIGTERM');
  tunnel?.child.kill('SIGTERM');
  rmSync(urlFile, { force: true });
};
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, stop);
server.on('exit', (code) => {
  tunnel?.child.kill('SIGTERM');
  rmSync(urlFile, { force: true });
  process.exit(code ?? 0);
});
