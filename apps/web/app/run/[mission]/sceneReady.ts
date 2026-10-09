/** How long to wait for the 3D canvas before starting anyway (it never blocks a run for good). */
const CANVAS_WAIT_MS = 8000;
const POLL_MS = 100;

const sized = (canvas: HTMLCanvasElement | null): boolean => canvas !== null && canvas.clientWidth > 0 && canvas.width > 300;

/**
 * Resolves when the player can actually see the track: the 3D canvas has been sized and the browser
 * is painting frames. On a cold load over a slow connection the 3D chunk can take seconds, and the
 * clock must not run while the screen is still dark. A tab that is not being painted (background
 * tab) waits until it is, because requestAnimationFrame only fires for a page on screen.
 */
export function sceneReady(isCancelled: () => boolean): Promise<void> {
  return new Promise((resolve) => {
    const started = performance.now();
    const poll = (): void => {
      if (isCancelled()) return resolve();
      const ready = sized(document.querySelector('canvas'));
      if (ready || performance.now() - started >= CANVAS_WAIT_MS) {
        // Two frames: one for the canvas to draw, one for it to reach the screen.
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
        return;
      }
      setTimeout(poll, POLL_MS);
    };
    poll();
  });
}
