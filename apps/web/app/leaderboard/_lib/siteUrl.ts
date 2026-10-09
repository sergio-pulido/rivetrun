import { readFile } from 'node:fs/promises';
import { networkInterfaces } from 'node:os';
import path from 'node:path';
import { headers } from 'next/headers';

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

const lanAddress = (): string | undefined =>
  Object.values(networkInterfaces())
    .flat()
    .find((address) => address && address.family === 'IPv4' && !address.internal)?.address;

/** Written by `pnpm tunnel` while a Cloudflare quick tunnel is up (scripts/tunnel.mjs). */
const TUNNEL_URL_FILE = path.join(process.cwd(), '.site-url');

async function tunnelUrl(): Promise<string | undefined> {
  try {
    const url = (await readFile(TUNNEL_URL_FILE, 'utf8')).trim();
    return /^https:\/\/[a-z0-9.-]+$/i.test(url) ? url : undefined;
  } catch {
    return undefined; // No tunnel running.
  }
}

/**
 * URL the QR codes point to. NEXT_PUBLIC_SITE_URL wins, then a running `pnpm tunnel`; otherwise the request
 * host, with localhost swapped for this machine's LAN address so phones in the room can reach it.
 */
export async function resolveSiteUrl(): Promise<string> {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (configured) return configured.replace(/\/$/, '');
  const tunnel = await tunnelUrl();
  if (tunnel) return tunnel;

  const requestHeaders = await headers();
  const host = requestHeaders.get('x-forwarded-host') ?? requestHeaders.get('host') ?? 'localhost:3000';
  const protocol = requestHeaders.get('x-forwarded-proto') ?? 'http';
  const [hostname, port] = host.startsWith('[') ? [host, undefined] : host.split(':');
  if (hostname && LOCAL_HOSTS.has(hostname)) {
    const lan = lanAddress();
    if (lan) return `${protocol}://${lan}${port ? `:${port}` : ''}`;
  }
  return `${protocol}://${host}`;
}
