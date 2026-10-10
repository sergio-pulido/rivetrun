import type { Metadata } from 'next';
import { buildBom, mediaFor } from '@/ui/real/bomData';
import { RealBuild } from '@/ui/real/RealBuild';

export const metadata: Metadata = { title: 'Build it for real · RivetRun' };
// Renders land in /public while the app runs: look for them on each request.
export const dynamic = 'force-dynamic';

export default function RealBuildPage() {
  const bom = buildBom();
  return <RealBuild bom={bom} media={mediaFor(bom)} />;
}
