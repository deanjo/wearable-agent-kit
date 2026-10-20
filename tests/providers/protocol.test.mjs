import test from 'node:test';
import assert from 'node:assert/strict';
import { GarminProtocol } from '../../src/providers/garmin/protocol.mjs';
import { NOW, STATE, json, sequence } from './helpers.mjs';
const success=()=>json({responseStatus:{type:'SUCCESSFUL'},serviceTicketId:'synthetic-ticket'});
const tokens=()=>json({access_token:STATE.accessToken,refresh_token:STATE.refreshToken});
const profile=()=>json({displayName:'synthetic.owner',fullName:'not-exposed'});
const credentials={username:'synthetic@example.invalid',password:'synthetic-password-only'};

test('source-derived minimal login, ticket exchange, profile, 1 activity and daily HR requests',async()=>{
  const mock=sequence([success(),tokens(),profile(),json([{activityId:1}]),json({calendarDate:'2026-10-18',heartRateValues:[[1,65]]})]);
  const p=new GarminProtocol({fetchImpl:mock.fetchImpl,now:()=>NOW});
  const state=await p.login(credentials);
  assert.deepEqual(state,STATE);
  assert.deepEqual(await p.activitiesPage(state,'2026-10-18','2026-10-18',0),[{activityId:1}]);
  await p.dailyHeartRate(state,'2026-10-18','synthetic.owner');
  const login=new URL(mock.calls[0].url);
  assert.equal(login.origin,'https://sso.garmin.com');assert.equal(login.pathname,'/mobile/api/login');
  assert.deepEqual(Object.fromEntries(login.searchParams),{clientId:'GCM_IOS_DARK',locale:'en-US',service:'https://mobile.integration.garmin.com/gcm/ios'});
  assert.deepEqual(JSON.parse(mock.calls[0].init.body),{...credentials,rememberMe:true,captchaToken:''});
  assert.equal(mock.calls[1].url,'https://diauth.garmin.com/di-oauth2-service/oauth/token');
  assert.equal(mock.calls[1].init.body.get('service_url'),login.searchParams.get('service'));
  assert.equal(mock.calls[1].init.body.get('service_ticket'),'synthetic-ticket');
  assert.equal(mock.calls[1].init.headers.get('Authorization'),'Basic '+btoa(STATE.clientId+':'));
  assert.equal(mock.calls[3].url,'https://connectapi.garmin.com/activitylist-service/activities/search/activities?start=0&limit=20&startDate=2026-10-18&endDate=2026-10-18');
  assert.equal(mock.calls[4].url,'https://connectapi.garmin.com/wellness-service/wellness/dailyHeartRate/synthetic.owner?date=2026-10-18');
  for(const {url,init} of mock.calls){assert.equal(new URL(url).protocol,'https:');assert.equal(init.redirect,'manual');assert.equal(init.credentials,'omit');assert.equal(init.cache,'no-store');}
  assert.equal(mock.items.length,0);
});

test('MFA resumes same mobile flow; SSO cookies never reach DI/API or another login',async()=>{
  const mock=sequence([json({responseStatus:{type:'MFA_REQUIRED'},customerMfaInfo:{mfaLastMethodUsed:'email'}},{'Set-Cookie':'sso_test=synthetic-cookie; Domain=.garmin.com; Path=/; Secure'}),success(),tokens(),profile(),success(),tokens(),profile()]);
  const p=new GarminProtocol({fetchImpl:mock.fetchImpl,now:()=>NOW});
  const pending=await p.login(credentials);
  assert.equal(pending.kind,'pending_mfa');assert.ok(!JSON.stringify(pending).includes(credentials.password));
  await p.completeMFA(pending,'123456');
  assert.equal(new URL(mock.calls[1].url).pathname,'/mobile/api/mfa/verifyCode');
  assert.equal(mock.calls[1].init.headers.get('Cookie'),'sso_test=synthetic-cookie');
  assert.equal(JSON.parse(mock.calls[1].init.body).mfaVerificationCode,'123456');
  for(const c of mock.calls.slice(2))assert.equal(c.init.headers.get('Cookie'),null);
  await p.login(credentials);
  assert.equal(mock.calls[4].init.headers.get('Cookie'),null);
});

