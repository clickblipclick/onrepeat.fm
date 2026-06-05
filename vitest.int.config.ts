import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['packages/**/src/**/*.int.test.ts', 'apps/**/lib/**/*.int.test.ts'],
    exclude: ['**/node_modules/**'],
    passWithNoTests: true,
    hookTimeout: 120000,
    fileParallelism: false,
    // Integration tests truncate tables — this setupFile pins them to a dedicated
    // database and refuses the dev/app DB. The DB itself is created by the `test:int`
    // pre-step (packages/db/src/inttest-create.ts). See also inttest-setup.ts.
    setupFiles: ['./packages/db/src/inttest-setup.ts'],
  },
})
