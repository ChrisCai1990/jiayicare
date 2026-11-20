"""Read the installed Apple App H5 entry before publishing the photo fix."""
import json

from ssh_config import connect


REMOTE = r'''import hashlib,json,pathlib,re
site=pathlib.Path('/var/www/jiayicare-static/mobile-preview-joinwehealth')
data=(site/'index.html').read_bytes()
paths=re.findall(r'/mobile-preview/[^" ]+\.js',data.decode())
print(json.dumps({'indexSha':hashlib.sha256(data).hexdigest(),'indexBytes':len(data),'scripts':paths}))
'''


with connect() as client:
    stdin, stdout, stderr = client.exec_command('python3 -', timeout=60)
    stdin.channel.sendall(REMOTE.encode())
    stdin.channel.shutdown_write()
    output, error = stdout.read().decode(), stderr.read().decode()
    if stdout.channel.recv_exit_status():
        raise RuntimeError(error or output)
    print(json.dumps(json.loads(output), ensure_ascii=False))
