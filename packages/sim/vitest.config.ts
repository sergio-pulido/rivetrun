import { defineConfig } from 'vitest/config';

// The suite simulates thousands of runs. Alone it takes about 15 s; next to the other packages' suites on a busy
// machine single tests have gone past the 5 s default without anything being wrong, so the limit is generous.
export default defineConfig({
  test: { testTimeout: 60_000 },
});
