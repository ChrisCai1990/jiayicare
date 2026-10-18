"""Publish only the two isolated review H5 paths; retain old assets and rollback."""
import hashlib,json,pathlib,time,zipfile
from ssh_config import connect
ROOT=pathlib.Path(__file__).resolve().parents[1]
BUILD=ROOT.parent/'apple-h5-candidate-20261018/miniprogram/dist-review'
AUDIT=ROOT/'release/apple-review-20261018'
REMOTE=r'''
import pathlib,zipfile,hashlib,json,shutil,subprocess,os
stage=pathlib.Path(STAGE);archive=stage/'review.zip'
assert hashlib.sha256(archive.read_bytes()).hexdigest()==DIGEST
sites=[('/var/www/jiayicare-static/mobile-preview/review','jiaycare.com'),('/var/www/jiayicare-static/mobile-preview-joinwehealth/review','app.joinwehealth.com')]
normal={pathlib.Path(s).parent/'index.html':hashlib.sha256((pathlib.Path(s).parent/'index.html').read_bytes()).hexdigest() for s,h in sites}
swapped=[];entries={}
try:
 for i,(name,host) in enumerate(sites):
  site=pathlib.Path(name);assert site.resolve()==site and site.name=='review' and site.is_dir()
  prior=hashlib.sha256((site/'index.html').read_bytes()).hexdigest()
  candidate=site.with_name('review.apple-stage');assert not candidate.exists()
  shutil.copytree(site,candidate)
  with zipfile.ZipFile(archive) as z:
   for item in z.infolist():
    p=pathlib.PurePosixPath(item.filename);assert not p.is_absolute() and '..' not in p.parts and not item.is_dir()
    assert (item.external_attr>>16)&0o170000 != 0o120000
    dest=candidate.joinpath(*p.parts);assert not dest.is_symlink();dest.parent.mkdir(parents=True,exist_ok=True)
    dest.write_bytes(z.read(item));dest.chmod(0o644)
  for p in candidate.rglob('*'):
   if p.is_dir():p.chmod(0o755)
  candidate.chmod(0o755)
  assert hashlib.sha256((site/'index.html').read_bytes()).hexdigest()==prior
  backup=stage/('previous-'+str(i));site.rename(backup);candidate.rename(site);swapped.append((site,backup))
  response=subprocess.run(['curl','--fail','--silent','--show-error','--noproxy','*','--resolve',host+':443:127.0.0.1','https://'+host+'/mobile-preview/review/'],check=True,capture_output=True).stdout
  expected=hashlib.sha256((site/'index.html').read_bytes()).hexdigest();assert hashlib.sha256(response).hexdigest()==expected
  entries[host]=expected
 for p,want in normal.items():assert hashlib.sha256(p.read_bytes()).hexdigest()==want
 print(json.dumps({'deployed':True,'scope':'review-H5-only','backup':str(stage),'entries':entries,'normalEntriesUnchanged':True}))
except Exception:
 for site,backup in reversed(swapped):
  site.rename(stage/('failed-'+site.parent.name));backup.rename(site)
 raise
'''
html=(BUILD/'index.html').read_text(encoding='utf-8')
assert '/mobile-preview/review/js/' in html and '/_expo/' not in html
files=[p for p in BUILD.rglob('*') if p.is_file()]
assert len(files)>20
code=''.join(p.read_text(encoding='utf-8') for p in files if p.suffix=='.js')
assert 'ai-data-consent' in code and 'AI与语音授权' in code and '/review-api' in code
archive=AUDIT/'review-h5-deploy.zip'
with zipfile.ZipFile(archive,'w',zipfile.ZIP_DEFLATED) as z:
    for p in files:z.write(p,p.relative_to(BUILD).as_posix())
digest=hashlib.sha256(archive.read_bytes()).hexdigest()
with connect() as c:
    stage='/var/backups/jiayicare-review-h5-'+str(int(time.time()))
    with c.open_sftp() as s:
        s.mkdir(stage,mode=0o700);s.put(str(archive),stage+'/review.zip')
    stdin,stdout,stderr=c.exec_command('python3 -',timeout=180)
    stdin.write(REMOTE.replace('STAGE',repr(stage)).replace('DIGEST',repr(digest)));stdin.channel.shutdown_write()
    out=stdout.read().decode();err=stderr.read().decode()
    if stdout.channel.recv_exit_status():raise RuntimeError(err[-2000:] or 'Review H5 deployment failed')
    result=json.loads(out);result.update({'archiveSha256':digest,'assetCount':len(files)})
    (AUDIT/'review-h5-deployed.json').write_text(json.dumps(result,indent=2),encoding='utf-8');print(json.dumps(result))
