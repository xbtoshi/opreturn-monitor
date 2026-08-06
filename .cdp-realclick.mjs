import WebSocket from 'ws';
let id=0; const pending=new Map(); let ws;
function send(m,p){return new Promise((res)=>{const i=++id;pending.set(i,res);ws.send(JSON.stringify({id:i,method:m,params:p}));});}
function onmsg(data){const m=JSON.parse(data);
  if(m.id&&pending.has(m.id)){pending.get(m.id)(m.result);pending.delete(m.id);}
  if(m.method==='Runtime.exceptionThrown'){
    const t=JSON.stringify(m.params.exceptionDetails).slice(0,400);
    if(!t.includes('Clipboard') && !t.includes('writeText')) console.error('EXCEPTION:',t);
  }
}
const t=await (await fetch('http://localhost:9222/json/list')).json();
const target=t.find(x=>x.type==='page');
ws=new WebSocket(target.webSocketDebuggerUrl); ws.on('message',d=>onmsg(d.toString()));
await new Promise(r=>ws.on('open',r));
await send('Runtime.enable'); await send('Page.enable');
async function nav(u){await send('Page.navigate',{url:u});await new Promise(r=>setTimeout(r,8000));}
await nav('https://opreturn.xyz/m/057954bb28527ff9c7701c6fd2b7f770163718ded09745da56cc95e7606afe99');
// get like button coords, dispatch a real mouse down/up/click sequence
let ev=await send('Runtime.evaluate',{expression:`(() => { const b=document.querySelector('#app [data-action="like"]'); b.scrollIntoView({block:'center'}); const r=b.getBoundingClientRect(); return JSON.stringify({x:r.x+r.width/2,y:r.y+r.height/2}); })()`, returnByValue:true});
const {x,y}=JSON.parse(ev.result?.value||'{}');
console.log('clicking like at',x,y);
for (const [type] of [['mousePressed','mousePressed',0],['mouseReleased','mouseReleased',1],['mousePressed','mousePressed',0],['mouseReleased','mouseReleased',1]]) {}
for (const type of ['mouseMoved','mousePressed','mouseReleased']) {
  await send('Input.dispatchMouseEvent',{type,x,y,button:'left',clickCount:1});
  await new Promise(r=>setTimeout(r,120));
}
await new Promise(r=>setTimeout(r,2500));
ev=await send('Runtime.evaluate',{expression:`JSON.stringify({path:location.pathname, likeTxt:document.querySelector('#app [data-action="like"]')?.textContent.trim()})`, returnByValue:true});
console.log('after real click:',ev.result?.value);
process.exit(0);