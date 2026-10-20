import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { openSecretStore } from './core/storage/secret-store.mjs';
import { writeCheckpoint,readCheckpoint,assertCheckpointOutsideState } from './core/storage/checkpoint.mjs';
import { promptSecret,promptText } from './core/prompt.mjs';
import { wrapSummary,yesterday } from './core/contracts.mjs';
import { describeData } from './analysis/summary.mjs';
import { serveMcp } from './mcp/server.mjs';
import { authenticateGarmin,readLocalGarmin } from './providers/garmin/local.mjs';

function argumentsOf(args){const options={};for(let i=0;i<args.length;i++){const k=args[i];if(['--live','--accept-provider-terms'].includes(k)){options[k]=true;continue;}if(!['--provider','--state-dir','--output','--checkpoint','--timezone','--day'].includes(k)||!args[i+1]||args[i+1].startsWith('--')||Object.hasOwn(options,k))throw Error('INVALID_ARGUMENTS');options[k]=args[++i];}return options;}
async function main(){
  const [command,...args]=process.argv.slice(2),o=argumentsOf(args);
  if(!['auth','collect','read','mcp'].includes(command))throw Error('COMMAND_REQUIRED');
  // WHOOP data exports need an encrypted-at-rest design, not plaintext checkpoints.
  if(o['--live']&&o['--provider']==='whoop'&&o['--output']&&['collect','read'].includes(command))throw Error('WHOOP_PLAINTEXT_EXPORT_UNSUPPORTED');
  // A day selects Garmin's local-date query only; never silently ignore it.
  if(o['--day']!==undefined&&(!o['--live']||o['--provider']!=='garmin'||command==='auth'||o['--checkpoint']))throw Error('DAY_OPTION_REQUIRES_LIVE_GARMIN_READ');
  if(o['--output']&&o['--state-dir'])await assertCheckpointOutsideState(o['--output'],o['--state-dir']);
  const timeZone=o['--timezone']??'Asia/Manila';new Intl.DateTimeFormat('en',{timeZone});
  if(command==='read'&&o['--checkpoint']){console.log(JSON.stringify(await readCheckpoint(resolve(o['--checkpoint'])),null,2));return;}
  let store,provider=o['--provider'];
  if(command==='auth'||o['--live']){
    if(!['garmin','whoop'].includes(provider)||!o['--state-dir'])throw Error('PROVIDER_AND_STATE_DIRECTORY_REQUIRED');
    if(command==='auth'&&!o['--accept-provider-terms'])throw Error('REVIEW_PROVIDER_TERMS_THEN_USE_ACCEPT_PROVIDER_TERMS');
    store=await openSecretStore({directory:resolve(o['--state-dir']),namespace:provider,passphrase:await promptSecret('Local vault passphrase (12+ characters; not saved): ')});
  }
  if(command==='auth'){
    const auth=provider==='garmin'?authenticateGarmin:(await import('./providers/whoop/local.mjs')).authenticateWhoop;
    const result=await auth({store,promptSecret,promptText,transport:fetch});console.log(JSON.stringify(result));return;
  }
  const read=async()=>{
    const now=Date.now();let data;
    if(o['--live']){
      data=provider==='garmin'?await readLocalGarmin({store,transport:fetch,days:[o['--day']??yesterday(now,timeZone)],timeZone,now}):await (await import('./providers/whoop/local.mjs')).readLocalWhoop({store,transport:fetch,now});
    }else{data=JSON.parse(await readFile(new URL('../tests/fixtures/synthetic.json',import.meta.url),'utf8'));}
    return {...wrapSummary({mode:o['--live']?'live':'synthetic',provider:o['--live']?provider:'combined-fixture',data,now,timeZone}),analysis:describeData(data)};
  };
  if(command==='mcp'){await serveMcp(read);return;}
  const result=await read();if(o['--output']){if(o['--state-dir'])await assertCheckpointOutsideState(o['--output'],o['--state-dir']);await writeCheckpoint(resolve(o['--output']),result);}console.log(JSON.stringify(result,null,2));
}
main().catch(error=>{const code=error?.code??error?.message;process.stderr.write(JSON.stringify({error:typeof code==='string'&&/^[A-Za-z][A-Za-z0-9_]{2,80}$/.test(code)?code:'OPERATION_FAILED'})+'\n');process.exitCode=1;});
