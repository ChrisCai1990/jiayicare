// Older iOS WebViews do not reliably dispatch input.cancel.
export function chooseBrowserFile({accept,signal,window:win=window,document:doc=document}={}) {
 return new Promise((resolve,reject)=>{
  const input=doc.createElement('input');input.type='file';input.accept=accept||'';
  input.style.position='fixed';input.style.top='-10000px';
  let settled=false,timer,armTimer;
  const cleanup=()=>{clearTimeout(timer);clearTimeout(armTimer);win.removeEventListener('pointerdown',interacted);win.removeEventListener('touchstart',interacted);win.removeEventListener('focus',returned);win.removeEventListener('pageshow',returned);doc.removeEventListener('visibilitychange',visible);signal?.removeEventListener('abort',cancel);input.onchange=null;input.oncancel=null;input.remove();};
  const finish=file=>{if(settled)return;settled=true;cleanup();resolve(file);};
  const cancel=()=>finish(null);
  const interacted=()=>finish(input.files?.[0]||null);
  // Let change/files arrive first when the OS file sheet returns focus.
  const returned=()=>{clearTimeout(timer);timer=setTimeout(()=>finish(input.files?.[0]||null),600);};
  const visible=()=>{if(doc.visibilityState==='visible')returned();};
  input.onchange=()=>finish(input.files?.[0]||null);input.oncancel=cancel;
  if(signal?.aborted){cancel();return;}
  signal?.addEventListener('abort',cancel,{once:true});
  win.addEventListener('focus',returned);win.addEventListener('pageshow',returned);doc.addEventListener('visibilitychange',visible);
  try{doc.body.appendChild(input);input.click();if(!settled)armTimer=setTimeout(()=>{win.addEventListener('pointerdown',interacted,{once:true});win.addEventListener('touchstart',interacted,{once:true,passive:true});},0);}catch(error){settled=true;cleanup();reject(error);}
 });
}
