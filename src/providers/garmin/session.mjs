import { fail, SafeError, exactObject } from './errors.mjs';
import { collectActivityPages } from './activity-pages.mjs';
const envelopeDigest = async envelope => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(envelope))),b=>b.toString(16).padStart(2,'0')).join('');
// A lease is only stealable before dispatch. A timeout/crash after dispatch
// deliberately freezes refresh until explicit recovery rather than reusing a
// possibly consumed refresh token. Token rotation and lease clearing are one CAS.
export class CredentialSession {
  #owner; #store; #vault; #provider; #now;
  constructor({ owner, store, vault, provider, now = Date.now }) {
    this.#owner = owner; this.#store = store; this.#vault = vault; this.#provider = provider; this.#now = now;
  }
  toJSON() { return { kind:'CredentialSession', credentials:'redacted' }; }
  async saveInitial(state) {
    if (state?.kind !== 'di') fail('incomplete_login', 409);
    const envelope = await this.#vault.seal(state, this.#owner, 'credential', 1);
    if (!await this.#store.insertCredential(this.#owner, envelope)) fail('credential_already_present', 409);
    const row = await this.#store.getCredential(this.#owner);
    if (row?.envelope !== envelope || row?.revision !== 1) fail('credential_readback_failed', 503);
    return { connected:true };
  }
  async load() {
    const row = await this.#store.getCredential(this.#owner);
    if (!row) fail('connection_required', 409);
    if (row.phase !== 'idle') fail('credential_refresh_blocked', 409);
    return { state:await this.#vault.open(row.envelope, this.#owner, 'credential', row.revision), revision:row.revision };
  }
  async #readAcceptanceReceipt(row, acceptance) {
    const receipt = await this.#vault.open(acceptance.receipt,this.#owner,'acceptance',2,acceptance.attemptId);
    if (!exactObject(receipt,['kind','trigger','attemptId','startedAt','completedAt','fromRevision','toRevision','envelopeSha256']) ||
        receipt.kind !== 'garmin-refresh-acceptance-v1' || receipt.trigger !== 'owner_activation_acceptance' ||
        receipt.attemptId !== acceptance.attemptId || receipt.startedAt !== acceptance.startedAt ||
        !Number.isSafeInteger(receipt.completedAt) || receipt.completedAt < receipt.startedAt ||
        receipt.fromRevision !== 1 || receipt.toRevision !== 2 ||
        !/^[a-f0-9]{64}$/u.test(receipt.envelopeSha256) || row.revision < 2) fail('acceptance_receipt_rejected',503);
    // Always authenticate the currently stored credential generation. At rev2
    // also verify its exact ciphertext is the generation described by receipt.
    await this.#vault.open(row.envelope,this.#owner,'credential',row.revision);
    if (row.revision === 2 && receipt.envelopeSha256 !== await envelopeDigest(row.envelope)) fail('acceptance_receipt_rejected',503);
    return { accepted:true, ...receipt, currentRevision:row.revision, currentCredentialPhase:row.phase,
      persistence:'atomic_commit_recorded', apiReadVerified:false };
  }
  async runRefreshAcceptanceOnce() {
    let row = await this.#store.getCredential(this.#owner);
    if (!row) fail('connection_required',409);
    const acceptance = await this.#store.getAcceptance(this.#owner);
    if (acceptance?.receipt) return this.#readAcceptanceReceipt(row,acceptance);
    if (acceptance?.attemptId) fail('acceptance_attempt_failed_or_unknown',409);
    if (row.revision !== 1 || row.phase !== 'idle') fail('acceptance_requires_initial_generation',409);
    const leaseId = crypto.randomUUID(), startedAt = this.#now();
    let acquired = false, dispatched = false;
    try {
      acquired = await this.#store.acquireAcceptance(this.#owner,leaseId,startedAt,startedAt+60000);
      if (!acquired) fail('acceptance_already_started_or_changed',409);
      row = await this.#store.getCredential(this.#owner);
      if (row?.revision !== 1 || row?.leaseId !== leaseId) fail('refresh_lease_lost',409);
      const previous = await this.#vault.open(row.envelope,this.#owner,'credential',1);
      if (!await this.#store.markDispatched(this.#owner,1,leaseId,this.#now())) fail('refresh_lease_lost',409);
      dispatched = true;
      const next = await this.#provider.refresh(previous);
      const envelope = await this.#vault.seal(next,this.#owner,'credential',2);
      const receipt = {kind:'garmin-refresh-acceptance-v1',trigger:'owner_activation_acceptance',
        attemptId:leaseId,startedAt,completedAt:this.#now(),fromRevision:1,toRevision:2,
        envelopeSha256:await envelopeDigest(envelope)};
      const receiptEnvelope = await this.#vault.seal(receipt,this.#owner,'acceptance',2,leaseId);
      if (!await this.#store.commitAcceptance(this.#owner,leaseId,envelope,receiptEnvelope)) fail('acceptance_commit_failed',503);
      const committed = await this.#store.getCredential(this.#owner);
      const saved = await this.#store.getAcceptance(this.#owner);
      if (committed?.revision !== 2 || committed?.envelope !== envelope || committed?.phase !== 'idle' || saved?.receipt !== receiptEnvelope) fail('acceptance_readback_failed',503);
      return this.#readAcceptanceReceipt(committed,saved);
    } catch(error) {
      // The permanent attempt marker prevents the explicit test being retried
      // even before dispatch. After dispatch, the ordinary non-stealable lease
      // additionally prevents an uncertain old refresh token being reused.
      if (dispatched) { try {await this.#store.blockRefresh(this.#owner,1,leaseId);} catch {} }
      else if (acquired) { try {await this.#store.releaseAcquired(this.#owner,1,leaseId);} catch {} }
      if (error instanceof SafeError) throw error;
      fail('refresh_acceptance_uncertain_stop',503);
    }
  }
  async refresh(expectedRevision, { timeoutMs = 20000, deadline = Infinity, clock = () => performance.now() } = {}) {
    const leaseId = crypto.randomUUID(), now = this.#now();
    if (!await this.#store.acquireRefresh(this.#owner, expectedRevision, leaseId, now, now + 60000)) fail('refresh_busy_or_changed', 409);
    let dispatched = false;
    try {
      const row = await this.#store.getCredential(this.#owner);
      if (row?.revision !== expectedRevision || row?.leaseId !== leaseId) fail('refresh_lease_lost', 409);
      const previous = await this.#vault.open(row.envelope, this.#owner, 'credential', row.revision);
      if(Math.min(timeoutMs,Math.ceil(deadline-clock()))<1)fail('read_time_limit',504);
      if (!await this.#store.markDispatched(this.#owner, row.revision, leaseId, this.#now())) fail('refresh_lease_lost', 409);
      dispatched = true;
      const remaining=Math.min(timeoutMs,Math.ceil(deadline-clock()));
      if(remaining<1)fail('read_time_limit',504);
      const next = await this.#provider.refresh(previous,{timeoutMs:remaining});
      const envelope = await this.#vault.seal(next, this.#owner, 'credential', row.revision + 1);
      if (!await this.#store.commitRefresh(this.#owner, row.revision, leaseId, envelope)) fail('refresh_commit_failed', 503);
      const committed = await this.#store.getCredential(this.#owner);
      if (committed?.revision !== row.revision + 1 || committed?.envelope !== envelope || committed?.phase !== 'idle') fail('refresh_readback_failed', 503);
      return { state:await this.#vault.open(committed.envelope, this.#owner, 'credential', committed.revision), revision:committed.revision };
    } catch (error) {
      // Never emit the caught provider/storage message or fall back to the old generation.
      if (dispatched) {
        try { await this.#store.blockRefresh(this.#owner, expectedRevision, leaseId); } catch { /* still dispatched and non-stealable */ }
      } else if (this.#store.releaseAcquired) {
        try { await this.#store.releaseAcquired(this.#owner, expectedRevision, leaseId); } catch { /* acquired lease can expire safely */ }
      }
      if (error instanceof SafeError) throw error;
      fail('refresh_uncertain_stop', 503);
    }
  }
}

export function allowedDays(days, { now = Date.now(), timeZone = 'UTC' } = {}) {
  if (!Array.isArray(days) || days.length < 1 || days.length > 7 || new Set(days).size !== days.length) fail('invalid_date_range');
  let today;
  try { today = new Intl.DateTimeFormat('en-CA',{timeZone,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(now)); }
  catch { fail('timezone_not_configured', 503); }
  const midnight = Date.parse(today + 'T00:00:00Z');
  for (const day of days) {
    if (typeof day !== 'string' || !/^\d{4}-\d{2}-\d{2}$/u.test(day)) fail('invalid_date_range');
    const t = Date.parse(day + 'T00:00:00Z');
    if (!Number.isFinite(t) || new Date(t).toISOString().slice(0,10) !== day || t > midnight || t < midnight - 6 * 86400000) fail('invalid_date_range');
  }
  return [...days].sort();
}
// HR projection retains the verified v5 contract.
function projectHR(value, day, timeZone, now) {
  if (value.calendarDate !== day || !Object.hasOwn(value,'heartRateValues')) fail('provider_heart_rate_shape_changed',502);
  const points = value.heartRateValues;
  if (points !== null && !Array.isArray(points)) fail('provider_heart_rate_shape_changed',502);
  if (points?.length > 20000) fail('provider_heart_rate_shape_changed',502);
  const localDate = new Intl.DateTimeFormat('en-CA',{timeZone,year:'numeric',month:'2-digit',day:'2-digit'});
  const hrNumber = v => {
    if (v === undefined || v === null) return null;
    if (!Number.isFinite(v) || v < 0 || v > 300) fail('provider_heart_rate_shape_changed',502);
    return v;
  };
  const samples = (points ?? []).map(p => {
    if (!Array.isArray(p) || p.length !== 2 || !Number.isSafeInteger(p[0]) ||
        p[0] < 0 || p[0] > now + 300000 || localDate.format(new Date(p[0])) !== day ||
        (p[1] !== null && (!Number.isFinite(p[1]) || p[1] < 0 || p[1] > 300))) fail('provider_heart_rate_shape_changed',502);
    return [p[0],p[1]];
  });
  const validSampleCount = samples.filter(p => p[1] !== null).length;
  return {date:day, samples, sampleCount:samples.length, validSampleCount,
    coverage:validSampleCount ? 'samples_present' : (samples.length ? 'no_valid_samples' : 'no_samples'),
    minimum:hrNumber(value.minHeartRate),maximum:hrNumber(value.maxHeartRate),resting:hrNumber(value.restingHeartRate)};
}
export async function readMinimal({ session, provider, days, timeZone, now = Date.now(), clock = () => performance.now() }) {
  days = allowedDays(days,{now,timeZone});
  const overallDeadline=clock()+45000;
  let active=await session.load(),refreshed=false;
  const timeout=(deadline=overallDeadline)=>{
    const remaining=Math.ceil(Math.min(overallDeadline,deadline)-clock());
    if(remaining<1)fail('read_time_limit',504);
    return Math.min(20000,remaining);
  };
  const invoke=async(operation,deadline=overallDeadline)=>{
    try{return await operation(active.state,timeout(deadline));}
    catch(error){
      if(!(error instanceof SafeError)||error.code!=='provider_authentication_stop'||refreshed)throw error;
      refreshed=true;
      active=await session.refresh(active.revision,{timeoutMs:timeout(deadline),deadline:Math.min(overallDeadline,deadline),clock});
      // At most one refresh across the whole read; retry only the failed read.
      return operation(active.state,timeout(deadline));
    }
  };
  const name=await invoke((state,timeoutMs)=>provider.profile(state,{timeoutMs}));
  const heartRate=[];
  for(const day of days)heartRate.push(projectHR(await invoke((state,timeoutMs)=>provider.dailyHeartRate(state,day,name,{timeoutMs})),day,timeZone,now));
  const activities=await collectActivityPages({days,clock,overallDeadline,readPage:async({startDate,endDate,start,deadline,beforeAttempt})=>
    invoke((state,timeoutMs)=>{beforeAttempt();return provider.activitiesPage(state,startDate,endDate,start,{timeoutMs});},deadline)});
  return {source:'garmin-private-unofficial',timeZone,heartRateCoverage:'synced discrete wear-time samples; not continuous or proof of full-day coverage',days,...activities,heartRate};
}
