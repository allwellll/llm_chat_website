import { readFile } from 'node:fs/promises';
import { createChatServer } from './local.mjs';
const config=JSON.parse(await readFile(new URL('../runtime.json',import.meta.url),'utf8'));
// Local-only staging; never print credentials or call a paid upstream.
const server=createChatServer({...config,secureCookie:false,publicPath:'/'},{dist:new URL('../dist.pg-staging',import.meta.url).pathname,fetch:async()=>{throw Error('Upstream disabled in staging');}});
server.listen(3108,'127.0.0.1',()=>console.log('PostgreSQL staging ready on 127.0.0.1:3108'));
