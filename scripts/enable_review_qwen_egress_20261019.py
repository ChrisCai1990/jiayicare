"""Allow the fixed approved Qwen endpoint IPs; retain default-deny isolation."""
import json,time
from pathlib import Path
from ssh_config import connect
ROOT=Path(__file__).resolve().parents[1];AUDIT=ROOT/'release/apple-review-20261018'
REMOTE=r'''
import pathlib,subprocess,socket,ipaddress,hashlib,json,time,urllib.request
host='ws-c30pv4x24nuz8jor.cn-beijing.maas.aliyuncs.com'
expected={'101.201.58.201','47.94.20.201','2408:400a:3e:effb:c146:fb04:1e3d:5cc1','2408:400a:3e:effd:6ac1:ae6e:cde9:4efe'}
addresses=set(x[4][0] for x in socket.getaddrinfo(host,443,type=socket.SOCK_STREAM))
assert addresses==expected and all(ipaddress.ip_address(x).is_global for x in addresses)
assert [x for x in pathlib.Path('/etc/resolv.conf').read_text().splitlines() if x.startswith('nameserver ')]==['nameserver 127.0.0.53']
def run(args):return subprocess.check_output(args,stderr=subprocess.PIPE,text=True).strip()
def props():return dict(x.split('=',1) for x in run(['systemctl','show','jiayicare-review-api','--property=IPAddressAllow,IPAddressDeny,DropInPaths']).splitlines())
before=props();assert before['IPAddressAllow']=='127.0.0.0/8 ::1/128' and set(before['IPAddressDeny'].split())=={'0.0.0.0/0','::/0'}
target=pathlib.Path('/etc/systemd/system/jiayicare-review-api.service.d/30-qwen-endpoint.conf');assert not target.exists()
envfile=pathlib.Path('/var/www/jiayicare-secrets/review-backend.env');envhash=hashlib.sha256(envfile.read_bytes()).hexdigest()
production=run(['git','-C','/var/www/jiayicare','rev-parse','HEAD'])
stage=pathlib.Path(STAGE);stage.mkdir(mode=0o700)
config='[Service]\n# Fixed approved Qwen endpoint only; DNS changes fail closed.\nIPAddressAllow='+' '.join(sorted(addresses))+'\n'
(stage/'configuration.txt').write_text(config);(stage/'before.json').write_text(json.dumps(before))
def healthy():
 for n in range(25):
  try:
   with urllib.request.urlopen('http://127.0.0.1:3108/api/health',timeout=2) as r:
    if r.status==200:return
  except Exception:time.sleep(1)
 raise RuntimeError('Review health failed')
try:
 target.parent.mkdir(exist_ok=True);target.write_text(config);target.chmod(0o644)
 run(['systemctl','daemon-reload']);run(['systemctl','restart','jiayicare-review-api']);healthy()
 after=props();allowed={ipaddress.ip_network(x) for x in after['IPAddressAllow'].split()}
 wanted={ipaddress.ip_network(x) for x in addresses|{'127.0.0.0/8','::1/128'}}
 assert allowed==wanted and after['IPAddressDeny']==before['IPAddressDeny']
 assert hashlib.sha256(envfile.read_bytes()).hexdigest()==envhash
 assert run(['git','-C','/var/www/jiayicare','rev-parse','HEAD'])==production
 print(json.dumps({'applied':True,'scope':'isolated-review-service-only','endpointHost':host,'allowedEndpointIPs':sorted(addresses),'defaultDenyPreserved':True,'localDNSOnly':True,'environmentUnchanged':True,'productionUnchanged':production,'configuration':str(target),'backup':str(stage),'health':True}))
except Exception:
 target.unlink(missing_ok=True);run(['systemctl','daemon-reload']);run(['systemctl','restart','jiayicare-review-api']);healthy();raise
'''
with connect() as c:
 i,o,e=c.exec_command('python3 -',timeout=90);i.write(REMOTE.replace('STAGE',repr('/var/backups/jiayicare-review-egress-'+str(int(time.time())))));i.channel.shutdown_write()
 out=o.read().decode();err=e.read().decode()
 if o.channel.recv_exit_status():raise RuntimeError(err[-1500:] or 'Narrow egress update failed')
 result=json.loads(out);(AUDIT/'review-qwen-egress.json').write_text(json.dumps(result,indent=2),encoding='utf8');print(json.dumps(result))
