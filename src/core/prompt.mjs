import { openSync, closeSync, writeSync } from 'node:fs';
import { ReadStream } from 'node:tty';
// Read from the controlling terminal, never MCP stdin. No CLI/env secret arguments.
export function prompt(message,{hidden=false}={}) {
  return new Promise((resolve,reject)=>{
    let fd,input;try{fd=openSync('/dev/tty','r+');input=new ReadStream(fd,{autoClose:false});if(!input.isTTY)throw Error();}catch{if(fd!==undefined)closeSync(fd);reject(Error('INTERACTIVE_TERMINAL_REQUIRED'));return;}
    writeSync(fd,message);input.setRawMode(true);input.setEncoding('utf8');let value='';
    const done=(error)=>{input.setRawMode(false);input.pause();input.removeAllListeners();writeSync(fd,'\n');input.destroy();try{closeSync(fd);}catch{};error?reject(error):resolve(value);};
    input.on('error',()=>done(Error('TERMINAL_READ_FAILED')));
    input.on('data',chunk=>{for(const ch of chunk){if(ch==='\u0003'){done(Error('CANCELLED'));return;}if(ch==='\r'||ch==='\n'){done();return;}if(ch==='\u007f'||ch==='\b'){if(value){value=value.slice(0,-1);if(!hidden)writeSync(fd,'\b \b');}}else if(ch>=' '&&value.length<4096){value+=ch;if(!hidden)writeSync(fd,ch);}}});input.resume();
  });
}
export const promptText=message=>prompt(message);
export const promptSecret=message=>prompt(message,{hidden:true});
