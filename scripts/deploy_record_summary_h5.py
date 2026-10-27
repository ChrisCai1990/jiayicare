"""Publish the reviewed record-summary H5 bundle, preserving demo and existing assets."""
import argparse, hashlib, json, os, pathlib, subprocess, tempfile, zipfile
from ssh_config import connect
ROOT = pathlib.Path(__file__).resolve().parents[1]
SITE = '/var/www/jiayicare-static/mobile-preview-joinwehealth'
sha = lambda b: hashlib.sha256(b).hexdigest()
def git(*args):
    return subprocess.check_output(['git', '-c', 'safe.directory='+ROOT.as_posix(), *args], cwd=ROOT, text=True).strip()
def main():
    parser=argparse.ArgumentParser();parser.add_argument('--build', required=True);parser.add_argument('--dry-run', action='store_true');a=parser.parse_args()
    manifest=json.loads((ROOT/'release/apple-record-summary-manifest.json').read_text(encoding='utf-8'))
    build=pathlib.Path(a.build).resolve()
    files=[]
    for scope, folder, prefix in [('normal','dist',''),('review','dist-review','review/')]:
        for rel, digest in manifest['files'][scope].items():
            path=pathlib.PurePosixPath(rel)
            assert not path.is_absolute() and '..' not in path.parts and '\\' not in rel
            local=build/folder/rel
            assert sha(local.read_bytes())==digest, 'Local bundle changed: '+rel
            files.append({'rel':prefix+rel,'sha':digest,'local':str(local)})
    assert not git('status','--porcelain'), 'Use the clean committed release checkout'
    commit=git('rev-parse','HEAD')
    if a.dry_run:print(json.dumps({'verifiedFiles':len(files),'commit':commit}));return
    with tempfile.TemporaryDirectory(prefix='record-summary-upload-') as tmp:
        archive=pathlib.Path(tmp)/'h5.zip'
        with zipfile.ZipFile(archive,'w',zipfile.ZIP_DEFLATED) as z:
            for f in files:z.write(f['local'],f['rel'])
        digest=sha(archive.read_bytes())
        with connect() as client,client.open_sftp() as sftp:
            def remote(code):
                i,o,e=client.exec_command('python3 -',timeout=180);i.write(code);i.channel.shutdown_write()
                out=o.read().decode();err=e.read().decode();status=o.channel.recv_exit_status()
                if status:raise RuntimeError(err or out)
                return out
            # Refuse to publish to a different backend revision or changed entrypoint.
            for rel, expected in manifest['previousEntries'].items():
                with sftp.open(SITE+'/'+rel,'rb') as f:assert sha(f.read())==expected, 'Live entry changed: '+rel
            stage='/var/backups/jiayicare-record-summary-'+commit[:12]
            remote('import os\nos.mkdir('+repr(stage)+',0o700)')
            sftp.put(str(archive),stage+'/h5.zip')
            code=r"""
import hashlib,json,pathlib,os,shutil,subprocess,zipfile
stage=pathlib.Path(STAGE);site=pathlib.Path(SITE);manifest=MANIFEST;files=FILES
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
assert subprocess.check_output(['git','-C','/var/www/jiayicare','rev-parse','HEAD'],text=True).strip()==COMMIT,'Backend revision changed'
assert sha(stage/'h5.zip')==DIGEST
for rel,digest in manifest['previousEntries'].items():assert sha(site/rel)==digest,'Live entry changed'
with zipfile.ZipFile(stage/'h5.zip') as z:
 assert set(z.namelist())==set(f['rel'] for f in files)
 for f in files:
  rel=pathlib.PurePosixPath(f['rel']);assert not rel.is_absolute() and '..' not in rel.parts
  dest=stage/'files'/rel;dest.parent.mkdir(parents=True,exist_ok=True);dest.write_bytes(z.read(f['rel']))
  assert sha(dest)==f['sha']
  target=site/rel
  if target.exists() and f['rel'] not in manifest['previousEntries']:assert sha(target)==f['sha'],'Immutable asset collision: '+f['rel']
changed=[]
try:
 for f in sorted(files,key=lambda f:f['rel'] in manifest['previousEntries']):
  rel=f['rel'];target=site/rel
  if target.exists() and rel not in manifest['previousEntries']:continue
  target.parent.mkdir(parents=True,exist_ok=True)
  if rel in manifest['previousEntries']:
   assert sha(target)==manifest['previousEntries'][rel]
   backup=stage/'previous'/rel;backup.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(target,backup)
  temp=target.with_name(target.name+'.record-summary-new');shutil.copy2(stage/'files'/rel,temp);temp.chmod(0o644);os.replace(temp,target)
  if rel in manifest['previousEntries']:changed.append(rel)
 for f in files:assert sha(site/f['rel'])==f['sha']
 for rel in manifest['previousEntries']:
  url='https://app.joinwehealth.com/mobile-preview/'+('review/' if rel.startswith('review/') else '')
  body=subprocess.check_output(['curl','-fsS','--max-time','20','--noproxy','*','--resolve','app.joinwehealth.com:443:127.0.0.1',url])
  assert hashlib.sha256(body).hexdigest()==sha(site/rel),'Served entry differs'
 print(json.dumps({'published':True,'commit':COMMIT,'backup':str(stage),'filesVerified':len(files),'preservedDemo':(site/'demo/entry.js').exists()}))
except:
 for rel in reversed(changed):
  tmp=(site/rel).with_name('index.html.record-summary-rollback');shutil.copy2(stage/'previous'/rel,tmp);os.replace(tmp,site/rel)
 raise
"""
            for key,value in [('STAGE',stage),('SITE',SITE),('MANIFEST',manifest),('FILES',[{'rel':f['rel'],'sha':f['sha']} for f in files]),('COMMIT',commit),('DIGEST',digest)]:
                code=code.replace(key,repr(value))
            out=remote(code)
            result=ROOT/'artifacts/record-summary-20261027/h5-deploy.json';result.parent.mkdir(parents=True,exist_ok=True);result.write_text(out,encoding='utf-8');print(out)
if __name__=='__main__':main()
