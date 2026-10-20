import { fail, SafeError } from './errors.mjs';

// Fixed internal caps, never client-selectable MCP arguments. All activity GETs
// (including a single 401 replay) consume this request budget.
export const ACTIVITY_LIMITS = Object.freeze({pageSize:20,maxPageRequests:10,maxRecords:200,maxElapsedMs:30000});
class PaginationStop extends Error { constructor(reason){super(reason);this.reason=reason;} }
function dateRanges(days) {
  const ranges=[];
  for(const day of days){
    const previous=ranges.at(-1);
    if(previous&&Date.parse(day+'T00:00:00Z')-Date.parse(previous.endDate+'T00:00:00Z')===86400000)previous.endDate=day;
    else ranges.push({startDate:day,endDate:day});
  }
  return ranges;
}
function number(value){return Number.isFinite(value)?value:null;}
function projectActivity(a,range,days) {
  if(!a||typeof a!=='object'||Array.isArray(a)||!Number.isSafeInteger(a.activityId)||a.activityId<=0)fail('provider_activities_shape_changed',502);
  if(typeof a.startTimeLocal!=='string'||!/^\d{4}-\d{2}-\d{2}[ T](?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,9})?$/u.test(a.startTimeLocal))fail('provider_activities_shape_changed',502);
  const day=a.startTimeLocal.slice(0,10);
  if(!days.has(day)||day<range.startDate||day>range.endDate)fail('provider_activity_date_out_of_scope',502);
  // Exact existing seven-field projection. No names, routes, locations, raw
  // provider bodies, user/profile identifiers, or training detail endpoints.
  return {activityId:a.activityId,
    activityType:typeof a.activityType?.typeKey==='string'?a.activityType.typeKey.slice(0,80):null,
    startTimeLocal:a.startTimeLocal.slice(0,30),durationSeconds:number(a.duration),distanceMeters:number(a.distance),
    averageHeartRate:number(a.averageHR),maximumHeartRate:number(a.maxHR)};
}

/** readPage performs one bounded page operation and may make the existing single
 * 401 refresh/replay. It must call beforeAttempt immediately before EVERY activity
 * GET, and must apply the absolute deadline to refresh and replay as well.
 */
export async function collectActivityPages({days,readPage,clock=()=>performance.now(),overallDeadline=Infinity}) {
  const ranges=dateRanges(days),allowed=new Set(days),start=clock();
  const deadline=Math.min(start+ACTIVITY_LIMITS.maxElapsedMs,overallDeadline);
  let pageRequests=0,pagesReceived=0,recordsScanned=0,exhaustedRanges=0,duplicatesRemoved=0;
  const byId=new Map();
  const result=(reason=null)=>({activities:[...byId.values()].sort((a,b)=>b.startTimeLocal.replace('T',' ').localeCompare(a.startTimeLocal.replace('T',' '))||b.activityId-a.activityId),activityCoverage:reason?'incomplete':'api_pagination_exhausted',
    activityLimit:ACTIVITY_LIMITS.maxRecords,activityPagination:{status:reason?'incomplete':'exhausted',reason,
      pageSize:ACTIVITY_LIMITS.pageSize,pageRequests,pagesReceived,recordsScanned,uniqueActivities:byId.size,duplicatesRemoved,
      requestedRanges:ranges.length,exhaustedRanges,maxPageRequests:ACTIVITY_LIMITS.maxPageRequests,
      maxRecords:ACTIVITY_LIMITS.maxRecords,maxElapsedMs:ACTIVITY_LIMITS.maxElapsedMs,
      deviceSyncCompleteness:'unknown',snapshotConsistency:'not_guaranteed'}});
  const beforeAttempt=()=>{
    if(clock()>=deadline)throw new PaginationStop('time_limit');
    if(pageRequests>=ACTIVITY_LIMITS.maxPageRequests)throw new PaginationStop('page_limit');
    pageRequests++;
  };
  try {
    for(const range of ranges){
      const seenPages=new Set();
      for(let offset=0;;){
        if(clock()>=deadline)throw new PaginationStop('time_limit');
        if(recordsScanned>=ACTIVITY_LIMITS.maxRecords)throw new PaginationStop('record_limit');
        const page=await readPage({...range,start:offset,deadline,beforeAttempt});
        if(clock()>=deadline)throw new PaginationStop('time_limit');
        if(!Array.isArray(page)||page.length>ACTIVITY_LIMITS.pageSize)fail('provider_activities_shape_changed',502);
        pagesReceived++;
        // Only an empty page exhausts this date-range query. A short page does not.
        if(page.length===0){exhaustedRanges++;break;}
        if(recordsScanned+page.length>ACTIVITY_LIMITS.maxRecords)throw new PaginationStop('record_limit');
        const projected=page.map(a=>projectActivity(a,range,allowed));
        recordsScanned+=page.length;
        const fingerprint=JSON.stringify([...projected].sort((a,b)=>a.activityId-b.activityId));
        if(seenPages.has(fingerprint))throw new PaginationStop('repeated_page');
        seenPages.add(fingerprint);
        // Validate the entire page before adding anything. Conflicting copies
        // can reflect a moving provider list; never silently choose one version.
        const additions=new Map();let duplicates=0;
        for(const item of projected){
          const prior=byId.get(item.activityId)??additions.get(item.activityId);
          if(prior){if(JSON.stringify(prior)!==JSON.stringify(item))throw new PaginationStop('conflicting_activity');duplicates++;}
          else additions.set(item.activityId,item);
        }
        if(additions.size===0)throw new PaginationStop('no_progress');
        for(const [id,item]of additions)byId.set(id,item);
        duplicatesRemoved+=duplicates;
        // start is a row offset, not a page number. A provider may return a
        // short page even when more rows remain; never skip its missing slots.
        offset+=page.length;
      }
    }
    return result();
  }catch(error){
    if(error instanceof PaginationStop)return result(error.reason);
    if(error instanceof SafeError&&['provider_timeout_stop','read_time_limit'].includes(error.code)&&clock()>=deadline)return result('time_limit');
    // Auth/challenge/rate-limit/unknown errors retain the existing stop behavior;
    // they are never disguised as an exhausted or successful empty query.
    throw error;
  }
}
