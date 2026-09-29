#!/usr/bin/env python3
"""Fast-forward an already pushed, public-site-only commit and publish its files.

No application build, process restart, database write or Nginx change. Changed
public files are backed up and checked for concurrent changes before replacement.
"""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess
import tempfile
import time
from ssh_config import connect

ROOT = Path(__file__).resolve().parents[1]
REMOTE_REPO = '/var/www/jiayicare'
PUBLIC = {'corporate-site': '/var/www/jiayicare-static/corporate', 'geo-knowledge-center': '/var/www/jiayicare-static/knowledge'}

def git(*args):
    return subprocess.check_output(['git', *args], cwd=ROOT, text=True).strip()

def run(client, command):
    _, out, err = client.exec_command(command, timeout=120)
    text = out.read().decode('utf-8', 'replace')
    error = err.read().decode('utf-8', 'replace')
    if out.channel.recv_exit_status():
        raise RuntimeError(error or text or 'Remote command failed')
    return text.strip()

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--expected-revision', required=True)
    args = parser.parse_args()
    base = args.expected_revision
    if len(base) != 40 or any(c not in '0123456789abcdef' for c in base):
        raise RuntimeError('Expected revision must be a full commit hash')
    if git('status', '--porcelain'):
        raise RuntimeError('Commit and review local changes first')
    revision = git('rev-parse', 'HEAD')
    if git('rev-parse', 'origin/master') != revision:
        raise RuntimeError('HEAD must first be pushed to origin/master')
    subprocess.run(['git', 'merge-base', '--is-ancestor', base, revision], cwd=ROOT, check=True)
    changed = git('diff', '--name-only', base, revision).splitlines()
    allowed = ('corporate-site/', 'geo-knowledge-center/', 'docs/WEBSITE_GEO_', 'scripts/deploy_public_sites.py', 'AGENTS.md', 'CLAUDE.md')
    if not changed or any(not name.startswith(allowed) for name in changed):
        raise RuntimeError('Release includes changes outside the public-site scope')
    subprocess.run(['node', 'geo-knowledge-center/scripts/release-preflight.mjs'], cwd=ROOT, check=True)
    files = []
    for name in changed:
        parts = Path(name).parts
        if parts[0] not in PUBLIC or len(parts) < 2 or parts[1] in {'content', 'scripts', '.preview'}:
            continue
        if Path(name).suffix not in {'.html', '.css', '.js', '.json', '.xml', '.txt', '.png', '.jpg', '.svg'}:
            continue
        if not (ROOT / name).is_file():
            raise RuntimeError('Public deletions require a separate reviewed migration')
        files.append({'source': name, 'target': PUBLIC[parts[0]] + '/' + '/'.join(parts[1:]), 'sha256': hashlib.sha256((ROOT / name).read_bytes()).hexdigest()})
    client = connect()
    try:
        if run(client, f'git -C {REMOTE_REPO} rev-parse HEAD') != base:
            raise RuntimeError('Production advanced; rebase and retry against the new revision')
        if run(client, f'git -C {REMOTE_REPO} status --porcelain --untracked-files=no'):
            raise RuntimeError('Production source has uncommitted changes')
        stage = f'/tmp/jiayicare-public-{revision[:12]}-{int(time.time())}'
        run(client, f'mkdir -m 700 {stage}')
        sftp = client.open_sftp()
        # Runtime publication may have newer articles than the Git snapshot.
        live_catalog = json.loads(sftp.open(PUBLIC['geo-knowledge-center'] + '/published-articles.json').read())
        local_catalog = json.loads((ROOT / 'geo-knowledge-center/published-articles.json').read_text('utf-8'))
        if live_catalog != local_catalog:
            raise RuntimeError('Live content catalogue changed; preserve it before deploying')
        for index, item in enumerate(files):
            try:
                old = sftp.open(item['target']).read()
                item['before'] = hashlib.sha256(old).hexdigest()
            except FileNotFoundError:
                item['before'] = None
            sftp.put(str(ROOT / item['source']), f'{stage}/file-{index}')
        with tempfile.TemporaryDirectory(prefix='jiayicare-public-bundle-') as temp:
            bundle = Path(temp) / 'release.bundle'
            subprocess.run(['git', 'bundle', 'create', str(bundle), f'{base}..HEAD'], cwd=ROOT, check=True)
            sftp.put(str(bundle), stage + '/release.bundle')
        manifest = {'base': base, 'revision': revision, 'files': files, 'catalogHash': hashlib.sha256(sftp.open(PUBLIC['geo-knowledge-center'] + '/published-articles.json').read()).hexdigest()}
        with sftp.open(stage + '/manifest.json', 'w') as out:
            out.write(json.dumps(manifest))
        remote = r'''
import fcntl,hashlib,json,os,pathlib,shutil,subprocess,sys
stage=pathlib.Path(sys.argv[1]); manifest=json.loads((stage/'manifest.json').read_text())
repo='/var/www/jiayicare'
def git(*args):return subprocess.check_output(['git','-C',repo,*args],text=True).strip()
def digest(p):return hashlib.sha256(p.read_bytes()).hexdigest() if p.exists() else None
with open('/tmp/jiayicare-public-sites.lock','w') as lock:
 fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
 if git('rev-parse','HEAD')!=manifest['base'] or git('status','--porcelain','--untracked-files=no'):raise RuntimeError('Production changed')
 if digest(pathlib.Path('/var/www/jiayicare-static/knowledge/published-articles.json'))!=manifest['catalogHash']:raise RuntimeError('Published content changed')
 for i,item in enumerate(manifest['files']):
  target=pathlib.Path(item['target'])
  if not any(target.is_relative_to(root) for root in ['/var/www/jiayicare-static/knowledge','/var/www/jiayicare-static/corporate']):raise RuntimeError('Invalid public path')
  if digest(target)!=item['before']:raise RuntimeError('Public file changed: '+str(target))
  if digest(stage/('file-'+str(i)))!=item['sha256']:raise RuntimeError('Upload hash mismatch')
 backup=pathlib.Path('/var/backups/jiayicare-public')/stage.name
 backup.mkdir(parents=True,exist_ok=False)
 shutil.copy2(stage/'manifest.json',backup/'manifest.json')
 for i,item in enumerate(manifest['files']):
  if item['before'] is not None:shutil.copy2(item['target'],backup/('file-'+str(i)))
 git('fetch',str(stage/'release.bundle'),'HEAD')
 # Preserve runtime-generated articles before Git starts tracking them.
 untracked=set(git('ls-files','--others','--exclude-standard').splitlines())
 relocated=[]
 try:
  for i,item in enumerate(manifest['files']):
   if item['source'] not in untracked:continue
   source=pathlib.Path(repo)/item['source']
   if not item['source'].startswith('geo-knowledge-center/guides/') or source.suffix!='.html' or digest(source)!=item['before']:raise RuntimeError('Untracked source differs from published article: '+item['source'])
   saved=backup/('source-'+str(i));shutil.move(source,saved);relocated.append((source,saved))
  git('merge','--ff-only',manifest['revision'])
 except Exception:
  for source,saved in relocated:
   if not source.exists():shutil.copy2(saved,source)
  raise
 applied=[]
 try:
  for i,item in enumerate(manifest['files']):
   target=pathlib.Path(item['target']);target.parent.mkdir(parents=True,exist_ok=True);os.chmod(target.parent,0o755)
   temporary=target.with_name(target.name+'.release-tmp');shutil.copyfile(stage/('file-'+str(i)),temporary);os.chmod(temporary,0o644);os.replace(temporary,target);applied.append((i,item))
  for item in manifest['files']:
   if digest(pathlib.Path(item['target']))!=item['sha256']:raise RuntimeError('Published hash mismatch')
 except Exception:
  for i,item in reversed(applied):
   if item['before'] is None:pathlib.Path(item['target']).unlink(missing_ok=True)
   else:shutil.copy2(backup/('file-'+str(i)),item['target'])
  raise
 print(json.dumps({'revision':git('rev-parse','HEAD'),'published':len(applied),'backup':str(backup)}))
'''
        with sftp.open(stage + '/apply.py', 'w') as out:
            out.write(remote)
        sftp.close()
        print(run(client, f'python3 {stage}/apply.py {stage}'))
    finally:
        client.close()

if __name__ == '__main__':
    main()