for(const [label,response,code] of [
  ['redirect',()=>new Response(null,{status:302,headers:{Location:'https://attacker.invalid'}}),'provider_redirect_stop'],
  ['challenge',()=>json({sensitive:'never expose'}, {},403),'provider_challenge_stop'],
  ['429',()=>json({}, {},429),'provider_rate_limited_stop'],
  ['embedded429',()=>json({error:{'status-code':'429'}}),'provider_rate_limited_stop'],
  ['captcha',()=>json({responseStatus:{type:'CAPTCHA_REQUIRED'}}),'provider_challenge_stop'],
  ['html',()=>new Response('<html>security warning</html>',{headers:{'content-type':'text/html'}}),'provider_non_json_stop'],
  ['wrong password',()=>json({responseStatus:{type:'INVALID_USERNAME_PASSWORD'},leak:'secret'}),'provider_authentication_stop'],
  ['provider down',()=>json({}, {},503),'provider_http_stop'],
])test(`${label} stops without fallback, replay, or provider-body disclosure`,async()=>{
  const mock=sequence([response()]);const p=new GarminProtocol({fetchImpl:mock.fetchImpl});
  await assert.rejects(()=>p.login(credentials),e=>e.code===code&&!String(e).includes('secret'));
  assert.equal(mock.calls.length,1);
});

test('transport exceptions are redacted and never retried',async()=>{
  const mock=sequence([Error('https://bad.invalid?password=synthetic-secret')]);
  await assert.rejects(()=>new GarminProtocol({fetchImpl:mock.fetchImpl}).login(credentials),e=>e.code==='provider_transport_uncertain_stop'&&!String(e).includes('password'));
  assert.equal(mock.calls.length,1);
});

test('foreign-domain SSO cookies are rejected and no DI request is attempted',async()=>{
  const mock=sequence([json({responseStatus:{type:'MFA_REQUIRED'}},{'set-cookie':'x=fake; Domain=attacker.invalid; Path=/'})]);
  await assert.rejects(()=>new GarminProtocol({fetchImpl:mock.fetchImpl}).login(credentials),{code:'provider_cookie_domain_rejected'});
  assert.equal(mock.calls.length,1);
});

test('DI refresh uses blank Basic password and keeps old refresh token only when omitted',async()=>{
  const mock=sequence([json({access_token:'synthetic-access-v2'})]);const p=new GarminProtocol({fetchImpl:mock.fetchImpl});
  assert.deepEqual(await p.refresh(STATE),{...STATE,accessToken:'synthetic-access-v2'});
  assert.deepEqual(Object.fromEntries(mock.calls[0].init.body),{grant_type:'refresh_token',client_id:STATE.clientId,refresh_token:STATE.refreshToken});
  assert.equal(mock.calls[0].init.headers.get('cookie'),null);
});

test('missing refresh token or rejected profile never produces a persistable login',async()=>{
  let mock=sequence([success(),json({access_token:'synthetic-access'})]);
  await assert.rejects(()=>new GarminProtocol({fetchImpl:mock.fetchImpl}).login(credentials),{code:'provider_missing_refresh_token'});
  mock=sequence([success(),tokens(),json({}, {},401)]);
  await assert.rejects(()=>new GarminProtocol({fetchImpl:mock.fetchImpl}).login(credentials),{code:'provider_authentication_stop'});
});

test('profile traversal, dates, and expired MFA are rejected before requests',async()=>{
  const mock=sequence([]);const p=new GarminProtocol({fetchImpl:mock.fetchImpl,now:()=>NOW});
  await assert.rejects(()=>p.dailyHeartRate(STATE,'2026-10-18','..'),{code:'provider_profile_unusable'});
  await assert.rejects(()=>p.dailyHeartRate(STATE,'2026-02-30','ok'),{code:'invalid_date'});
  await assert.rejects(()=>p.completeMFA({kind:'pending_mfa',expiresAt:NOW,method:'email',cookies:[]},'123456'),{code:'invalid_mfa_input'});
  assert.equal(mock.calls.length,0);
});

test('explicit provider error JSON stops even when HTTP status is 200',async()=>{
  const mock=sequence([json({error:{'status-code':'500',message:'private-provider-error'}})]);
  await assert.rejects(()=>new GarminProtocol({fetchImpl:mock.fetchImpl}).dailyHeartRate(STATE,'2026-10-18','owner'),{code:'provider_error_stop'});
});

test('missing or malformed MFA expiry cannot trigger requests',async()=>{
  const mock=sequence([]),p=new GarminProtocol({fetchImpl:mock.fetchImpl,now:()=>NOW});
  for(const expiresAt of [undefined,null,Infinity,NaN,NOW+300001]){
    await assert.rejects(()=>p.completeMFA({kind:'pending_mfa',method:'email',cookies:[],expiresAt},'123456'),{code:'invalid_mfa_input'});
  }
  assert.equal(mock.calls.length,0);
});
