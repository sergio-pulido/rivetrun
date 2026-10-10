import type { Episode } from '@rivetrun/contracts';
import { MISSIONS } from '@rivetrun/sim';
import type { GhostResult } from '@/state/run';
import { buildName } from '@/ui/buildStats';
import { formatSeconds } from '@/ui/format';
import { drawShareCard, shareCardData } from './shareCard';

type Ghost = Pick<GhostResult, 'policy' | 'outcome'>;

export function shareText(episode: Episode, ghosts: readonly Ghost[] = []): string {
  const mission = MISSIONS[episode.missionId];
  const { outcome } = episode;
  const jev = episode.policy === 'human' ? ghosts.find((ghost) => ghost.policy === 'jev') : undefined;
  // The duel in a clause: both times as the result screen shows them.
  const duel = jev && outcome.finished && jev.outcome.finished ? ` (${formatSeconds(outcome.timeS)} s vs Jev ${formatSeconds(jev.outcome.timeS)} s)` : '';
  const result = outcome.finished ? `${outcome.score} pts in ${formatSeconds(outcome.timeS)} s ${'★'.repeat(outcome.stars)}` : `DNF at ${Math.round(outcome.progressFraction * 100)}%, ${outcome.score} pts`;
  return `RivetRun ${mission.id} ${mission.name}: ${result.trim()}${duel}. Robot: ${buildName(episode.build)} (€${outcome.costEur}). ${episode.policy === 'human' ? 'I built the body and raced the AI.' : 'I built the body, the AI drove it.'}`;
}

export type ShareOutcome = 'shared' | 'copied' | 'manual';

export interface ShareResult {
  readonly outcome: ShareOutcome;
  /** The text and link that were shared; on 'manual' the page shows it for the player to copy by hand. */
  readonly message: string;
}

/** Copies without the async Clipboard API, for pages that are not focused or not on HTTPS (a phone on the LAN). */
function legacyCopy(message: string): boolean {
  const field = document.createElement('textarea');
  field.value = message;
  field.setAttribute('readonly', '');
  field.style.position = 'fixed';
  field.style.opacity = '0';
  document.body.append(field);
  field.select();
  try {
    return document.execCommand('copy');
  } catch {
    return false;
  } finally {
    field.remove();
  }
}

/**
 * Web Share API when the browser has it; otherwise the clipboard, by either route.
 * When nothing can copy, the caller gets the message back to show as selectable text.
 */
export async function share(episode: Episode, ghosts: readonly Ghost[] = []): Promise<ShareResult> {
  const text = shareText(episode, ghosts);
  // The public demo URL when one is configured at build time, so a link shared from localhost still works.
  const url = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '') || window.location.origin;
  const message = `${text} ${url}`;
  if (typeof navigator.share === 'function') {
    try {
      // With the card image where the browser can share files; the same text and link either way.
      const image = await drawShareCard(shareCardData(episode, ghosts));
      const files = image ? [new File([image], `rivetrun-${episode.missionId}.png`, { type: 'image/png' })] : [];
      const withCard = files.length > 0 && typeof navigator.canShare === 'function' && navigator.canShare({ files });
      await navigator.share(withCard ? { title: 'RivetRun', text, url, files } : { title: 'RivetRun', text, url });
      return { outcome: 'shared', message };
    } catch (cause) {
      // Closing the share sheet is a choice, not a failure.
      if (cause instanceof DOMException && cause.name === 'AbortError') return { outcome: 'shared', message };
    }
  }
  try {
    await navigator.clipboard.writeText(message);
    return { outcome: 'copied', message };
  } catch {
    return { outcome: legacyCopy(message) ? 'copied' : 'manual', message };
  }
}

/** Saves the share card as a PNG, for browsers that cannot share files. False when the card could not be drawn. */
export async function downloadShareCard(episode: Episode, ghosts: readonly Ghost[] = []): Promise<boolean> {
  const image = await drawShareCard(shareCardData(episode, ghosts));
  if (!image) return false;
  const href = URL.createObjectURL(image);
  const link = document.createElement('a');
  link.href = href;
  link.download = `rivetrun-${episode.id}.png`;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(href);
  return true;
}

export function downloadEpisode(episode: Episode): void {
  const blob = new Blob([JSON.stringify(episode, null, 2)], { type: 'application/json' });
  const href = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = href;
  // Episode ids already start with the mission id.
  link.download = `rivetrun-${episode.id}.json`;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(href);
}
