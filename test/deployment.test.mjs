import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validateDeploymentEnv} from '../scripts/check-deploy-env.mjs';

const sample={CLOUDFLARE_API_TOKEN:'test-token',CLOUDFLARE_ACCOUNT_ID:'a'.repeat(32),PAYO_WORKER_NAME:'example-monitor',PAYO_OWNER_ID:'123',PAYO_APP_URL:'https://example-monitor.example.workers.dev/app'};
test('deploy rejects missing configuration without revealing values',()=>{
  assert.doesNotThrow(()=>validateDeploymentEnv(sample));
  for(const name of Object.keys(sample)){
    const invalid={...sample,[name]:''};
    assert.throws(()=>validateDeploymentEnv(invalid),error=>error.message.includes(name)&&!error.message.includes('test-token')&&!error.message.includes(sample.PAYO_APP_URL));
  }
});
test('deploy rejects non-HTTPS or credential-bearing app URLs',()=>{
  for(const url of ['http://example.com/app','https://user:password@example.com/app','https://example.com/other','https://example.com/app?token=private'])assert.throws(()=>validateDeploymentEnv({...sample,PAYO_APP_URL:url}));
});
