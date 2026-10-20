import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

function run(args) {
  return spawnSync(process.execPath, ['--import', './scripts/deny-network.mjs', 'src/cli.mjs', ...args], {encoding:'utf8', timeout:5000});
}

for (const command of ['collect','read','mcp']) {
  test(`WHOOP ${command} rejects --day before attempting unlock or reading`, () => {
    const result=run([command,'--live','--provider','whoop','--day','2026-01-02']);
    assert.equal(result.status,1);
    assert.equal(result.stdout,'');
    assert.deepEqual(JSON.parse(result.stderr),{error:'DAY_OPTION_REQUIRES_LIVE_GARMIN_READ'});
  });
  test(`live Garmin ${command} still accepts the --day option`, () => {
    // Missing state directory deliberately stops before any terminal or provider I/O.
    const result=run([command,'--live','--provider','garmin','--day','2026-01-02']);
    assert.equal(result.status,1);
    assert.deepEqual(JSON.parse(result.stderr),{error:'PROVIDER_AND_STATE_DIRECTORY_REQUIRED'});
  });
}

for (const [label,args] of [
  ['synthetic collection',['collect']],
  ['synthetic Garmin-labelled collection',['collect','--provider','garmin']],
  ['authorization',['auth','--live','--provider','garmin']],
  ['checkpoint read',['read','--live','--provider','garmin','--checkpoint','/nonexistent/synthetic-checkpoint.json']],
]) {
  test(`${label} refuses an inapplicable --day rather than ignoring it`,()=>{
    const result=run([...args,'--day','2026-01-02']);
    assert.equal(result.status,1);
    assert.equal(result.stdout,'');
    assert.deepEqual(JSON.parse(result.stderr),{error:'DAY_OPTION_REQUIRES_LIVE_GARMIN_READ'});
  });
}

test('default synthetic collection remains available without --day',()=>{
  const result=run(['collect']);
  assert.equal(result.status,0,result.stderr);
  assert.equal(JSON.parse(result.stdout).mode,'synthetic');
});
