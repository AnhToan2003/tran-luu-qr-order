import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    pool: 'forks',
    include: ['tests/**/*.test.ts'],
    exclude: ['scratch/**', 'node_modules/**', 'dist/**', 'dist-server/**'],
    testTimeout: 30_000,
    hookTimeout: 60_000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'html'],
      include: ['server/**/*.ts'],
      exclude: ['server/seedData.ts', 'server/swagger/**', '**/*.d.ts']
    },
    reporters: process.env.CI ? ['verbose', 'junit'] : ['verbose'],
    outputFile: {
      junit: './test-results/junit.xml'
    }
  },
  resolve: {
    alias: {
      '@server': resolve(__dirname, './server'),
      '@tests': resolve(__dirname, './tests')
    }
  }
});
