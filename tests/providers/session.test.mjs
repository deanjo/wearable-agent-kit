import test from 'node:test';
import assert from 'node:assert/strict';
import { CredentialSession, readMinimal, allowedDays } from '../../src/providers/garmin/session.mjs';
import { SafeError } from '../../src/providers/garmin/errors.mjs';
import { sqlStore, fixtureVault, STATE, OWNER, NOW } from './helpers.mjs';

test('vault binds owner/purpose/revision and refuses ciphertext tampering',async()=>{
  const vault=await fixtureVault(), envelope=await vault.seal(STATE,OWNER,'credential',1);
  assert.ok(!envelope.includes(STATE.refreshToken));
  assert.deepEqual(await vault.open(envelope,OWNER,'credential',1),STATE);
  for(const [owner,purpose,revision]of[['other','credential',1],[OWNER,'setup',1],[OWNER,'credential',2]]){
    await assert.rejects(()=>vault.open(envelope,owner,purpose,revision,purpose==='setup'?'synthetic-binding':''),{code:'vault_open_rejected'});
  }
  const bad=JSON.parse(envelope);bad.ciphertext=bad.ciphertext.slice(0,-4)+'AAAA';
  await assert.rejects(()=>vault.open(JSON.stringify(bad),OWNER,'credential',1),{code:'vault_open_rejected'});
});

test('single writer dispatches once and atomically persists rotated pair, surviving a fresh session',async t=>{
  const {store,sqlite}=sqlStore(t),vault=await fixtureVault();let calls=0;
  const provider={async refresh(){calls++;await new Promise(resolve=>setTimeout(resolve,15));return{...STATE,accessToken:'synthetic-access-v2',refreshToken:'synthetic-refresh-v2'};}};
  const options={owner:OWNER,store,vault,provider,now:()=>NOW};
  const s=new CredentialSession(options);await s.saveInitial(STATE);
  const results=await Promise.allSettled(Array.from({length:8},()=>new CredentialSession(options).refresh(1)));
  assert.equal(results.filter(x=>x.status==='fulfilled').length,1);assert.equal(calls,1);
  const next=await new CredentialSession(options).load();assert.equal(next.revision,2);assert.equal(next.state.refreshToken,'synthetic-refresh-v2');
  const raw=JSON.stringify(sqlite.prepare('SELECT * FROM owner_credentials').get());
  assert.ok(!raw.includes('synthetic-access'));assert.ok(!raw.includes('synthetic-refresh'));
});

test('uncertain refresh blocks durably; future requests cannot reuse old refresh token',async t=>{
  const {store}=sqlStore(t),vault=await fixtureVault();let calls=0;
  const provider={async refresh(){calls++;throw Error('possibly consumed synthetic refresh token');}};
  const options={owner:OWNER,store,vault,provider,now:()=>NOW};
  const s=new CredentialSession(options);await s.saveInitial(STATE);
  await assert.rejects(()=>s.refresh(1),{code:'refresh_uncertain_stop'});
  assert.equal((await store.getCredential(OWNER)).phase,'blocked');
  await assert.rejects(()=>new CredentialSession(options).load(),{code:'credential_refresh_blocked'});
  assert.equal(await store.acquireRefresh(OWNER,1,'other',NOW+99999999,NOW+100000000),false);
  assert.equal(calls,1);
});

test('storage failure before dispatch sends no refresh',async t=>{
  const {store}=sqlStore(t),vault=await fixtureVault();let calls=0;
  await new CredentialSession({owner:OWNER,store,vault,provider:{}}).saveInitial(STATE);
  const blocked=new Proxy(store,{get(target,key){if(key==='markDispatched')return async()=>{throw Error('storage failed');};const v=target[key];return typeof v==='function'?v.bind(target):v;}});
  const s=new CredentialSession({owner:OWNER,store:blocked,vault,provider:{async refresh(){calls++;return STATE;}},now:()=>NOW});
  await assert.rejects(()=>s.refresh(1));assert.equal(calls,0);assert.equal((await store.getCredential(OWNER)).phase,'idle');
});

test('read retries only after 401, once, and minimizes output fields',async t=>{
  const {store}=sqlStore(t),vault=await fixtureVault();let profileCalls=0,refreshCalls=0;
  const provider={async profile(state){profileCalls++;if(state.accessToken===STATE.accessToken)throw new SafeError('provider_authentication_stop',401);return'synthetic.owner';},
    async refresh(){refreshCalls++;return{...STATE,accessToken:'synthetic-access-v2'};},
    async activitiesPage(state,startDate,endDate,start){if(start)return[];return[{activityId:1,activityName:'private-name',averageHR:130,maxHR:160,duration:120,distance:30,activityType:{typeKey:'running'},startTimeLocal:'2026-10-18 09:00:00',gps:'private-route'}];},
    async dailyHeartRate(){return{heartRateValues:[[1792314000000,70],[1792314060000,null]],calendarDate:'2026-10-18',userProfilePK:'private-id'};}};
  const session=new CredentialSession({owner:OWNER,store,vault,provider,now:()=>NOW});await session.saveInitial(STATE);
  const data=await readMinimal({session,provider,days:['2026-10-18'],now:NOW,timeZone:'UTC'});
  assert.equal(refreshCalls,1);assert.equal(profileCalls,2);assert.equal(data.heartRate[0].sampleCount,2);
  for(const value of ['private-name','private-route','private-id'])assert.ok(!JSON.stringify(data).includes(value));assert.ok(!JSON.stringify(data).includes('synthetic-access'));
});

