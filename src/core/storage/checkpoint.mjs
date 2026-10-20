import { constants } from 'node:fs';
import { resolve,relative,dirname,basename,sep } from 'node:path';
import { open,rename,unlink,lstat,realpath } from 'node:fs/promises';
import { randomBytes,createHash } from 'node:crypto';
const digest=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
export async function writeCheckpoint(path,summary){
  const tmp=path+'.'+randomBytes(8).toString('hex')+'.tmp';const f=await open(tmp,'wx',0o600);
  try{await f.writeFile(JSON.stringify({version:1,sha256:digest(summary),summary},null,2)+'\n');await f.sync();}finally{await f.close();}
  try{await rename(tmp,path);}catch(e){await unlink(tmp).catch(()=>{});throw e;}
}
export const MAX_CHECKPOINT_BYTES=10_000_000;
export async function readCheckpoint(path){
  let file;
  try{
    const before=await lstat(path);
    if(!before.isFile()||before.isSymbolicLink())throw Error('CHECKPOINT_NOT_REGULAR_FILE');
    // NONBLOCK also prevents a FIFO swapped in after lstat from blocking open.
    file=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);
    const stat=await file.stat();
    if(!stat.isFile())throw Error('CHECKPOINT_NOT_REGULAR_FILE');
    if(stat.size>MAX_CHECKPOINT_BYTES)throw Error('CHECKPOINT_TOO_LARGE');
    // A file may grow after fstat: never read beyond one byte over the limit.
    const buffer=Buffer.alloc(MAX_CHECKPOINT_BYTES+1);let size=0;
    while(size<buffer.length){const {bytesRead}=await file.read(buffer,size,buffer.length-size,null);if(!bytesRead)break;size+=bytesRead;}
    if(size>MAX_CHECKPOINT_BYTES)throw Error('CHECKPOINT_TOO_LARGE');
    let e;try{e=JSON.parse(buffer.subarray(0,size).toString('utf8'));}catch{throw Error('CHECKPOINT_INVALID');}
    if(!e||e.version!==1||!e.summary||digest(e.summary)!==e.sha256||e.summary.schemaVersion!==1||!['live','synthetic'].includes(e.summary.mode))throw Error('CHECKPOINT_INVALID');
    return e.summary;
  }catch(error){
    if(['CHECKPOINT_NOT_REGULAR_FILE','CHECKPOINT_TOO_LARGE','CHECKPOINT_INVALID'].includes(error.message))throw error;
    throw Error('CHECKPOINT_READ_FAILED');
  }finally{if(file)await file.close();}
}
async function canonicalPath(path){
  const absolute=resolve(path);try{return await realpath(absolute);}catch(error){
    if(error.code!=='ENOENT')throw Error('OUTPUT_PATH_REJECTED');
    const parent=dirname(absolute);if(parent===absolute)throw Error('OUTPUT_PATH_REJECTED');
    return resolve(await canonicalPath(parent),basename(absolute));
  }
}
function within(path,directory){const r=relative(directory,path);return r===''||(!r.startsWith('..'+sep)&&r!=='..'&&!r.startsWith(sep));}
export async function assertCheckpointOutsideState(output,stateDirectory){
  // Both lexical and resolved checks cover nested paths and existing symlink aliases.
  const out=resolve(output),state=resolve(stateDirectory);
  if(within(out,state)||within(await canonicalPath(out),await canonicalPath(state)))throw Error('OUTPUT_INSIDE_STATE_DIRECTORY');
}
