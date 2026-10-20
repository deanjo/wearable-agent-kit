const major=Number(process.versions.node.split('.')[0]);
const result={node:process.versions.node,supported:major>=24,dependencies:'none',defaultMode:'synthetic',liveCredentialChecked:false,networkChecked:false,localAuthentication:'requires Unix controlling terminal /dev/tty',mcp:'local stdio only; no public ingress'};
console.log(JSON.stringify(result,null,2));if(!result.supported)process.exitCode=1;
