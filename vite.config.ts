/// <reference types="vitest/config" />
import { resolve } from 'node:path';
import { defineConfig, type PluginOption } from 'vite';
import react from '@vitejs/plugin-react';
import { visualizer } from 'rollup-plugin-visualizer';

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react({
      jsxImportSource: '@emotion/react',
      babel: {
        plugins: ['@emotion/babel-plugin'],
      },
    }),
    process.env.ANALYZE
      ? visualizer({ filename: 'dist/stats.html', gzipSize: true, open: false })
      : null,
  ].filter(Boolean) as PluginOption[],
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
    },
    dedupe: ['react', 'react-dom', '@emotion/react', '@emotion/styled'],
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    environmentMatchGlobs: [['src/**/*.test.tsx', 'jsdom']],
  },
  optimizeDeps: {
    include: [
      'react',
      'react-dom',
      '@emotion/react',
      '@emotion/styled',
      'prop-types',
      'react-is',
    ],
  },
  server: {
    port: 3001,
    strictPort: true,
    // Evita fallos de WebSocket HMR en Windows (localhost → IPv6 ::1 vs 127.0.0.1)
    host: '127.0.0.1',
    open: 'http://localhost:3001/',
    hmr: { protocol: 'ws', host: '127.0.0.1', port: 3001, clientPort: 3001 },
  },
  preview: {
    port: 3001,
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    target: 'es2020',
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom'],
          'vendor-mui': ['@mui/material', '@emotion/react', '@emotion/styled'],
          'vendor-mui-icons': ['@mui/icons-material'],
          'vendor-supabase': ['@supabase/supabase-js'],
          'vendor-firebase': ['firebase/app', 'firebase/functions'],
        },
      },
    },
  },
});
