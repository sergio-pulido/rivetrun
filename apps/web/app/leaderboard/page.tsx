import type { Metadata } from 'next';
import { LeaderboardClient } from './LeaderboardClient';
import './leaderboard.css';

export const metadata: Metadata = { title: 'Leaderboard · RivetRun' };

export default function LeaderboardPage() {
  return <LeaderboardClient />;
}
