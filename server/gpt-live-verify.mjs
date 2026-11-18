import {readFile} from 'node:fs/promises';
import {createChatServer} from './local.mjs';
const config=JSON.parse(await readFile(new URL('../runtime.json',import.meta.url),'utf8'));
const server=createChatServer(config,{store:{},dist:'/tmp/claude-gpt-ui-test'});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
try {
 const base=`http://127.0.0.1:${server.address().port}`;
 for (const profile of ['gpt-6-astra','gpt-6.1-sol']) {
  const start=Date.now();const r=await fetch(base+'/api/chat',{method:'POST',headers:{cookie:`chat_session=${config.accessToken}`,'Content-Type':'application/json'},body:JSON.stringify({profile,channel:'cheap-6-1-sol',webSearch:false,messages:[{role:'user',content:'只回复 OK，不要其他内容。'}]})});
  const text=await r.text();console.log(JSON.stringify({profile,status:r.status,done:text.includes('event: done'),error:text.includes('event: error'),body:text,elapsedMs:Date.now()-start}));
  if(r.status!==200||!text.includes('event: done')||text.includes('event: error'))process.exitCode=1;
 }
}finally{server.closeAllConnections();await new Promise(r=>server.close(r));}
