// Cloudflare quick tunnel to the demo server (pnpm demo, port 3001).
// Prints the public URL and writes it to apps/web/.site-url, which the QR codes read while the tunnel is up.
//   pnpm tunnel            (PORT=3000 pnpm tunnel to expose the dev server instead)
import { spawn } from 'node:child_process';
import { rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const port = Number(process.env.PORT ?? 3001);
import { existsSync } from 'node:fs';
// The QR codes read this file. The stable demo (pnpm demo:stable) serves from ../rivetrun-demo, so it gets a copy.
const urlFiles = [
  fileURLToPath(new URL('../apps/web/.site-url', import.meta.url)),
  fileURLToPath(new URL('../../rivetrun-demo/apps/web/.site-url', import.meta.url)),
].filter((file) => existsSync(fileURLToPath(new URL('.', `file://${file}`))));
// The tunnel's own hostname is random words; api.trycloudflare.com only appears in error messages.
const URL_PATTERN = /https:\/\/(?!api\.)[a-z0-9-]+\.trycloudflare\.com/;
// Cloudflare's quick-tunnel API sometimes answers slower than cloudflared's timeout, so a failed request is retried.
const MAX_ATTEMPTS = 5;
// http2 (TCP 443) connects on networks that block QUIC (UDP 7844); override with TUNNEL_PROTOCOL=quic.
const protocol = process.env.TUNNEL_PROTOCOL ?? 'http2';

const cleanup = () => urlFiles.forEach((file) => rmSync(file, { force: true }));
let child;
let stopping = false;

function open(attempt) {
  let announced = false;
  let url = null;
  child = spawn('cloudflared', ['tunnel', '--no-autoupdate', '--protocol', protocol, '--url', `http://localhost:${port}`], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const scan = (chunk) => {
    const text = chunk.toString();
    url ??= text.match(URL_PATTERN)?.[0] ?? null;
    // The URL is printed before the tunnel connects; it only works once a connection is registered.
    if (url && !announced && text.includes('Registered tunnel connection')) {
      announced = true;
      urlFiles.forEach((file) => writeFileSync(file, `${url}\n`));
      console.log(`\nTunnel up: ${url}  →  http://localhost:${port}`);
      console.log(`Big screen: ${url}/screen`);
      console.log('QR codes now point at the tunnel. Ctrl+C closes it.\n');
    } else if (/failed|ERR/.test(text)) {
      process.stderr.write(text);
    }
  };
  child.stdout.on('data', scan);
  child.stderr.on('data', scan);
  child.on('error', (error) => {
    cleanup();
    if (error.code === 'ENOENT') {
      console.error('cloudflared is not installed. Install it with:\n  brew install cloudflared');
    } else {
      console.error(`cloudflared failed to start: ${error.message}`);
    }
    process.exit(1);
  });
  child.on('exit', (code) => {
    cleanup();
    if (!stopping && !announced && attempt < MAX_ATTEMPTS) {
      console.error(`No tunnel yet (attempt ${attempt} of ${MAX_ATTEMPTS}); retrying…`);
      open(attempt + 1);
      return;
    }
    process.exit(code ?? 0);
  });
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    stopping = true;
    child?.kill(signal);
  });
}
open(1);
