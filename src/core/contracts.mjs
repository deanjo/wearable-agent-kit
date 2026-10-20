export function localDate(now,timeZone){return new Intl.DateTimeFormat('en-CA',{timeZone,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(now));}
export function yesterday(now,timeZone){return new Date(Date.parse(localDate(now,timeZone)+'T00:00:00Z')-86400000).toISOString().slice(0,10);}
export function wrapSummary({mode,provider,data,now=Date.now(),timeZone='Asia/Manila'}){
  if(!['synthetic','live'].includes(mode))throw Error('INVALID_MODE');
  return {schemaVersion:1,mode,provider,readAt:new Date(now).toISOString(),dateBoundary:timeZone,
    freshness:{readAtIsMeasurementTime:false,measurementTime:'see provider records; absent means unknown'},
    coverage:{deviceSyncCompleteness:'unknown',snapshotConsistency:'not_guaranteed'},data,
    limitations:['Descriptive wearable data only; no diagnosis or treatment advice.','Missing data are not zero; no inferred complete-day coverage.','Cross-device activity matches are candidates, never automatically added.']};
}
