import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

// Builds the React admin into admin/build/index.js (IIFE, fully self-contained).
// ioBroker's admin panel loads admin/index_m.html which references this bundle.
export default defineConfig({
    plugins: [react()],
    build: {
        lib: {
            entry: resolve(__dirname, 'src/index.tsx'),
            name: 'FautAdmin',
            fileName: () => 'index.js',
            formats: ['iife'],
        },
        outDir: resolve(__dirname, 'build'),
        emptyOutDir: true,
        rollupOptions: {
            output: {
                inlineDynamicImports: true,
            },
        },
    },
    server: {
        port: 3000,
    },
});
