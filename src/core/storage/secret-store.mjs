import { mkdir, open, readFile, rename, unlink, lstat } from 'node:fs/promises';
import { join, isAbsolute } from 'node:path';
import { randomBytes, scryptSync, createCipheriv, createDecipheriv } from 'node:crypto';

// One local OS account is the trust boundary. This is not a hosted multi-user vault.
export async function openSecretStore({ directory, passphrase, namespace }) {
  if (!isAbsolute(directory) || !['whoop','garmin'].includes(namespace) || typeof passphrase !== 'string' || passphrase.length < 12) throw new Error('INVALID_VAULT_CONFIGURATION');
  await mkdir(directory, {recursive:true, mode:0o700});
  const stat = await lstat(directory);
  if (!stat.isDirectory() || stat.isSymbolicLink() || (stat.mode & 0o077)) throw new Error('PRIVATE_DIRECTORY_REQUIRED');
  const path = join(directory,namespace+'.vault'), lock = path+'.lock';
  let held = false;
  const load = async () => {
    let text;
    try { const s=await lstat(path); if(!s.isFile()||s.isSymbolicLink()||(s.mode&0o077)||s.size>1024*1024)throw Error(); text=await readFile(path,'utf8'); }
    catch(e) { if(e.code==='ENOENT')return null; throw new Error('VAULT_READ_FAILED'); }
    try {
      const e=JSON.parse(text); if(e.version!==1||e.namespace!==namespace)throw Error();
      const salt=Buffer.from(e.salt,'base64'),iv=Buffer.from(e.iv,'base64'),tag=Buffer.from(e.tag,'base64');
      if(salt.length!==16||iv.length!==12||tag.length!==16)throw Error();
      const key=scryptSync(passphrase,salt,32);
      try { const d=createDecipheriv('aes-256-gcm',key,iv);d.setAAD(Buffer.from('wearable-agent-kit:v1:'+namespace));d.setAuthTag(tag);return JSON.parse(Buffer.concat([d.update(Buffer.from(e.data,'base64')),d.final()]).toString()); } finally { key.fill(0); }
    } catch { throw new Error('VAULT_UNLOCK_FAILED'); }
  };
  const save = async value => {
    if(!held)throw new Error('VAULT_LOCK_REQUIRED');
    const salt=randomBytes(16),iv=randomBytes(12),key=scryptSync(passphrase,salt,32);
    let data,tag;try {const c=createCipheriv('aes-256-gcm',key,iv);c.setAAD(Buffer.from('wearable-agent-kit:v1:'+namespace));data=Buffer.concat([c.update(JSON.stringify(value)),c.final()]);tag=c.getAuthTag();}finally{key.fill(0);}
    const tmp=path+'.'+randomBytes(12).toString('hex')+'.tmp';
    const f=await open(tmp,'wx',0o600);
    try {await f.writeFile(JSON.stringify({version:1,namespace,salt:salt.toString('base64'),iv:iv.toString('base64'),tag:tag.toString('base64'),data:data.toString('base64')}));await f.sync();}finally{await f.close();}
    try {await rename(tmp,path);const dir=await open(directory,'r');try{await dir.sync();}finally{await dir.close();}}catch{await unlink(tmp).catch(()=>{});throw new Error('VAULT_COMMIT_FAILED');}
  };
  const withLock = async fn => {
    if(held)throw new Error('VAULT_LOCK_REENTRY');
    let f;try{f=await open(lock,'wx',0o600);}catch{throw new Error('VAULT_BUSY_OR_CRASH_LOCK');}
    held=true;
    try {return await fn();}finally{held=false;await f.close();await unlink(lock);}
  };
  return {load,save,withLock};
}
