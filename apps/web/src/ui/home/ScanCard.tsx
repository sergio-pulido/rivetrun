// The big screen's own QR drawing, so both codes look and scan the same.
import { QrCode } from '../../../app/leaderboard/_lib/QrCode';
import { shownAddress } from './scan';

/** "Scan to play": the /play address for phones in the room. Rendered only when an address a phone can open is known. */
export function ScanCard({ url }: { readonly url: string }) {
  return (
    <aside className="rr-card flex items-center gap-4 p-3.5" aria-label="Scan to play" data-testid="home-scan">
      <QrCode value={url} className="h-[clamp(132px,19vh,200px)] w-[clamp(132px,19vh,200px)] shrink-0 rounded-lg" />
      <div className="flex min-w-0 max-w-[190px] flex-col gap-1.5">
        <span className="font-display text-[26px] font-bold leading-none">Scan to play</span>
        <span className="text-[13px] leading-snug text-text-2">Point your phone&apos;s camera at the code. No app, no account.</span>
        <span className="break-all font-mono text-[11px] leading-snug text-orange-soft">{shownAddress(url)}</span>
      </div>
    </aside>
  );
}
