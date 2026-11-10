"""Publish a read-only diagnostic entry without changing the live Apple H5 entry."""
import argparse
import hashlib
import io
import pathlib
import re
import zipfile

from ssh_config import connect

ROOT = pathlib.Path(__file__).resolve().parents[1]
BUILD = ROOT / 'miniprogram' / 'dist'
SITE = '/var/www/jiayicare-static/mobile-preview-joinwehealth'
LIVE_SHA = '11f40a8f3d049968f8513b08647d5bebbe0d65e4bdf161438149cf5844cdc2cb'
PREVIOUS_DIAGNOSTIC_SHA = '743b8e7c3977c781e1731041e78d02427cdf84247ef7c30c05b5f00664a7275c'


def sha(data):
    return hashlib.sha256(data).hexdigest()


def remote(client, code):
    stdin, stdout, stderr = client.exec_command('python3 -', timeout=60)
    stdin.write(code)
    stdin.channel.shutdown_write()
    output = stdout.read().decode()
    error = stderr.read().decode()
    if stdout.channel.recv_exit_status():
        raise RuntimeError(error or output)
    return output


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--publish', action='store_true')
    args = parser.parse_args()
    original = (BUILD / 'index.html').read_bytes()
    assert b'/mobile-preview/js/' in original, 'Not a mobile H5 build'
    html = original.decode('utf-8')
    assets = re.findall(r'(?:src|href)="(/mobile-preview/(?:js|css)/[^"]+)"', html)
    assert len(assets) >= 3
    diagnostic = '''<meta name="robots" content="noindex,nofollow"><script>
window.__h5DiagnosticErrors=[];
function showH5DiagnosticError(message){
  window.__h5DiagnosticErrors.push(String(message));
  var banner=document.getElementById('h5-diagnostic-banner');
  if(banner){banner.textContent='诊断版错误：'+String(message).slice(0,500);banner.style.background='#b42318';}
}
function updateH5DiagnosticStatus(){
  var banner=document.getElementById('h5-diagnostic-banner');
  if(!banner){return}
  if(window.__h5DiagnosticErrors.length){banner.textContent='诊断版错误：'+window.__h5DiagnosticErrors[0].slice(0,500);banner.style.background='#b42318';return}
  var labels=Array.from(document.querySelectorAll('taro-text-core'));
  var tools=labels.find(function(node){return node.textContent.trim()==='档案工具'});
  var top=tools?Math.round(tools.getBoundingClientRect().top):'未生成';
  var app=document.getElementById('app');
  banner.textContent='诊断版 | '+location.hash.slice(0,45)+' | 屏高 '+innerHeight+' | 滚动 '+Math.round(scrollY)+'/'+document.documentElement.scrollHeight+' | 档案工具 '+top+' | 页面字数 '+(app?app.innerText.length:0);
}
window.addEventListener('error',function(event){showH5DiagnosticError(event.message||event.target&&event.target.src||'资源加载失败')},true);
window.addEventListener('unhandledrejection',function(event){showH5DiagnosticError(event.reason&&event.reason.stack||event.reason||'请求或脚本失败')});
var nativeConsoleError=console.error;
console.error=function(){nativeConsoleError.apply(console,arguments);var message=Array.from(arguments).map(function(item){return item&&item.message||String(item)}).join(' ');if(/Error|TypeError|Exception|ChunkLoad/.test(message)){showH5DiagnosticError(message)}};
window.addEventListener('DOMContentLoaded',function(){setInterval(updateH5DiagnosticStatus,1500);setTimeout(updateH5DiagnosticStatus,500)});
</script>'''
    html = html.replace('</head>', diagnostic + '</head>')
    html = html.replace('<body>', '<body><div id="h5-diagnostic-banner" style="position:fixed;top:0;left:0;right:0;z-index:99999;background:#1e6b50;color:#fff;padding:5px 8px;font:12px/1.4 sans-serif">诊断版 · 正式 App 未更改</div>')
    payload = html.encode('utf-8')
    files = {p.relative_to(BUILD).as_posix(): p.read_bytes() for p in BUILD.rglob('*') if p.is_file() and p.name != 'index.html'}
    digests = {name: sha(data) for name, data in files.items()}
    archive = io.BytesIO()
    with zipfile.ZipFile(archive, 'w', zipfile.ZIP_DEFLATED) as bundle:
        for name, data in files.items():
            assert '..' not in pathlib.PurePosixPath(name).parts
            bundle.writestr(name, data)
    with connect() as client, client.open_sftp() as sftp:
        check = remote(client, f'''import hashlib,pathlib,json
site=pathlib.Path({SITE!r})
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
assert sha(site/'index.html')=={LIVE_SHA!r},'Live entry changed'
expected={digests!r}
collisions=[name for name,digest in expected.items() if (site/name).exists() and sha(site/name)!=digest]
assert not collisions,'Immutable asset collision: '+str(collisions[:5])
target=site/'diagnostic/index.html'
assert not target.exists() or sha(target) in {{{sha(payload)!r},{PREVIOUS_DIAGNOSTIC_SHA!r},'6f4765c531d38a98ab4f861791acdd53698aa415b5c567b0029c25908c0c0f2d'}},'Different diagnostic entry exists'
print(json.dumps({{'diagnosticReady':True,'newAssets':sum(not (site/name).exists() for name in expected),'candidateSha':{sha(original)!r}}}))
''')
        print(check.strip(), 'sha=', sha(payload), 'publish=', args.publish)
        if not args.publish:
            return
        stage = '/tmp/jiayicare-h5-diagnostic-assets.zip'
        with sftp.open(stage, 'wb') as handle:
            handle.write(archive.getvalue())
        remote(client, f'''import hashlib,os,pathlib,zipfile
site=pathlib.Path({SITE!r});expected={digests!r}
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
assert sha(site/'index.html')=={LIVE_SHA!r}
with zipfile.ZipFile({stage!r}) as bundle:
 assert set(bundle.namelist())==set(expected)
 for name,digest in expected.items():
  assert hashlib.sha256(bundle.read(name)).hexdigest()==digest
  target=site/name
  if target.exists():assert sha(target)==digest,'Immutable asset collision: '+name
  else:
   target.parent.mkdir(parents=True,exist_ok=True)
   tmp=target.with_name(target.name+'.diagnostic-new')
   tmp.write_bytes(bundle.read(name));tmp.chmod(0o644);os.replace(tmp,target)
(site/'diagnostic').mkdir(mode=0o755,exist_ok=True)
pathlib.Path({stage!r}).unlink()
''')
        target = SITE + '/diagnostic/index.html'
        with sftp.open(target + '.tmp', 'wb') as handle:
            handle.write(payload)
        verify = remote(client, f'''import hashlib,os,pathlib
site=pathlib.Path({SITE!r})
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
assert sha(site/'index.html')=={LIVE_SHA!r}
tmp=site/'diagnostic/index.html.tmp';target=site/'diagnostic/index.html'
assert sha(tmp)=={sha(payload)!r}
os.replace(tmp,target)
assert sha(target)=={sha(payload)!r}
print('diagnostic-published',sha(target))
''')
        print(verify.strip())


if __name__ == '__main__':
    main()
