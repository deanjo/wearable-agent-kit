// Verification preload: fail if any test/default collection attempts outbound I/O.
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import tls from 'node:tls';
import { syncBuiltinESMExports } from 'node:module';
const deny=()=>{throw new Error('NETWORK_FORBIDDEN_IN_OFFLINE_VERIFICATION');};
globalThis.fetch=deny;
http.request=deny;http.get=deny;https.request=deny;https.get=deny;
net.connect=deny;net.createConnection=deny;tls.connect=deny;
syncBuiltinESMExports();
