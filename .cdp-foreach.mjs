import WebSocket from 'ws';
let id=0; const pending=new Map(); let ws;
function send(m,p){return new Promise((res)=>{const i=++id;pending.set(i,res);ws.send(JSON.stringify({id:i,method:m,params:p}));});}
function onmsg(data){const m=JSON.parse(data);
  if(m.id&&pending.has(m.id)){pending.get(m.id)(m.result);pending.delete(m.id);}
  if(m.method==='Runtime.exceptionThrown'){
    const t=JSON.stringify(m.params.exceptionDetails).slice(0,1000);
    if(!t.includes('Clipboard')&&!t.includes('writeText')) console.error('EXCEPTION:',t);
  }
}
const t=await (await fetch('http://localhost:9222/json/list')).json();
const target=t.find(x=>x.type==='page');
ws=new WebSocket(target.webSocketDebuggerUrl); ws.on('message',d=>onmsg(d.toString()));
await new Promise(r=>ws.on('open',r));
await send('Runtime.enable'); await send('Page.enable');

const feed = await (await fetch('https://opreturn.xyz/api/messages?limit=100')).json();
const msgs = feed.messages||feed.data||[];
console.log('total msgs from api:', msgs.length);
const txids = msgs.map(m=>m.txid);

let fail=0;
for (const tx of txids.slice(0,80)) {
  await send('Page.navigate',{url:'https://opreturn.xyz/m/'+tx});
  await new Promise(r=>setTimeout(r,1600));
  const ev=await send('Runtime.evaluate',{expression:`document.getElementById('app')?document.getElementById('app').innerText.includes('IMMUTABLE RECORD'):false`, returnByValue:true});
  const ok = ev.result?.value;
  if(!ok){ fail++; console.error('FAILED DETAIL for', tx); }
}
console.log('done. failed:', fail, 'of', Math.min(msgs.length,80));
process.exit(0);