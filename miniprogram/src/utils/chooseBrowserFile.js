// Older iOS WebViews do not reliably dispatch input.cancel.
export function chooseBrowserFile({accept,signal,window:win=window,document:doc=document}={}) {
 return new Promise((resolve,reject)=>{
  const input=doc.createElement('input');input.type='file';input.accept=accept||'';
  input.style.position='fixed';input.style.top='-10000px';
  let settled=false,timer;
  const cleanup=()=>{clearTimeout(timer);win.removeEventListener('focus',returned);win.removeEventListener('pageshow',returned);doc.removeEventListener('visibilitychange',visible);signal?.removeEventListener('abort',cancel);input.onchange=null;input.oncancel=null;input.remove();};
  const finish=file=>{if(settled)return;settled=true;cleanup();resolve(file);};
  const fail=error=>{if(settled)return;settled=true;cleanup();reject(error);};
  const cancel=()=>finish(null);
  // Android pickers can restore focus before dispatching the selected file.
  const returned=()=>{clearTimeout(timer);timer=setTimeout(()=>{if(input.files?.[0])finish(input.files[0]);else fail(new Error('未读取到所选资料，请重新选择'));},3000);};
  const visible=()=>{if(doc.visibilityState==='visible')returned();};
  input.onchange=()=>finish(input.files?.[0]||null);input.oncancel=cancel;
  if(signal?.aborted){cancel();return;}
  signal?.addEventListener('abort',cancel,{once:true});
  win.addEventListener('focus',returned);win.addEventListener('pageshow',returned);doc.addEventListener('visibilitychange',visible);
  try{doc.body.appendChild(input);input.click();}catch(error){fail(error);}
 });
}
