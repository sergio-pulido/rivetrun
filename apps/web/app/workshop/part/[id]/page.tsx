import { notFound } from 'next/navigation';
import { PARTS_BY_ID } from '@rivetrun/sim';
import { mediaFor, partBom } from '@/ui/real/bomData';
import { PartSheet } from '@/ui/workshop/PartSheet';

interface PartPageProps {
  params: Promise<{ id: string }>;
}

export default async function PartPage({ params }: PartPageProps) {
  const part = PARTS_BY_ID.get((await params).id);
  if (!part) notFound();
  // Gameplay numbers come from the sim's part; the real components come from docs/inputs/bom-mk2.json.
  const bom = partBom(part.id);
  return <PartSheet part={part} bom={bom} media={mediaFor(bom)} />;
}
