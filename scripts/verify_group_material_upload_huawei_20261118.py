"""Verify the Huawei App entry and referenced scripts through its HTTPS vhost."""
import hashlib
import json
import pathlib

from ssh_config import connect

build = pathlib.Path(__file__).resolve().parents[1] / 'miniprogram' / 'dist'
expected = hashlib.sha256((build / 'index.html').read_bytes()).hexdigest()
code = f'''import hashlib,json,pathlib,re,subprocess
root=pathlib.Path('/var/www/jiayicare-static/mobile-preview')
domain='jiaycare.com'
html=subprocess.check_output(['curl','-fsS','--max-time','20','--noproxy','*','--resolve',domain+':443:127.0.0.1','https://'+domain+'/mobile-preview/'])
sha=lambda data:hashlib.sha256(data).hexdigest()
assert sha(html)=={expected!r},'entry hash mismatch'
scripts=re.findall(rb'/mobile-preview/releases/group-material-upload-20261118/js/[^" ]+\\.js',html)
assert len(scripts)>=2,scripts
for url in scripts:
 rel=url.decode().removeprefix('/mobile-preview/')
 public=subprocess.check_output(['curl','-fsS','--max-time','20','--noproxy','*','--resolve',domain+':443:127.0.0.1','https://'+domain+url.decode()])
 assert public==(root/rel).read_bytes(),rel+' public asset mismatch'
print(json.dumps({{'indexSha':sha(html),'entryScripts':len(scripts),'publicAssetsVerified':True}}))
'''
with connect() as client:
    stdin, stdout, stderr = client.exec_command('python3 -', timeout=90)
    stdin.channel.sendall(code.encode())
    stdin.channel.shutdown_write()
    output, error = stdout.read().decode(), stderr.read().decode()
    if stdout.channel.recv_exit_status():
        raise RuntimeError(error or output)
    print(output)
