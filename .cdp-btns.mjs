import WebSocket from 'ws';
let id=0; const pending=new Map(); let ws;
function send(m,p){return new Promise((res)=>{const i=++id;pending.set(i,res);ws.send(JSON.stringify({id:i,method:m,params:p}));});}
function onmsg(data){const m=JSON.parse(data);
  if(m.id&&pending.has(m.id)){pending.get(m.id)(m.result);pending.delete(m.id);}
  if(m.method==='Runtime.exceptionThrown') console.error('EXCEPTION:', JSON.stringify(m.params.exceptionDetails).slice(0,900));
}
const t=(await (await fetch('http://localhost:9222/json/list')).json()).find(x=>x.type==='page');
ws=new WebSocket(t.webSocketDebuggerUrl); ws.on('message',d=>onmsg(d.toString()));
await new Promise(r=>ws.on('open',r));
await send('Runtime.enable'); await send('Page.enable');
await send('Page.navigate',{url:'http://localhost:8787/m/057954bb28527ff9c7701c6fd2b7f770163718ded09745da56cc95e7606afe99'});
await new Promise(r=>setTimeout(r,8000));
// click each button, report what happens (pathname, any modal state)
for (const act of ['like','share','copy']) {
  await send('Runtime.evaluate',{expression:`document.querySelector('#app [data-action="${act}"]') ? (()=>{document.querySelector('#app [data-action="${act}"]').click();return 'ok'})() : 'missing'`, returnByValue:true});
  await new Promise(r=>setTimeout(r,1500));
  const st=await send('Runtime.evaluate',{expression:`JSON.stringify({path:location.pathname, modal:document.getElementById('suggest-modal')?document.getElementById('suggest-modal').hidden:null})`, returnByValue:true});
  console.log(act, '->', st.result?.value);
}
// try back
await send('Runtime.evaluate',{expression:`document.querySelector('#app [data-action="back"]').click()`, returnByValue:true});
await new Promise(r=>setTimeout(r,1500));
const end=await send('Runtime.evaluate',{expression:'location.pathname', returnByValue:true});
console.log('back ->', end.result.value);
process.exit(0);