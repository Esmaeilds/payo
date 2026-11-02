import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validateDeploymentEnv} from '../scripts/check-deploy-env.mjs';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

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
test('private Cloudflare output stays out of logs on success and failure',()=>{
  const folder=mkdtempSync(join(tmpdir(),'payo-private-cli-'));
  try{
    for(const status of [0,1]){
      writeFileSync(join(folder,'npx'),'#!/bin/sh\necho "PRIVATE_SETTING_VALUE"\necho "SHORTENED_PRIVATE_URL" >&2\nexit '+status+'\n',{mode:0o755});
      const result=spawnSync(process.execPath,[fileURLToPath(new URL('../scripts/run-cf-private.mjs',import.meta.url)),'build'],{env:{...process.env,PATH:folder+':'+process.env.PATH},encoding:'utf8'});
      assert.equal(result.status,status);
      assert(!result.stdout.includes('PRIVATE_'));assert(!result.stderr.includes('PRIVATE_'));
    }
  } finally {rmSync(folder,{recursive:true,force:true});}
});
