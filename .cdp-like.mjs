import WebSocket from 'ws';
let id=0; const pending=new Map(); let ws;
function send(m,p){return new Promise((res)=>{const i=++id;pending.set(i,res);ws.send(JSON.stringify({id:i,method:m,params:p}));});}
function onmsg(data){const m=JSON.parse(data);
  if(m.id&&pending.has(m.id)){pending.get(m.id)(m.result);pending.delete(m.id);}
  if(m.method==='Runtime.exceptionThrown'){
    const t=JSON.stringify(m.params.exceptionDetails).slice(0,400);
    if(!t.includes('Clipboard') && !t.includes('writeText')) console.error('EXCEPTION(non-clip):',t);
  }
}
const t=await (await fetch('http://localhost:9222/json/list')).json();
const target=t.find(x=>x.type==='page');
ws=new WebSocket(target.webSocketDebuggerUrl); ws.on('message',d=>onmsg(d.toString()));
await new Promise(r=>ws.on('open',r));
await send('Runtime.enable'); await send('Page.enable');
await send('Page.navigate',{url:'https://opreturn.xyz/m/3081c6c503411c4138799755597661c1d5919b42f66f702ee11e4f7431a1082f'});
await new Promise(r=>setTimeout(r,8000));
let ev=await send('Runtime.evaluate',{expression:`(() => { const b=document.querySelector('#app [data-action="like"]'); if(!b) return 'no like'; b.scrollIntoView({block:'center'}); return 'scrolled'; })()`, returnByValue:true});
console.log(ev.result?.value);
await new Promise(r=>setTimeout(r,800));
ev=await send('Runtime.evaluate',{expression:`(() => { const b=document.querySelector('#app [data-action="like"]'); const r=b.getBoundingClientRect(); const w=document.elementFromPoint(r.x+r.width/2, r.y+r.height/2); return JSON.stringify({hitIsBtn: w===b, hitTag:w.tagName, hitCls:String(w.className).slice(0,50), rect:[Math.round(r.x),Math.round(r.y),Math.round(r.width),Math.round(r.height)]}); })()`, returnByValue:true});
console.log('like hit test after scroll:', ev.result?.value);
// click like and see if it mines / errors
await send('Runtime.evaluate',{expression:`document.querySelector('#app [data-action="like"]').click()`, returnByValue:true});
await new Promise(r=>setTimeout(r,2500));
ev=await send('Runtime.evaluate',{expression:`JSON.stringify({statusTxt:(document.getElementById('status')||{}).textContent||null, btnText:document.querySelector('#app [data-action="like"]')?.textContent.trim()})`, returnByValue:true});
console.log('after like click:', ev.result?.value);
process.exit(0);