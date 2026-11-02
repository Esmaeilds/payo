import {defineConfig, bindings, exports as workerExports, triggers} from 'cf/config';

// Production values are supplied by CI secrets, never committed to this repository.
const workerName = process.env.PAYO_WORKER_NAME || 'payo-monitor';

export default defineConfig({
  accountId:process.env.CLOUDFLARE_ACCOUNT_ID || 'YOUR_CLOUDFLARE_ACCOUNT_ID',
  worker:{
    name:workerName,
    entrypoint:'./src/index.js',
    compatibilityDate:'2026-10-25',
    workersDev:true,
    previewUrls:false,
    env:{
      APP_URL:bindings.text(process.env.PAYO_APP_URL || 'https://payo-monitor.YOUR_SUBDOMAIN.workers.dev/app'),
      OWNER_ID:bindings.text(process.env.PAYO_OWNER_ID || 'YOUR_TELEGRAM_USER_ID'),
      DIRECTORY:bindings.durableObject({worker:workerName,exportName:'Directory'}),
      REGISTRY:bindings.durableObject({worker:workerName,exportName:'Registry'}),
      TARGETS:bindings.durableObject({worker:workerName,exportName:'Target'}),
      TELEGRAM_BOT_TOKEN:bindings.secret(),
      WEBHOOK_SECRET:bindings.secret(),
      ADMIN_SECRET:bindings.secret(),
      WATCHDOG_PING_URL:bindings.secret(),
    },
    exports:{Directory:workerExports.durableObject({storage:'sqlite'}),Registry:workerExports.durableObject({storage:'sqlite'}),Target:workerExports.durableObject({storage:'sqlite'})},
    triggers:[triggers.scheduled({schedule:'*/10 * * * *'}),triggers.scheduled({schedule:'30 14 * * *'})],
    observability:{enabled:true,headSamplingRate:0.1,redactQueryString:true,traces:{enabled:true,headSamplingRate:0.1}},
  },
});
