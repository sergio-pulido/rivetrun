import type { Metadata } from 'next';
import { buildBom, mediaFor, partRender, toolItems, toolRender } from '@/ui/real/bomData';
import { printedParts } from '@/ui/real/printedData';
import { RealBuild } from '@/ui/real/RealBuild';

export const metadata: Metadata = { title: 'Build it for real · RivetRun' };
// Renders and the printed-parts list land on disk while the app runs: look for them on each request.
export const dynamic = 'force-dynamic';

export default function RealBuildPage() {
  const bom = buildBom();
  const printed = printedParts();
  const tools = toolItems();
  return (
    <RealBuild
      bom={bom}
      media={mediaFor(bom)}
      printed={printed}
      printedRenders={Object.fromEntries(printed.map((part) => [part.id, partRender(part.id)]))}
      tools={tools}
      toolRenders={Object.fromEntries(tools.map((tool) => [tool.key, toolRender(tool)]))}
    />
  );
}
