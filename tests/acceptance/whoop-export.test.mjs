import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp,rm,access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const run=args=>spawnSync(process.execPath,['--import','./scripts/deny-network.mjs','src/cli.mjs',...args],{encoding:'utf8',timeout:5000});
for(const command of ['collect','read']) {
  test(`live WHOOP ${command} rejects plaintext export before unlock or read`,async t=>{
    const dir=await mkdtemp(join(tmpdir(),'wak-whoop-export-'));t.after(()=>rm(dir,{recursive:true,force:true}));
    const output=join(dir,'report.json');
    const result=run([command,'--live','--provider','whoop','--output',output]);
    assert.equal(result.status,1);assert.equal(result.stdout,'');
    assert.deepEqual(JSON.parse(result.stderr),{error:'WHOOP_PLAINTEXT_EXPORT_UNSUPPORTED'});
    await assert.rejects(()=>access(output),{code:'ENOENT'});
  });
  test(`live WHOOP ${command} without export retains its normal unlock path`,()=>{
    const result=run([command,'--live','--provider','whoop']);
    assert.equal(result.status,1);
    assert.deepEqual(JSON.parse(result.stderr),{error:'PROVIDER_AND_STATE_DIRECTORY_REQUIRED'});
  });
}
test('live Garmin output remains eligible for its normal unlock path',()=>{
  const result=run(['collect','--live','--provider','garmin','--output','/tmp/synthetic-not-written.json']);
  assert.equal(result.status,1);
  assert.deepEqual(JSON.parse(result.stderr),{error:'PROVIDER_AND_STATE_DIRECTORY_REQUIRED'});
});
test('synthetic WHOOP-labelled output remains synthetic and writable',async t=>{
  const dir=await mkdtemp(join(tmpdir(),'wak-synthetic-export-'));t.after(()=>rm(dir,{recursive:true,force:true}));const output=join(dir,'report.json');
  const result=run(['collect','--provider','whoop','--output',output]);
  assert.equal(result.status,0,result.stderr);assert.equal(JSON.parse(result.stdout).mode,'synthetic');await access(output);
});
test('live WHOOP MCP without export retains its normal unlock path',()=>{
  const result=run(['mcp','--live','--provider','whoop']);assert.equal(result.status,1);
  assert.deepEqual(JSON.parse(result.stderr),{error:'PROVIDER_AND_STATE_DIRECTORY_REQUIRED'});
});
