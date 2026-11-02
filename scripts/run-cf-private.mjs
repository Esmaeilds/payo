import {spawnSync} from 'node:child_process';

// Cloudflare can abbreviate bindings and URLs. Exact-value CI masking alone
// cannot reliably hide those shortened values, so never forward CLI output.
const args=process.argv.slice(2);
if(!['build','deploy'].includes(args[0]))throw new Error('Unsupported Cloudflare command.');
const result=spawnSync('npx',['--no-install','cf',...args],{env:process.env,encoding:'utf8',maxBuffer:10*1024*1024});
if(result.error||result.status!==0){
  console.error('Cloudflare '+args[0]+' failed. Private CLI output was suppressed.');
  process.exitCode=1;
} else console.log('Cloudflare '+args[0]+' completed successfully.');
