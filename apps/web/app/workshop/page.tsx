import { buildBom, lockedItems, mediaFor, partMakers, partRender } from '@/ui/real/bomData';
import type { LockedPart } from '@/ui/real/LockedCard';
import { printedParts } from '@/ui/real/printedData';
import { Workshop } from '@/ui/workshop/Workshop';

// Renders and the printed-parts list land on disk while the app runs: look for them on each request.
export const dynamic = 'force-dynamic';

export default function WorkshopPage() {
  const locked: LockedPart[] = lockedItems().map((item) => ({
    key: item.key,
    name: item.name,
    manufacturer: item.manufacturer,
    scenario: item.scenario,
    category: item.category,
    render: partRender(item.key),
  }));
  // The part sheet opens beside the rover on wide screens, so the Workshop carries the bill of materials it reads from.
  const bom = buildBom();
  return <Workshop makers={partMakers()} locked={locked} printedIds={printedParts().map((part) => part.id)} bom={bom} media={mediaFor(bom)} />;
}