test('seven-day boundary uses configured owner timezone and rejects future/old/duplicate dates',()=>{
  assert.deepEqual(allowedDays(['2026-10-13','2026-10-19'],{now:NOW}),['2026-10-13','2026-10-19']);
  for(const days of [['2026-10-12'],['2026-10-20'],['2026-10-18','2026-10-18'],[],['2026-02-30']])assert.throws(()=>allowedDays(days,{now:NOW}),{code:'invalid_date_range'});
  const early=Date.parse('2026-10-19T00:30:00Z');
  assert.throws(()=>allowedDays(['2026-10-19'],{now:early,timeZone:'America/Los_Angeles'}),{code:'invalid_date_range'});
});

test('provider activities outside requested dates stop rather than leak older activity',async t=>{
  const {store}=sqlStore(t),vault=await fixtureVault();
  const provider={async profile(){return'synthetic.owner';},async activitiesPage(){return[{activityId:1,startTimeLocal:'2025-01-01 00:00:00'}];},async dailyHeartRate(){return{calendarDate:'2026-10-18',heartRateValues:null};}};
  const session=new CredentialSession({owner:OWNER,store,vault,provider});await session.saveInitial(STATE);
  await assert.rejects(()=>readMinimal({session,provider,days:['2026-10-18'],now:NOW,timeZone:'UTC'}),{code:'provider_activity_date_out_of_scope'});
});

test('lost commit response never loses a durably persisted new credential generation',async t=>{
  const {store}=sqlStore(t),vault=await fixtureVault();let calls=0;
  await new CredentialSession({owner:OWNER,store,vault,provider:{}}).saveInitial(STATE);
  const uncertain=new Proxy(store,{get(target,key){if(key==='commitRefresh')return async(...args)=>{await target.commitRefresh(...args);throw Error('response lost');};const v=target[key];return typeof v==='function'?v.bind(target):v;}});
  const provider={async refresh(){calls++;return{...STATE,accessToken:'synthetic-access-v2',refreshToken:'synthetic-refresh-v2'};}};
  await assert.rejects(()=>new CredentialSession({owner:OWNER,store:uncertain,vault,provider,now:()=>NOW}).refresh(1),{code:'refresh_uncertain_stop'});
  const cold=await new CredentialSession({owner:OWNER,store,vault,provider}).load();
  assert.equal(cold.revision,2);assert.equal(cold.state.refreshToken,'synthetic-refresh-v2');assert.equal(calls,1);
  assert.equal(await store.acquireRefresh(OWNER,1,'stale',NOW,NOW+1000),false);
});

for(const [name,payload]of[
  ['wrong calendar date',{calendarDate:'2000-01-01',heartRateValues:[[946684800000,80]]}],
  ['out-of-date samples',{calendarDate:'2026-10-18',heartRateValues:[[946684800000,80]]}],
  ['missing schema',{}],
  ['missing samples',{calendarDate:'2026-10-18'}],
  ['huge maximum',{calendarDate:'2026-10-18',heartRateValues:[],maxHeartRate:1e99}],
  ['negative minimum',{calendarDate:'2026-10-18',heartRateValues:[],minHeartRate:-10}],
])test(`HR rejects ${name} without labeling it successful data`,async t=>{
  const{store}=sqlStore(t),vault=await fixtureVault();
  const provider={async profile(){return'owner';},async activitiesPage(){return[];},async dailyHeartRate(){return payload;}};
  const session=new CredentialSession({owner:OWNER,store,vault,provider});await session.saveInitial(STATE);
  await assert.rejects(()=>readMinimal({session,provider,days:['2026-10-18'],now:NOW,timeZone:'UTC'}),{code:'provider_heart_rate_shape_changed'});
});

test('explicit no-sample HR differs from missing schema',async t=>{
  const{store}=sqlStore(t),vault=await fixtureVault();
  const provider={async profile(){return'owner';},async activitiesPage(){return[];},async dailyHeartRate(){return{calendarDate:'2026-10-18',heartRateValues:null};}};
  const session=new CredentialSession({owner:OWNER,store,vault,provider});await session.saveInitial(STATE);
  const result=await readMinimal({session,provider,days:['2026-10-18'],now:NOW,timeZone:'UTC'});
  assert.equal(result.heartRate[0].coverage,'no_samples');assert.equal(result.heartRate[0].sampleCount,0);
});
