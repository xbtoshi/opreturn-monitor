import WebSocket from 'ws';
let id=0; const pending=new Map(); let ws;
function send(m,p){return new Promise((res)=>{const i=++id;pending.set(i,res);ws.send(JSON.stringify({id:i,method:m,params:p}));});}
function onmsg(data){const m=JSON.parse(data);
  if(m.id&&pending.has(m.id)){pending.get(m.id)(m.result);pending.delete(m.id);}
  if(m.method==='Runtime.exceptionThrown') console.error('EXCEPTION:', JSON.stringify(m.params.exceptionDetails).slice(0,900));
  if(m.method==='Runtime.consoleAPICalled'&&m.params.type==='error') console.error('CONSOLE.ERR:', JSON.stringify(m.params.args).slice(0,400));
}
const t=(await (await fetch('http://localhost:9222/json/list')).json()).find(x=>x.type==='page');
ws=new WebSocket(t.webSocketDebuggerUrl); ws.on('message',onmsg);
await new Promise(r=>ws.on('open',r));
await send('Runtime.enable'); await send('Page.enable');

async function testFeedDetail(url, label) {
  await send('Page.navigate',{url});
  await new Promise(r=>setTimeout(r,9000));
  const ev=await send('Runtime.evaluate',{expression:`JSON.stringify({path:location.pathname, msgs:document.querySelectorAll('#feed-list [data-action="open-msg"]').length, appHead:document.getElementById('app').innerText.slice(0,80)})`, returnByValue:true});
  console.log(label, 'feed state:', ev.result?.value);
  const click=await send('Runtime.evaluate',{expression:`(() => { const m=document.querySelector('#feed-list [data-action="open-msg"]'); if(!m) return 'none'; m.click(); return 'clicked'; })()`, returnByValue:true});
  console.log(label, 'click result:', click.result?.value);
  await new Promise(r=>setTimeout(r,3000));
  const after=await send('Runtime.evaluate',{expression:`JSON.stringify({path:location.pathname, appHead:document.getElementById('app').innerText.slice(0,100), detail:!!document.querySelector('#app .artifact')})`, returnByValue:true});
  console.log(label, 'after click:', after.result?.value);
}

await testFeedDetail('http://localhost:8787/feed', 'LOCAL');
process.exit(0);