import { notFound } from 'next/navigation';
import { approximateRenders, bomCheckedAt, bomItem, partRender, toolRender } from '@/ui/real/bomData';
import { RealItemSheet } from '@/ui/real/RealItemSheet';

interface RealItemPageProps {
  params: Promise<{ key: string }>;
}

export default async function RealItemPage({ params }: RealItemPageProps) {
  const item = bomItem((await params).key);
  if (!item) notFound();
  const tool = item.group === 'tool';
  return <RealItemSheet item={item} render={tool ? toolRender(item) : partRender(item.key)} approximate={!tool && approximateRenders().has(item.key)} checkedAt={bomCheckedAt()} back={item.group === 'locked' ? '/workshop' : '/workshop/real'} />;
}
