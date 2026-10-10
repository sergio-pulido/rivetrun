import { partMakers } from '@/ui/real/bomData';
import { Workshop } from '@/ui/workshop/Workshop';

export default function WorkshopPage() {
  return <Workshop makers={partMakers()} />;
}
