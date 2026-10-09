import { Workshop } from '@/ui/workshop/Workshop';
import { realModels } from '@/ui/workshop/realParts';

export default function WorkshopPage() {
  return <Workshop models={realModels()} />;
}
