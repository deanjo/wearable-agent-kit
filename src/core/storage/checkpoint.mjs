import { open,readFile,rename,unlink } from 'node:fs/promises';
import { randomBytes,createHash } from 'node:crypto';
const digest=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
export async function writeCheckpoint(path,summary){
  const tmp=path+'.'+randomBytes(8).toString('hex')+'.tmp';const f=await open(tmp,'wx',0o600);
  try{await f.writeFile(JSON.stringify({version:1,sha256:digest(summary),summary},null,2)+'\n');await f.sync();}finally{await f.close();}
  try{await rename(tmp,path);}catch(e){await unlink(tmp).catch(()=>{});throw e;}
}
export async function readCheckpoint(path){const raw=await readFile(path,'utf8');if(raw.length>10_000_000)throw Error('CHECKPOINT_TOO_LARGE');const e=JSON.parse(raw);if(e.version!==1||digest(e.summary)!==e.sha256||e.summary.schemaVersion!==1||!['live','synthetic'].includes(e.summary.mode))throw Error('CHECKPOINT_INVALID');return e.summary;}
