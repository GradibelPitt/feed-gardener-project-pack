import { fileURLToPath } from 'node:url';
import { sites } from '@openai/sites-vite-plugin';
import vinext from 'vinext';
import { defineConfig } from 'vite';

export default defineConfig(async () => {
  const { cloudflare } = await import('@cloudflare/vite-plugin');
  return {
    resolve: {
      alias: [
        {
          find: './score-cache.ts',
          replacement: fileURLToPath(new URL('./lib/score-cache.worker.ts', import.meta.url)),
        },
      ],
    },
    plugins: [
      vinext(),
      sites(),
      cloudflare({
        viteEnvironment: { name: 'rsc', childEnvironments: ['ssr'] },
        config: {
          main: 'vinext/server/fetch-handler',
          compatibility_flags: ['nodejs_compat'],
        },
      }),
    ],
  };
});
