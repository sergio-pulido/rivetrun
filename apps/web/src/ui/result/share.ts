import type { Episode } from '@rivetrun/contracts';
import { MISSIONS } from '@rivetrun/sim';
import { buildName } from '@/ui/buildStats';

export function shareText(episode: Episode): string {
  const mission = MISSIONS[episode.missionId];
  const { outcome } = episode;
  const result = outcome.finished ? `${outcome.score} pts in ${outcome.timeS.toFixed(1)} s ${'★'.repeat(outcome.stars)}` : `DNF at ${Math.round(outcome.progressFraction * 100)}%, ${outcome.score} pts`;
  return `RivetRun ${mission.id} ${mission.name}: ${result.trim()}. Robot: ${buildName(episode.build)} (€${outcome.costEur}). I built the body, AI drove it.`;
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
export async function share(episode: Episode): Promise<ShareResult> {
  const text = shareText(episode);
  // The public demo URL when one is configured at build time, so a link shared from localhost still works.
  const url = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '') || window.location.origin;
  const message = `${text} ${url}`;
  if (typeof navigator.share === 'function') {
    try {
      await navigator.share({ title: 'RivetRun', text, url });
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
