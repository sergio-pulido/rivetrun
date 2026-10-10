// The share card: one image of the run, your time against Jev's. The words are worked out here (and tested);
// the drawing is a plain 2D canvas, so nothing is fetched and nothing leaves the device until the player shares it.
import type { Episode } from '@rivetrun/contracts';
import { MISSIONS } from '@rivetrun/sim';
import type { GhostResult } from '@/state/run';
import { buildName } from '@/ui/buildStats';
import { formatSeconds } from '@/ui/format';
import { tagline } from '@/ui/home/Tagline';
import { driveVerdict } from './DuelTable';

export interface ShareCard {
  /** "M1 · Garage Test". */
  readonly mission: string;
  /** "43.6 s", or "DNF · 62%". */
  readonly you: string;
  /** "JEV" or "YOUR BEST"; null when there is no rival to compare with. */
  readonly rivalName: string | null;
  readonly rival: string | null;
  readonly verdict: string;
  readonly stars: number;
  readonly robot: string;
  readonly score: string;
  /** Home's line, ending on who drove: the player raced it, or watched Jev drive it. */
  readonly tagline: string;
}

const result = (outcome: Episode['outcome']): string => (outcome.finished ? `${formatSeconds(outcome.timeS)} s` : `DNF · ${Math.round(outcome.progressFraction * 100)}%`);

/** What the card says. In Drive mode the rival is Jev, or the ghost of the player's own best run. */
export function shareCardData(episode: Episode, ghosts: readonly Pick<GhostResult, 'policy' | 'outcome'>[]): ShareCard {
  const mission = MISSIONS[episode.missionId];
  const drove = episode.policy === 'human';
  const rival = drove ? (ghosts.find((ghost) => ghost.policy === 'jev') ?? ghosts.find((ghost) => ghost.policy === 'human')) : undefined;
  return {
    mission: `${mission.id} · ${mission.name}`,
    you: result(episode.outcome),
    rivalName: rival ? (rival.policy === 'jev' ? 'JEV' : 'YOUR BEST') : null,
    rival: rival ? result(rival.outcome) : null,
    verdict: rival ? driveVerdict(episode.outcome, rival.outcome, rival.policy) : drove ? 'I drove it' : 'Jev drove my robot',
    stars: episode.outcome.stars,
    robot: buildName(episode.build),
    score: `${Math.round(episode.outcome.score)} pts`,
    tagline: tagline(drove),
  };
}

const [WIDTH, HEIGHT] = [1200, 630];
const COLOR = { ground: '#0E1013', panel: '#151920', line: '#2A3039', text: '#EDEFF2', muted: '#9AA3AE', orange: '#FF7A1A', cyan: '#3FD0E0' } as const;

/** Draws the card as a PNG. Null when the browser cannot (no canvas, or it refuses to export). */
export async function drawShareCard(card: ShareCard): Promise<Blob | null> {
  try {
    const canvas = document.createElement('canvas');
    canvas.width = WIDTH;
    canvas.height = HEIGHT;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    const family = getComputedStyle(document.body).fontFamily || 'sans-serif';
    const text = (value: string, x: number, y: number, font: string, color: string, align: CanvasTextAlign = 'left'): void => {
      ctx.font = `${font} ${family}`;
      ctx.fillStyle = color;
      ctx.textAlign = align;
      ctx.fillText(value, x, y);
    };

    ctx.fillStyle = COLOR.ground;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    ctx.fillStyle = COLOR.orange;
    ctx.fillRect(0, 0, WIDTH, 10);
    text('RIVETRUN', 64, 96, '700 40px', COLOR.text);
    text(card.mission.toUpperCase(), WIDTH - 64, 96, '500 30px', COLOR.muted, 'right');

    const twoSides = card.rival !== null && card.rivalName !== null;
    const tile = (x: number, width: number, label: string, value: string, color: string): void => {
      ctx.fillStyle = COLOR.panel;
      ctx.strokeStyle = color;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.roundRect(x, 150, width, 230, 24);
      ctx.fill();
      ctx.stroke();
      text(label, x + 36, 210, '600 28px', color);
      text(value, x + 36, 330, '700 104px', COLOR.text);
    };
    if (twoSides) {
      tile(64, 520, 'YOU', card.you, COLOR.orange);
      tile(616, 520, card.rivalName!, card.rival!, COLOR.cyan);
    } else {
      tile(64, WIDTH - 128, 'TIME', card.you, COLOR.orange);
    }

    text(card.verdict, 64, 460, '700 52px', COLOR.text);
    text(`${'★'.repeat(card.stars)}${'☆'.repeat(Math.max(0, 3 - card.stars))}  ${card.score}  ·  ${card.robot}`, 64, 528, '500 32px', COLOR.muted);
    text(card.tagline, 64, 590, '500 26px', COLOR.orange);
    return await new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), 'image/png'));
  } catch {
    return null;
  }
}
