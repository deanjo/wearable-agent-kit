import test from 'node:test';
import assert from 'node:assert/strict';
import { collectActivityPages, ACTIVITY_LIMITS } from '../../src/providers/garmin/activity-pages.mjs';
import { readMinimal, CredentialSession } from '../../src/providers/garmin/session.mjs';
import { GarminProtocol } from '../../src/providers/garmin/protocol.mjs';
import { SafeError } from '../../src/providers/garmin/errors.mjs';
import { sqlStore, fixtureVault, STATE, OWNER, NOW, json } from './helpers.mjs';
const DAY='2026-10-18';
const activity=(id,day=DAY,extra={})=>({activityId:id,startTimeLocal:`${day} 09:00:00`,activityType:{typeKey:'running'},duration:1800,distance:5000,averageHR:130,maxHR:160,...extra});
const collect=(pages,options={})=>{
  const calls=[];
  const promise=collectActivityPages({days:[DAY],clock:()=>0,...options,readPage:async args=>{args.beforeAttempt();calls.push(args);const page=pages.shift();if(page instanceof Error)throw page;return typeof page==='function'?page(args):page;}});
  return{promise,calls};
};

test('multiple short pages continue to an empty page and retain only original seven fields',async()=>{
  const{promise,calls}=collect([[activity(1,DAY,{activityName:'private name',gps:'private route',userProfileId:'private id'}),activity(2)],[activity(3)],[]]);
  const result=await promise;assert.equal(result.activities.length,3);assert.equal(result.activityCoverage,'api_pagination_exhausted');
  assert.deepEqual(calls.map(c=>c.start),[0,2,3]);assert.equal(result.activityPagination.exhaustedRanges,1);
  assert.equal(result.activityPagination.deviceSyncCompleteness,'unknown');assert.equal(result.activityPagination.snapshotConsistency,'not_guaranteed');
  for(const a of result.activities)assert.deepEqual(Object.keys(a).sort(),['activityId','activityType','averageHeartRate','distanceMeters','durationSeconds','maximumHeartRate','startTimeLocal']);
  assert.ok(!JSON.stringify(result).includes('private'));
});

test('full page then overlap and more activities deduplicates IDs across pages',async()=>{
  const page=Array.from({length:20},(_,i)=>activity(i+1));const{promise}=collect([page,[activity(20),activity(21),activity(22)],[]]);
  const result=await promise;assert.equal(result.activities.length,22);assert.equal(result.activityPagination.duplicatesRemoved,1);assert.equal(result.activityPagination.recordsScanned,23);
});

test('non-contiguous dates become separate exact ranges, never an unrequested middle day',async()=>{
  const{promise,calls}=collect([[activity(1,'2026-10-13')],[],[activity(2,'2026-10-16'),activity(3,'2026-10-15')],[]],{days:['2026-10-13','2026-10-15','2026-10-16']});
  const result=await promise;assert.deepEqual(calls.map(c=>[c.startDate,c.endDate,c.start]),[['2026-10-13','2026-10-13',0],['2026-10-13','2026-10-13',1],['2026-10-15','2026-10-16',0],['2026-10-15','2026-10-16',2]]);
  assert.equal(result.activityPagination.exhaustedRanges,2);assert.deepEqual(result.activities.map(a=>a.activityId),[2,3,1]);
});

for(const[reason,pages]of[
  ['repeated_page',[[activity(1),activity(2)],[activity(2),activity(1)]]],
  ['no_progress',[[activity(1),activity(2)],[activity(1)]]],
  ['conflicting_activity',[[activity(1)],[activity(1,DAY,{duration:999})]]],
])test(`${reason} stops with explicit incomplete coverage and bounded partial data`,async()=>{
  const{promise,calls}=collect(pages);const result=await promise;
  assert.equal(result.activityCoverage,'incomplete');assert.equal(result.activityPagination.reason,reason);assert.equal(calls.length,2);assert.equal(result.activityPagination.exhaustedRanges,0);
});

