import { defineConfig } from 'vitest/config';

// The suite plays whole missions, hundreds of them. Alone it takes a few seconds; next to the other packages'
// suites on a busy machine a single test can pass the 5 s default without anything being wrong.
export default defineConfig({
  test: { testTimeout: 60_000 },
});
