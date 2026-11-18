import json
from ssh_config import connect

remote = '''import hashlib,json,pathlib,re,subprocess
sites={'apple':('/var/www/jiayicare-static/mobile-preview-joinwehealth','app.joinwehealth.com'),'huawei':('/var/www/jiayicare-static/mobile-preview','jiaycare.com')}
result={}
for name,(root,domain) in sites.items():
 site=pathlib.Path(root);html=(site/'index.html').read_bytes()
 scripts=re.findall(r'/mobile-preview/releases/annual-20261118/js/[^" ]+\\.js',html.decode())
 assert len(scripts)>=2,(name,scripts)
 for url in scripts:
  data=subprocess.check_output(['curl','-fsS','--max-time','20','--noproxy','*','--resolve',domain+':443:127.0.0.1','https://'+domain+url])
  assert data==(site/url.removeprefix('/mobile-preview/')).read_bytes(),name+' asset mismatch'
 result[name]={'indexSha':hashlib.sha256(html).hexdigest(),'entryScripts':len(scripts),'assetsVerified':True}
print(json.dumps(result))
'''
with connect() as connection:
    stdin, stdout, stderr = connection.exec_command('python3 -', timeout=90)
    stdin.channel.sendall(remote.encode())
    stdin.channel.shutdown_write()
    output, error = stdout.read().decode(), stderr.read().decode()
    if stdout.channel.recv_exit_status():
        raise RuntimeError(error or output)
    print(output)
