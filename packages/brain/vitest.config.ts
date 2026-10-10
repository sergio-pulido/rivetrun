import { defineConfig } from 'vitest/config';

// The leak, facts and Lab question tests drive whole missions through the sim: seconds each on an idle machine,
// more when the gate runs every package at once (docs/QA.md Q22).
export default defineConfig({ test: { testTimeout: 60_000 } });
