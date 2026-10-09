import { notFound } from 'next/navigation';
import { PARTS_BY_ID } from '@rivetrun/sim';
import { PartSheet } from '@/ui/workshop/PartSheet';
import { realPart } from '@/ui/workshop/realParts';

interface PartPageProps {
  params: Promise<{ id: string }>;
}

export default async function PartPage({ params }: PartPageProps) {
  const part = PARTS_BY_ID.get((await params).id);
  if (!part) notFound();
  // Gameplay numbers come from the sim's part; the real-hardware block comes from docs/inputs/real-parts.json.
  return <PartSheet part={part} real={realPart(part.id)} />;
}
