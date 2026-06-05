import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.js'],
    setupFiles: ['tests/setup.js'],
    coverage: {
      provider: 'v8',
      include: ['api/_sharedCache.js', 'api/_cairoSOP.js', 'api/_contextAssembly.js', 'api/_intelCenter.js', 'api/journey-agent.js', 'api/country-risk.js'],
      reporter: ['text', 'html'],
    },
  },
})