test('within-page duplicates are deduplicated and a later empty page is still required',async()=>{
  const{promise,calls}=collect([[activity(1),activity(1)],[]]);const result=await promise;assert.equal(result.activities.length,1);assert.equal(result.activityPagination.duplicatesRemoved,1);assert.equal(calls.length,2);
});

test('record cap and page-request cap return incomplete rather than silently truncating',async()=>{
  let run=collect(Array.from({length:10},(_,p)=>Array.from({length:20},(_,i)=>activity(p*20+i+1))));
  let result=await run.promise;assert.equal(result.activities.length,200);assert.equal(result.activityPagination.reason,'record_limit');assert.equal(run.calls.length,10);
  run=collect(Array.from({length:10},(_,i)=>[activity(i+1)]));result=await run.promise;
  assert.equal(result.activities.length,10);assert.equal(result.activityPagination.reason,'page_limit');assert.equal(run.calls.length,10);
});

test('elapsed budget stops after a slow page and never claims its empty response exhausted',async()=>{
  let now=0;
  const{promise,calls}=collect([[activity(1)],()=>{now=30001;return[];}],{clock:()=>now});
  const result=await promise;assert.equal(result.activities.length,1);assert.equal(result.activityPagination.reason,'time_limit');assert.equal(result.activityPagination.exhaustedRanges,0);assert.equal(calls.length,2);
});

test('budget already exhausted makes zero page requests',async()=>{
  const{promise,calls}=collect([],{overallDeadline:0});const result=await promise;assert.equal(result.activityPagination.reason,'time_limit');assert.equal(calls.length,0);
});

for(const[label,page,code]of[
  ['old date',[activity(1,'2020-01-01')],'provider_activity_date_out_of_scope'],
  ['unrequested middle day',[activity(1,'2026-10-14')],'provider_activity_date_out_of_scope'],
  ['missing ID',[{startTimeLocal:DAY+' 09:00:00'}],'provider_activities_shape_changed'],
  ['non-safe ID',[activity(Number.MAX_SAFE_INTEGER+1)],'provider_activities_shape_changed'],
  ['invalid local time',[activity(1,DAY,{startTimeLocal:DAY+' 99:99:99'})],'provider_activities_shape_changed'],
  ['unknown object',{error:'unknown'},'provider_activities_shape_changed'],
  ['oversized page',Array.from({length:21},(_,i)=>activity(i+1)),'provider_activities_shape_changed'],
])test(`${label} is rejected before projection`,async()=>{
  const{promise}=collect([page]);await assert.rejects(()=>promise,{code});
});

async function integration(t,activityResponse){
  const{store}=sqlStore(t),vault=await fixtureVault(),calls=[];
  const provider=new GarminProtocol({now:()=>NOW,fetchImpl:async(url,init)=>{
    const u=new URL(url);calls.push({u,init});
    if(u.pathname==='/userprofile-service/socialProfile')return json({displayName:'synthetic.owner'});
    if(u.pathname.includes('/dailyHeartRate/'))return json({calendarDate:DAY,heartRateValues:null});
    if(u.pathname==='/di-oauth2-service/oauth/token')return json({access_token:'synthetic-access-v2',refresh_token:'synthetic-refresh-v2'});
    if(u.pathname==='/activitylist-service/activities/search/activities')return activityResponse(u,init);
    throw Error('unexpected synthetic request');
  }});
  const session=new CredentialSession({owner:OWNER,store,vault,provider,now:()=>NOW});await session.saveInitial(STATE);
  return{calls,provider,session,store,run:()=>readMinimal({session,provider,days:[DAY],now:NOW,timeZone:'Asia/Manila'})};
}

