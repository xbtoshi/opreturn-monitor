import WebSocket from 'ws';
let id=0; const pending=new Map(); let ws;
function send(m,p){return new Promise((res)=>{const i=++id;pending.set(i,res);ws.send(JSON.stringify({id:i,method:m,params:p}));});}
function onmsg(data){const m=JSON.parse(data);
  if(m.id&&pending.has(m.id)){pending.get(m.id)(m.result);pending.delete(m.id);}
  if(m.method==='Runtime.exceptionThrown') console.error('EXCEPTION:', JSON.stringify(m.params.exceptionDetails).slice(0,700));
  if(m.method==='Runtime.consoleAPICalled'&&m.params.type==='error') console.error('CONSOLE.ERR:', JSON.stringify(m.params.args).slice(0,400));
}
const t=(await (await fetch('http://localhost:9222/json/list')).json()).find(x=>x.type==='page');
ws=new WebSocket(t.webSocketDebuggerUrl); ws.on('message',d=>onmsg(d.toString()));
await new Promise(r=>ws.on('open',r));
await send('Runtime.enable'); await send('Page.enable');
await send('Page.navigate',{url:'https://opreturn.xyz/feed'});
await new Promise(r=>setTimeout(r,10000));
let ev=await send('Runtime.evaluate',{expression:`JSON.stringify({msgs:document.querySelectorAll('#feed-list [data-action="open-msg"]').length, modalHidden:document.getElementById('suggest-modal')?document.getElementById('suggest-modal').hidden:null, scrimDisplay:getComputedStyle(document.getElementById('suggest-modal')).display})`, returnByValue:true});
console.log('PROD feed:', ev.result?.value);
await send('Runtime.evaluate',{expression:`document.querySelector('#feed-list [data-action="open-msg"]').click()`, returnByValue:true});
await new Promise(r=>setTimeout(r,4000));
ev=await send('Runtime.evaluate',{expression:`JSON.stringify({path:location.pathname, artifact:!!document.querySelector('#app .artifact'), buttons:[...document.querySelectorAll('#app [data-action]')].map(b=>b.getAttribute('data-action')).filter((v,i,a)=>a.indexOf(v)===i)})`, returnByValue:true});
console.log('PROD after msg click:', ev.result?.value);
// check elementFromPoint over a message to detect invisible overlay
ev=await send('Runtime.evaluate',{expression:`(() => { const app=document.getElementById('app'); const btn=document.querySelector('#app [data-action="like"]'); if(!btn) return 'no like btn'; const r=btn.getBoundingClientRect(); const top=document.elementFromPoint(r.x+r.width/2, r.y+r.height/2); return JSON.stringify({hitTag:top.tagName, hitIsBtn: top===btn, hitCls: String(top.className).slice(0,60), insideApp: app.contains(top)}); })()`, returnByValue:true});
console.log('PROD hit test on like:', ev.result?.value);
process.exit(0);