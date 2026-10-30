import { defineConfig } from 'vitest/config';

// Unit tests run against plain modules in src/lib. Only src/lib/signups/env.ts touches
// `astro:env/server`, and no test imports it: handlers take their settings as arguments.
export default defineConfig({
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
    restoreMocks: true,
  },
});