test('401 midway through pages refreshes once, retries only failed page, and persists revision2',async t=>{
  let rejected=false;const f=await integration(t,(u,init)=>{const start=Number(u.searchParams.get('start'));if(start===0)return json([activity(1)]);if(start===1&&!rejected){rejected=true;return json({}, {},401);}if(start===1){assert.equal(init.headers.get('authorization'),'Bearer synthetic-access-v2');return json([activity(2)]);}return json([]);});
  const result=await f.run();assert.equal(result.activities.length,2);assert.equal(result.activityCoverage,'api_pagination_exhausted');assert.equal(result.activityPagination.pageRequests,4);
  assert.deepEqual(f.calls.filter(c=>c.u.pathname.includes('/activities/search/')).map(c=>c.u.searchParams.get('start')),['0','1','1','2']);
  assert.equal(f.calls.filter(c=>c.u.hostname==='diauth.garmin.com').length,1);assert.equal((await f.store.getCredential(OWNER)).revision,2);
  for(const c of f.calls.filter(c=>c.u.pathname.includes('/activities/search/'))){assert.equal(c.init.method,'GET');assert.equal(c.u.searchParams.get('limit'),'20');assert.equal(c.init.redirect,'manual');assert.equal(c.init.headers.get('cookie'),null);}
});

test('a second 401 stops without another refresh or relogin',async t=>{
  const f=await integration(t,()=>json({}, {},401));await assert.rejects(()=>f.run(),{code:'provider_authentication_stop'});
  assert.equal(f.calls.filter(c=>c.u.hostname==='diauth.garmin.com').length,1);assert.equal(f.calls.filter(c=>c.u.pathname.includes('/activities/search/')).length,2);assert.ok(f.calls.every(c=>c.u.hostname!=='sso.garmin.com'));
});

for(const[label,response,code]of[
  ['429',()=>json({}, {},429),'provider_rate_limited_stop'],
  ['403',()=>json({}, {},403),'provider_challenge_stop'],
  ['CAPTCHA',()=>json({responseStatus:{type:'CAPTCHA_REQUIRED'}}),'provider_challenge_stop'],
  ['unknown JSON',()=>json({unexpected:true}),'provider_activities_shape_changed'],
])test(`${label} at a later page stops without refresh, retry or fallback`,async t=>{
  const f=await integration(t,u=>u.searchParams.get('start')==='0'?json([activity(1)]):response());
  await assert.rejects(()=>f.run(),{code});assert.equal(f.calls.filter(c=>c.u.pathname.includes('/activities/search/')).length,2);assert.ok(f.calls.every(c=>c.u.hostname==='connectapi.garmin.com'));
});

test('page API rejects arbitrary offsets and enforces fixed page size/maximum offset',async()=>{
  let calls=0;const p=new GarminProtocol({fetchImpl:async()=>{calls++;return json([]);}});
  for(const start of [-1,1.5,200,Infinity,'20'])await assert.rejects(()=>p.activitiesPage(STATE,DAY,DAY,start),{code:'invalid_activity_page'});
  assert.equal(calls,0);await p.activitiesPage(STATE,DAY,DAY,199);assert.equal(calls,1);assert.equal(ACTIVITY_LIMITS.pageSize,20);
});

test('row offsets never skip later data when backend returns short pages',async()=>{
  const all=[activity(1),activity(2),activity(3),activity(4)],starts=[];
  const result=await collectActivityPages({days:[DAY],clock:()=>0,readPage:async({start,beforeAttempt})=>{
    beforeAttempt();starts.push(start);return all.slice(start,start+2);
  }});
  assert.deepEqual(starts,[0,2,4]);assert.equal(result.activities.length,4);
  assert.equal(result.activityCoverage,'api_pagination_exhausted');
});

