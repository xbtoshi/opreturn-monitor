import WebSocket from 'ws';
import fs from 'fs';
let id=0; const pending=new Map(); let ws;
function send(m,p){return new Promise((res)=>{const i=++id;pending.set(i,res);ws.send(JSON.stringify({id:i,method:m,params:p}));});}
function onmsg(data){const m=JSON.parse(data);
  if(m.id&&pending.has(m.id)){pending.get(m.id)(m.result);pending.delete(m.id);}
}
const t=await (await fetch('http://localhost:9222/json/list')).json();
const target=t.find(x=>x.type==='page');
ws=new WebSocket(target.webSocketDebuggerUrl); ws.on('message',d=>onmsg(d.toString()));
await new Promise(r=>ws.on('open',r));
await send('Page.enable'); await send('Runtime.enable');
await send('Page.navigate',{url:'https://opreturn.xyz/m/057954bb28527ff9c7701c6fd2b7f770163718ded09745da56cc95e7606afe99'});
await new Promise(r=>setTimeout(r,9000));
const shot=await send('Page.captureScreenshot',{format:'png'});
fs.writeFileSync('/tmp/prod-detail.png', Buffer.from(shot.data,'base64'));
console.log('saved /tmp/prod-detail.png');
process.exit(0);