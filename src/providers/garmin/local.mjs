import { GarminProtocol } from './protocol.mjs';
import { readMinimal } from './session.mjs';

export async function authenticateGarmin({store,promptSecret,promptText,transport,now=Date.now}) {
  const provider=new GarminProtocol({fetchImpl:transport,now});
  return store.withLock(async()=>{
    if(await store.load())throw new Error('CONNECTION_ALREADY_EXISTS');
    const username=await promptText('Garmin international account email: ');
    let password=await promptSecret('Garmin password (not saved): '),state;
    try {state=await provider.login({username,password});}finally{password=null;}
    if(state.kind==='pending_mfa')state=await provider.completeMFA(state,await promptSecret('Garmin MFA code: '));
    if(state.kind!=='di')throw new Error('INCOMPLETE_LOGIN');
    await store.save({version:1,phase:'idle',revision:1,state});
    return {connected:true,provider:'garmin',realDataRead:false};
  });
}
export async function readLocalGarmin({store,transport,days,timeZone='Asia/Manila',now=Date.now(),clock=()=>performance.now()}) {
  return store.withLock(async()=>{
    const provider=new GarminProtocol({fetchImpl:transport,now:()=>now});
    const session={
      async load(){const v=await store.load();if(!v)throw Error('CONNECTION_REQUIRED');if(v.phase!=='idle')throw Error('REFRESH_BLOCKED');return {state:v.state,revision:v.revision};},
      async refresh(revision,options={}){
        const v=await store.load();if(!v||v.phase!=='idle'||v.revision!==revision)throw Error('REFRESH_BLOCKED');
        const clock=options.clock??(()=>performance.now());
        const remaining=()=>Math.min(options.timeoutMs??20000,Math.ceil((options.deadline??Infinity)-clock()));
        if(remaining()<1)throw Error('READ_TIME_LIMIT');
        // Persist before dispatch. An ambiguous outcome is deliberately not retried.
        await store.save({...v,phase:'dispatched'});
        try {const timeoutMs=remaining();if(timeoutMs<1)throw Error('READ_TIME_LIMIT');const state=await provider.refresh(v.state,{...options,timeoutMs});await store.save({...v,state,revision:revision+1,phase:'idle'});return {state,revision:revision+1};}
        catch {throw Error('REFRESH_UNCERTAIN_RECONNECT_REQUIRED');}
      }
    };
    const value=await readMinimal({session,provider,days,timeZone,now,clock});
    value.heartRateCoverage='Synced discrete wear-time samples; not continuous or proof of full-day coverage';
    return value;
  });
}
