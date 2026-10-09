import type { Metadata } from 'next';
import { JoinByCode } from './JoinByCode';

export const metadata: Metadata = { title: 'Room Race · RivetRun' };

export default function RaceIndexPage() {
  return <JoinByCode />;
}
