import {defineConfig, bindings, exports as workerExports, triggers} from 'cf/config';

export default defineConfig({
  accountId:'YOUR_CLOUDFLARE_ACCOUNT_ID',
  worker:{
    name:'payo-monitor',
    entrypoint:'./src/index.js',
    compatibilityDate:'2026-10-25',
    workersDev:true,
    previewUrls:false,
    env:{
      APP_URL:bindings.text('https://payo-monitor.YOUR_SUBDOMAIN.workers.dev/app'),
      OWNER_ID:bindings.text('YOUR_TELEGRAM_USER_ID'),
      DIRECTORY:bindings.durableObject({worker:'payo-monitor',exportName:'Directory'}),
      REGISTRY:bindings.durableObject({worker:'payo-monitor',exportName:'Registry'}),
      TARGETS:bindings.durableObject({worker:'payo-monitor',exportName:'Target'}),
      TELEGRAM_BOT_TOKEN:bindings.secret(),
      WEBHOOK_SECRET:bindings.secret(),
      ADMIN_SECRET:bindings.secret(),
      WATCHDOG_PING_URL:bindings.secret(),
    },
    exports:{Directory:workerExports.durableObject({storage:'sqlite'}),Registry:workerExports.durableObject({storage:'sqlite'}),Target:workerExports.durableObject({storage:'sqlite'})},
    triggers:[triggers.scheduled({schedule:'*/10 * * * *'}),triggers.scheduled({schedule:'30 8 * * *'})],
    observability:{enabled:true,headSamplingRate:0.1,redactQueryString:true,traces:{enabled:true,headSamplingRate:0.1}},
  },
});
