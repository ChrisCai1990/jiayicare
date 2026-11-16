import sys,json
sys.path.insert(0,'scripts')
from ssh_config import connect
with connect() as c:
 _,out,err=c.exec_command("python3 -c \"import pathlib,hashlib,subprocess,json; print(json.dumps({'revision':subprocess.check_output(['git','-C','/var/www/jiayicare','rev-parse','--short=11','HEAD'],text=True).strip(),'sites':{str(p):hashlib.sha256(p.read_bytes()).hexdigest() for p in pathlib.Path('/var/www/jiayicare-static').glob('*/index.html')}}))\"")
 print(out.read().decode());print(err.read().decode())
