import type { Episode } from '@rivetrun/contracts';
import { MISSIONS } from '@rivetrun/sim';
import { buildName } from '@/ui/buildStats';

export type ShareOutcome = 'shared' | 'copied' | 'failed';

export function shareText(episode: Episode): string {
  const mission = MISSIONS[episode.missionId];
  const { outcome } = episode;
  const result = outcome.finished ? `${outcome.score} pts in ${outcome.timeS.toFixed(1)} s ${'★'.repeat(outcome.stars)}` : `DNF at ${Math.round(outcome.progressFraction * 100)}%, ${outcome.score} pts`;
  return `RivetRun ${mission.id} ${mission.name}: ${result.trim()}. Robot: ${buildName(episode.build)} (€${outcome.costEur}). I built the body, AI drove it.`;
}

/** Web Share API when the browser has it; otherwise the text and URL go to the clipboard. */
export async function share(episode: Episode): Promise<ShareOutcome> {
  const text = shareText(episode);
  const url = window.location.origin;
  try {
    if (typeof navigator.share === 'function') {
      await navigator.share({ title: 'RivetRun', text, url });
      return 'shared';
    }
    await navigator.clipboard.writeText(`${text} ${url}`);
    return 'copied';
  } catch (cause) {
    // Closing the share sheet is not a failure.
    return cause instanceof DOMException && cause.name === 'AbortError' ? 'shared' : 'failed';
  }
}

export function downloadEpisode(episode: Episode): void {
  const blob = new Blob([JSON.stringify(episode, null, 2)], { type: 'application/json' });
  const href = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = href;
  link.download = `rivetrun-${episode.missionId}-${episode.id}.json`;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(href);
}
