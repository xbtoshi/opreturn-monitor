import WebSocket from 'ws';
let id=0; const pending=new Map(); let ws;
function send(m,p){return new Promise((res)=>{const i=++id;pending.set(i,res);ws.send(JSON.stringify({id:i,method:m,params:p}));});}
function onmsg(data){const m=JSON.parse(data);
  if(m.id&&pending.has(m.id)){pending.get(m.id)(m.result);pending.delete(m.id);}
  if(m.method==='Runtime.exceptionThrown') console.error('EXCEPTION:', JSON.stringify(m.params.exceptionDetails).slice(0,500));
}
const t=(await (await fetch('http://localhost:9222/json/list')).json()).find(x=>x.type==='page');
ws=new WebSocket(t.webSocketDebuggerUrl); ws.on('message',d=>onmessage(d.toString()));
await new Promise(r=>ws.on('open',r));
await send('Runtime.enable'); await send('Page.enable');
// fresh tab: open a fresh about:blank first to avoid leftover local page
await send('Page.navigate',{url:'about:blank'});
process.exit(0);