import type { Metadata } from 'next';
import { QrCode } from '../leaderboard/_lib/QrCode';
import { resolveSiteUrl } from '../leaderboard/_lib/siteUrl';
import '../leaderboard/leaderboard.css';
import { ScreenClient } from './ScreenClient';

export const metadata: Metadata = { title: 'Room Challenge · RivetRun' };
export const dynamic = 'force-dynamic';

export default async function ScreenPage() {
  const siteUrl = await resolveSiteUrl();
  return <ScreenClient siteUrl={siteUrl} qr={<QrCode value={siteUrl} className="block h-auto w-full" />} />;
}
