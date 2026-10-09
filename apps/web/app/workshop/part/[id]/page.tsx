import { notFound } from 'next/navigation';
import { PARTS_BY_ID } from '@rivetrun/sim';
import { PartSheet } from '@/ui/workshop/PartSheet';

interface PartPageProps {
  params: Promise<{ id: string }>;
}

export default async function PartPage({ params }: PartPageProps) {
  const part = PARTS_BY_ID.get((await params).id);
  if (!part) notFound();
  return <PartSheet part={part} />;
}
