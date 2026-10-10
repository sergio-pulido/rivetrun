// Home's "Scan to play" card (desktop and projector): the address a phone opens to play.

/** Hosts only this machine can open: a QR to one of them would send a phone nowhere. */
const isLoopback = (hostname: string): boolean => {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  return host === 'localhost' || host.endsWith('.localhost') || host === '::1' || host === '0.0.0.0' || /^127(\.\d{1,3}){3}$/.test(host);
};

/**
 * The /play address for the QR, from the site address the big screen's QR already uses. Null when that address is
 * not one a phone can open (this machine's own name, or not a web address at all): the card is then not shown.
 */
export function playQrUrl(siteUrl: string | null | undefined): string | null {
  let url: URL;
  try {
    url = new URL((siteUrl ?? '').trim());
  } catch {
    return null;
  }
  if ((url.protocol !== 'https:' && url.protocol !== 'http:') || isLoopback(url.hostname)) return null;
  return `${url.origin}${url.pathname.replace(/\/+$/, '')}/play`;
}

/** The address as a person reads it under the code: no protocol. */
export const shownAddress = (url: string): string => url.replace(/^https?:\/\//, '');
