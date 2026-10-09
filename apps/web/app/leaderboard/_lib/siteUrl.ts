import { networkInterfaces } from 'node:os';
import { headers } from 'next/headers';

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

const lanAddress = (): string | undefined =>
  Object.values(networkInterfaces())
    .flat()
    .find((address) => address && address.family === 'IPv4' && !address.internal)?.address;

/**
 * URL the QR points to. NEXT_PUBLIC_SITE_URL wins; otherwise the request host,
 * with localhost swapped for this machine's LAN address so phones in the room can reach it.
 */
export async function resolveSiteUrl(): Promise<string> {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (configured) return configured.replace(/\/$/, '');

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
