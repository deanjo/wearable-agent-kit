import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { D1Store } from '../../src/providers/garmin/d1-store.mjs';
import { Vault, importVaultKey } from '../../src/providers/garmin/vault.mjs';
export function sqlStore(t) {
  const sqlite=new DatabaseSync(':memory:');sqlite.exec(readFileSync(new URL('../../src/providers/garmin/schema.sql',import.meta.url),'utf8'));
  t.after(()=>sqlite.close());
  const db={prepare(sql){return{bind(...values){return{async first(){return sqlite.prepare(sql).get(...values)??null;},async run(){return{success:true,meta:{changes:Number(sqlite.prepare(sql).run(...values).changes)}};}};}};}};
  return {store:new D1Store(db),sqlite};
}
export async function fixtureVault(){return new Vault(await importVaultKey(new Uint8Array(32).fill(7)),'synthetic-test-key');}
export function json(body,headers={},status=200){return Response.json(body,{status,headers});}
export const NOW=Date.parse('2026-10-19T08:00:00Z');
export const OWNER='synthetic-owner';
export const STATE={kind:'di',clientId:'GARMIN_CONNECT_MOBILE_ANDROID_DI_2025Q2',accessToken:'synthetic-access-v1',refreshToken:'synthetic-refresh-v1'};
export function sequence(items){
  const calls=[];
  const fetchImpl=async(url,init)=>{calls.push({url,init});const next=items.shift();if(next instanceof Error)throw next;if(typeof next==='function')return next(url,init);if(!next)throw Error('unexpected request');return next;};
  return{fetchImpl,calls,items};
}
