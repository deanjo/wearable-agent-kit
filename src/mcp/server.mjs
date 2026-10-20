export async function handleRpc(rpc,read){
  if(!rpc||rpc.jsonrpc!=='2.0'||typeof rpc.method!=='string'||(rpc.id!==undefined&&!['string','number'].includes(typeof rpc.id)))return {jsonrpc:'2.0',id:null,error:{code:-32600,message:'Invalid request'}};
  if(rpc.id===undefined)return null;
  const ok=result=>({jsonrpc:'2.0',id:rpc.id,result});
  const err=(code,message)=>({jsonrpc:'2.0',id:rpc.id,error:{code,message}});
  if(rpc.method==='initialize')return ok({protocolVersion:'2025-03-26',capabilities:{tools:{}},serverInfo:{name:'wearable-agent-kit',version:'0.1.0'},instructions:'Read-only single-user local server. Never send passwords, codes, tokens or paths as tool arguments. Check mode and timestamps.'});
  if(rpc.method==='ping')return ok({});
  if(rpc.method==='tools/list')return ok({tools:[{name:'read_wearable_summary',description:'Read configured local provider, or clearly labeled synthetic fixture by default. No authentication or mutation tools.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true,destructiveHint:false,openWorldHint:true}}]});
  if(rpc.method!=='tools/call')return err(-32601,'Method not found');
  const p=rpc.params;
  if(!p||p.name!=='read_wearable_summary'||Object.keys(p).some(k=>!['name','arguments','_meta'].includes(k))||(p.arguments!==undefined&&(p.arguments===null||typeof p.arguments!=='object'||Array.isArray(p.arguments)||Object.keys(p.arguments).length)))return err(-32602,'Expected empty arguments');
  try{const result=await read();return ok({content:[{type:'text',text:JSON.stringify(result)}],isError:result?.data?.status==='unavailable'});}catch{return ok({content:[{type:'text',text:JSON.stringify({error:'SOURCE_READ_FAILED',action:'Run local CLI read for a safe diagnostic; do not pass credentials here.'})}],isError:true});}
}
export async function serveMcp(read){
  process.stdin.setEncoding('utf8');let pending='';
  const rejectOversize=()=>{process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:null,error:{code:-32700,message:'Input exceeds limit'}})+'\n');process.exitCode=1;process.stdin.destroy();};
  for await(const chunk of process.stdin){
    pending+=chunk;
    while(pending.includes('\n')){
      const end=pending.indexOf('\n'),line=pending.slice(0,end);pending=pending.slice(end+1);
      if(Buffer.byteLength(line)>16384){rejectOversize();return;}
      let response;try{response=await handleRpc(JSON.parse(line),read);}catch{response={jsonrpc:'2.0',id:null,error:{code:-32700,message:'Parse error'}};}
      if(response)process.stdout.write(JSON.stringify(response)+'\n');
    }
    if(Buffer.byteLength(pending)>16384){rejectOversize();return;}
  }
  if(pending.trim())process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:null,error:{code:-32700,message:'Incomplete newline-delimited request'}})+'\n');
}
