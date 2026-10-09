'use client';

import { Component, Suspense, type ReactNode } from 'react';

/** Swallows a failure of the reflection environment: the scene keeps its plain lights. */
class Optional extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  render(): ReactNode {
    return this.state.failed ? null : this.props.children;
  }
}

interface ReflectionsProps {
  /** true = skip it: the scene is running late (or struggling) and draws with plain lights only. */
  plain: boolean;
  children: ReactNode;
}

/**
 * The reflection environment is a nicety (ice sheen, water, metal parts). It never blocks the scene:
 * it is skipped in plain mode, it cannot suspend the scene around it, and if it throws it is dropped.
 */
export function Reflections({ plain, children }: ReflectionsProps) {
  if (plain) return null;
  return (
    <Optional>
      <Suspense fallback={null}>{children}</Suspense>
    </Optional>
  );
}
