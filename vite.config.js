import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',  // bind to Tailscale IP
    port: 5173,
    // Allow serving COSMOS atlas assets from outside project root
    fs: {
      allow: [
        '.',  // project root (workspace-webui)
        '/home/k/.openclaw/shared/state/ai-city-assets',  // COSMOS atlases
      ],
    },
  },
  // Make COSMOS assets available at /ai-city-assets/ during dev
  // In production, copy shared/state/ai-city-assets/ to public/ai-city-assets/
});
