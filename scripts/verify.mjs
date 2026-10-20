import { checkIntegrity } from './check-integrity.mjs';
import { spawnSync } from 'node:child_process';
import { mkdtemp,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const run=args=>{const p=spawnSync(process.execPath,['--import','./scripts/deny-network.mjs',...args],{encoding:'utf8'});if(p.status!==0){process.stderr.write(p.stdout+p.stderr);throw Error('VERIFY_STEP_FAILED');}return p.stdout;};
const dir=await mkdtemp(join(tmpdir(),'wearable-agent-verify-'));
try{const integrity=await checkIntegrity();const tests=run(['--test','--test-reporter=tap','tests/providers/*.test.mjs','tests/acceptance/*.test.mjs']);const path=join(dir,'synthetic-checkpoint.json');const first=JSON.parse(run(['src/cli.mjs','collect','--output',path]));const fresh=JSON.parse(run(['src/cli.mjs','read','--checkpoint',path]));if(JSON.stringify(first)!==JSON.stringify(fresh)||fresh.mode!=='synthetic')throw Error('CHECKPOINT_MISMATCH');console.log(JSON.stringify({verifiedAt:new Date().toISOString(),integrity,tests:tests.split('\n').filter(x=>/^# (tests|pass|fail) /.test(x)),networkDenied:true,syntheticCollection:true,newProcessCheckpointRead:true,liveProviderAcceptance:false},null,2));}finally{await rm(dir,{recursive:true,force:true});}