for(const stage of ['acquireRefresh','getCredential','vaultOpen','markDispatched'])test(`refresh budget expires during ${stage}: no provider dispatch and safe lease phase`,async t=>{
  const {store}=sqlStore(t),vault=await fixtureVault();let elapsed=0,calls=0,dispatchMarks=0;
  await new CredentialSession({owner:OWNER,store,vault,provider:{}}).saveInitial(STATE);
  const slowStore=new Proxy(store,{get(target,key){
    const value=target[key];if(typeof value!=='function')return value;
    return async(...args)=>{const result=await value.apply(target,args);if(key==='markDispatched')dispatchMarks++;if(key===stage)elapsed=30001;return result;};
  }});
  const slowVault=new Proxy(vault,{get(target,key){const value=target[key];if(typeof value!=='function')return value;return async(...args)=>{const result=await value.apply(target,args);if(key==='open'&&stage==='vaultOpen')elapsed=30001;return result;};}});
  const session=new CredentialSession({owner:OWNER,store:slowStore,vault:slowVault,provider:{async refresh(){calls++;return STATE;}},now:()=>NOW});
  await assert.rejects(()=>session.refresh(1,{timeoutMs:20000,deadline:30000,clock:()=>elapsed}),{code:'read_time_limit'});
  assert.equal(calls,0);assert.equal(dispatchMarks,stage==='markDispatched'?1:0);
  assert.equal((await store.getCredential(OWNER)).phase,stage==='markDispatched'?'blocked':'idle');
});

test('slow refresh storage reduces HTTP budget and successful rotation still commits after deadline',async t=>{
  const {store}=sqlStore(t),vault=await fixtureVault();let elapsed=0,calls=0;
  await new CredentialSession({owner:OWNER,store,vault,provider:{}}).saveInitial(STATE);
  const slowStore=new Proxy(store,{get(target,key){const value=target[key];if(typeof value!=='function')return value;return async(...args)=>{const result=await value.apply(target,args);if(key==='markDispatched')elapsed=29000;if(key==='commitRefresh')elapsed=40000;return result;};}});
  const provider={async refresh(state,{timeoutMs}){calls++;assert.equal(timeoutMs,1000);return{...state,accessToken:'synthetic-access-v2',refreshToken:'synthetic-refresh-v2'};}};
  const result=await new CredentialSession({owner:OWNER,store:slowStore,vault,provider,now:()=>NOW}).refresh(1,{timeoutMs:20000,deadline:30000,clock:()=>elapsed});
  assert.equal(calls,1);assert.equal(result.revision,2);assert.equal((await store.getCredential(OWNER)).phase,'idle');
});

test('a 401 replay consumes the page-request cap and cannot send an eleventh activity request',async t=>{
  let first=true;const f=await integration(t,u=>{if(first){first=false;return json({}, {},401);}return json([activity(Number(u.searchParams.get('start'))+1)]);});
  const result=await f.run();assert.equal(result.activityPagination.reason,'page_limit');assert.equal(result.activityPagination.pageRequests,10);assert.equal(result.activities.length,9);
  assert.equal(f.calls.filter(c=>c.u.pathname.includes('/activities/search/')).length,10);assert.equal(f.calls.filter(c=>c.u.hostname==='diauth.garmin.com').length,1);
});

test('a row from another requested segment still fails the exact current range',async()=>{
  const {promise}=collect([[activity(1,'2026-10-16')]],{days:['2026-10-13','2026-10-16']});
  await assert.rejects(()=>promise,{code:'provider_activity_date_out_of_scope'});
});

test('outbound page timeout aborts transport and uses a fixed redacted error',async()=>{
  const keepAlive=setTimeout(()=>{},1000);
  try{
    const p=new GarminProtocol({fetchImpl:async(_url,{signal})=>new Promise((resolve,reject)=>{
      signal.addEventListener('abort',()=>reject(Error('synthetic-secret transport error')),{once:true});
    })});
    await assert.rejects(()=>p.activitiesPage(STATE,DAY,DAY,0,{timeoutMs:1}),error=>error.code==='provider_timeout_stop'&&!error.message.includes('synthetic-secret'));
  }finally{clearTimeout(keepAlive);}
});

test('descending time order treats ISO T and space separators equivalently',async()=>{
  const {promise}=collect([[activity(1,DAY,{startTimeLocal:DAY+'T09:00:00'}),activity(2,DAY,{startTimeLocal:DAY+' 20:00:00'})],[]]);
  assert.deepEqual((await promise).activities.map(a=>a.activityId),[2,1]);
});
