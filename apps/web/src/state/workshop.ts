'use client';

import type { Slot } from '@rivetrun/contracts';
import { create } from 'zustand';

interface WorkshopUi {
  /** The slot tab that is open, kept so closing a part sheet returns to the same shelf. */
  readonly slot: Slot;
  readonly setSlot: (slot: Slot) => void;
}

export const useWorkshopUi = create<WorkshopUi>((set) => ({
  slot: 'sensor',
  setSlot: (slot) => set({ slot }),
}));
