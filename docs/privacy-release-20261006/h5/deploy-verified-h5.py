"""Publish verified H5 assets only; preserve old hashes and review isolation."""
import pathlib,json,hashlib,time,shlex,subprocess
from ssh_config import connect
ROOT=pathlib.Path(__file__).resolve().parents[1]
BASE=json.loads((ROOT/'artifacts/privacy-h5-baseline-20261006.json').read_text())
def sha(p): return hashlib.sha256(p.read_bytes()).hexdigest()
def run(c,code):
    i,o,e=c.exec_command('python3 -',timeout=120);i.write(code);i.channel.shutdown_write()
    out=o.read().decode();err=e.read().decode()
    if o.channel.recv_exit_status():raise RuntimeError(err or out)
    return json.loads(out)
def main():
    plans=[]
    for name,baseline in BASE.items():
        src=ROOT/'miniprogram'/name
        files={p.relative_to(src).as_posix():sha(p) for p in src.rglob('*') if p.is_file()}
        changed=[rel for rel,h in files.items() if h not in baseline['files'].values()]
        assert len(files)==101 and len(changed)==4,changed
        assert all(rel=='index.html' or rel.startswith(('js/531.','js/554.','js/app.')) for rel in changed),changed
        legal=[src/p for p in changed if p.startswith('js/531.')][0].read_text(encoding='utf-8')
        assert '民族与宗教信仰由您自愿提供' in legal and '2026年10月6日' in legal
        subprocess.run([str(ROOT.parent/'.tools/node-v22.14.0-win-x64/node.exe'),str(ROOT/'miniprogram/scripts/check-h5-syntax.cjs'),str(src)],check=True)
        plans.append({'name':name,'target':baseline['remote'],'old':baseline['files'],'new':files,'changedContent':changed})
    stamp=str(int(time.time()));backup='/var/backups/jiayicare-h5-privacy-'+stamp
    client=connect();sftp=client.open_sftp()
    try:
        for plan in plans:
            stage=plan['target']+'.privacy-stage-'+stamp;plan['stage']=stage
            sftp.mkdir(stage);created={stage}
            upload={rel:h for rel,h in plan['new'].items() if plan['old'].get(rel)!=h};plan['upload']=upload
            for rel in upload:
                folder=stage
                for part in rel.split('/')[:-1]:
                    folder+='/'+part
                    if folder not in created:sftp.mkdir(folder);created.add(folder)
                sftp.put(str(ROOT/'miniprogram'/plan['name']/rel),stage+'/'+rel)
        code='plans='+repr(plans)+'\nbackup='+repr(backup)+'\n'+r'''
import pathlib,hashlib,shutil,json,os,subprocess
def h(p):return hashlib.sha256(p.read_bytes()).hexdigest()
b=pathlib.Path(backup);b.mkdir()
for plan in plans:
    t=pathlib.Path(plan['target']);s=pathlib.Path(plan['stage'])
    for rel,want in plan['old'].items():
        assert h(t/rel)==want,'Live baseline changed: '+rel
    for rel,want in plan['upload'].items():
        assert '..' not in pathlib.PurePosixPath(rel).parts
        assert h(s/rel)==want,'Upload mismatch'
    (b/plan['name']).mkdir();shutil.copy2(t/'index.html',b/plan['name']/'index.html')
try:
    for plan in plans:
        t=pathlib.Path(plan['target']);s=pathlib.Path(plan['stage'])
        for rel in plan['upload']:
            if rel=='index.html':continue
            dest=t/rel;dest.parent.mkdir(parents=True,exist_ok=True)
            if dest.exists():
                save=b/plan['name']/rel;save.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(dest,save)
            os.replace(s/rel,dest)
        os.replace(s/'index.html',t/'index.html')
        for rel,want in plan['new'].items():assert h(t/rel)==want
    subprocess.run(['curl','-fsS','--noproxy','*','--resolve','jiaycare.com:443:127.0.0.1','https://jiaycare.com/api/health'],check=True,capture_output=True)
except Exception:
    for plan in plans:
        t=pathlib.Path(plan['target'])
        for old in (b/plan['name']).rglob('*'):
            if old.is_file():shutil.copy2(old,t/old.relative_to(b/plan['name']))
    raise
print(json.dumps({'backup':backup,'versions':[{'name':p['name'],'files':len(p['new']),'uploaded':len(p['upload']),'changedContent':p['changedContent']} for p in plans],'healthPassed':True}))
'''
        result=run(client,code)
        (ROOT/'artifacts/privacy-h5-release-20261006.json').write_text(json.dumps(result,indent=2),encoding='utf-8')
        print(json.dumps(result))
    finally:sftp.close();client.close()
if __name__=='__main__':main()
