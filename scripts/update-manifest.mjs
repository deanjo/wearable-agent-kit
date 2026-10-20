import { readdir,readFile,writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const files={};
async function walk(dir=''){for(const e of await readdir(dir||'.',{withFileTypes:true})){if(e.name==='.git')continue;const p=dir?dir+'/'+e.name:e.name;if(e.isSymbolicLink())throw Error('SYMLINK_REJECTED');if(e.isDirectory())await walk(p);else if(p!=='RELEASE_MANIFEST.json')files[p]=createHash('sha256').update(await readFile(p)).digest('hex');}}
await walk();await writeFile('RELEASE_MANIFEST.json',JSON.stringify({schemaVersion:1,notice:'SHA256 inventory detects changes against this manifest; it is not a signature or proof of publisher identity.',files:Object.fromEntries(Object.entries(files).sort(([a],[b])=>a.localeCompare(b)))},null,2)+'\n');
