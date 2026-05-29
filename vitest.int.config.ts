import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['packages/**/src/**/*.int.test.ts', 'apps/**/lib/**/*.int.test.ts'],
    exclude: ['**/node_modules/**'],
    passWithNoTests: true,
    hookTimeout: 120000,
    fileParallelism: false,
  },
})
