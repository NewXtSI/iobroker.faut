import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

// Standard Vite application build (not lib mode).
// Produces code-split chunks which avoids the IIFE inlining hang on large bundles.
// ioBroker loads admin/index_m.html which references build/index.js via <script type="module">.
export default defineConfig({
    root: resolve(__dirname),
    base: './',
    plugins: [react()],
    build: {
        outDir: resolve(__dirname, 'build'),
        emptyOutDir: true,
        rollupOptions: {
            output: {
                entryFileNames: '[name].js',
                chunkFileNames: 'chunks/[name]-[hash].js',
                assetFileNames: 'assets/[name]-[hash][extname]',
            },
        },
    },
    server: {
        port: 3000,
    },
});
