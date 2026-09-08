import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));

/**
 * Two tiers, distinguished by filename (ARCHITECTURE R9.1):
 *   *.test.ts      unit, no database
 *   *.int.test.ts  integration, real Postgres
 *
 * Integration and race projects run with fileParallelism disabled. The race
 * test measures genuine concurrency (R9.3); letting other files interleave
 * adds noise to the one test whose timing is the point.
 */
export default defineConfig({
  resolve: { alias: { '@': root } },
  test: {
    projects: [
      {
        resolve: { alias: { '@': root } },
        test: {
          name: 'unit',
          environment: 'node',
          include: ['tests/**/*.test.ts'],
          exclude: ['**/node_modules/**', 'tests/**/*.int.test.ts'],
        },
      },
      {
        resolve: { alias: { '@': root } },
        test: {
          name: 'int',
          environment: 'node',
          include: ['tests/**/*.int.test.ts'],
          exclude: ['**/node_modules/**'],
          setupFiles: ['tests/setup.int.ts'],
          fileParallelism: false,
          testTimeout: 60_000,
          hookTimeout: 60_000,
        },
      },
      {
        resolve: { alias: { '@': root } },
        test: {
          name: 'race',
          environment: 'node',
          include: ['tests/race.int.test.ts', 'tests/lock-proof.int.test.ts'],
          exclude: ['**/node_modules/**'],
          setupFiles: ['tests/setup.int.ts'],
          fileParallelism: false,
          testTimeout: 60_000,
          hookTimeout: 60_000,
        },
      },
    ],
  },
});
