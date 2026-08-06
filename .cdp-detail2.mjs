import WebSocket from 'ws';
let id=0; const pending=new Map(); let ws;
function send(m,p){return new Promise((res)=>{const i=++id;pending.set(i,res);ws.send(JSON.stringify({id:i,method:m,params:p}));});}
function onmsg(data){const m=JSON.parse(data);
  if(m.id&&pending.has(m.id)){pending.get(m.id)(m.result);pending.delete(m.id);}
  if(m.method==='Runtime.exceptionThrown'){
    const t=JSON.stringify(m.params.exceptionDetails).slice(0,400);
    if(!t.includes('Clipboard') && !t.includes('writeText')) console.error('EXCEPTION(non-clip):',t);
  }
  if(m.method==='Runtime.consoleAPICalled' && m.params.type==='error'){
    const t=JSON.stringify(m.params.args).slice(0,300);
    if(!t.includes('Clipboard') && !t.includes('writeText')) console.error('CONSOLE.ERR:',t);
  }
}
const t=await (await fetch('http://localhost:9222/json/list')).json();
const target=t.find(x=>x.type==='page');
ws=new WebSocket(target.webSocketDebuggerUrl); ws.on('message',d=>onmsg(d.toString()));
await new Promise(r=>ws.on('open',r));
await send('Runtime.enable'); await send('Page.enable');
await send('Page.navigate',{url:'https://opreturn.xyz/feed'});
await new Promise(r=>setTimeout(r,12000));
let ev=await send('Runtime.evaluate',{expression:`document.querySelectorAll('#feed-list [data-action="open-msg"]').length`, returnByValue:true});
console.log('feed msgs:',ev.result?.value);
await send('Runtime.evaluate',{expression:`document.querySelector('#feed-list [data-action="open-msg"]').click()`, returnByValue:true});
await new Promise(r=>setTimeout(r,5000));
ev=await send('Runtime.evaluate',{expression:`JSON.stringify({path:location.pathname, detail:!!document.querySelector('#app .artifact')})`, returnByValue:true});
console.log('after click:', ev.result?.value);
// hit test the like button center with real hit-testing
ev=await send('Runtime.evaluate',{expression:`(() => { const b=document.querySelector('#app [data-action="like"]'); if(!b) return 'no like'; const r=b.getBoundingClientRect(); const w=document.elementFromPoint(Math.min(r.x+r.width/2, innerWidth-1), Math.min(r.y+r.height/2, innerHeight-1)); return JSON.stringify({hitIsBtn: w===b, hitTag:w.tagName, hitCls:String(w.className).slice(0,50), vis: r.width>0&&r.height>0}); })()`, returnByValue:true});
console.log('like hit test:', ev.result?.value);
process.exit(0);