import { readFile,readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
export async function checkIntegrity(root='.'){
  const manifest=JSON.parse(await readFile(join(root,'RELEASE_MANIFEST.json'),'utf8'));
  const actual=[];
  async function walk(dir=''){for(const entry of await readdir(join(root,dir),{withFileTypes:true})){if(entry.name==='.git')continue;const p=dir?dir+'/'+entry.name:entry.name;if(entry.isSymbolicLink())throw Error('INTEGRITY_SYMLINK_REJECTED');if(entry.isDirectory())await walk(p);else if(p!=='RELEASE_MANIFEST.json')actual.push(p);}}
  await walk();actual.sort();const expected=Object.keys(manifest.files).sort();if(JSON.stringify(actual)!==JSON.stringify(expected))throw Error('INTEGRITY_FILE_SET_CHANGED');
  for(const p of actual){const digest=createHash('sha256').update(await readFile(join(root,p))).digest('hex');if(digest!==manifest.files[p])throw Error('INTEGRITY_HASH_MISMATCH');}
  return {files:actual.length,hashesVerified:true,provenanceAuthenticated:false};
}
