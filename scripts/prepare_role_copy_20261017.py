"""Build a copy-only release from exact live assets; never rebuild a dirty checkout."""
import pathlib,json,hashlib,re,subprocess
ROOT=pathlib.Path(__file__).resolve().parents[1]
BASE=ROOT/'release/role-copy-20261017/baseline'
OUT=BASE.parent/'candidate';OUT.mkdir(exist_ok=True)
OLD_INTRO='嘉医汇健康管家平台由杭州嘉静佑辰科技有限公司运营，杭州嘉医汇健康管理有限公司提供健康管理服务。'
INTRO='嘉医汇健康管家由杭州嘉医汇健康管理有限公司运营并提供健康管理服务，杭州嘉静佑辰科技有限公司按嘉医汇要求提供系统研发、维护与技术支持。'
OLD_ROLE='杭州嘉静佑辰科技有限公司负责平台运营、研发、运维及技术支持；杭州嘉医汇健康管理有限公司负责实际健康管理服务。双方仅在各自职责及实现相应服务所必需的范围内处理个人信息。'
ROLE='杭州嘉医汇健康管理有限公司决定客户个人信息的处理目的和方式，承担相应的个人信息保护责任。杭州嘉静佑辰科技有限公司作为受托技术服务方，按嘉医汇要求提供系统研发、维护与技术支持，仅在委托范围及提供相应技术服务所必需的范围内处理个人信息，不自行决定客户健康资料的用途。'
OLD_CONTACT='平台运营方：杭州嘉静佑辰科技有限公司；健康管理服务提供方：杭州嘉医汇健康管理有限公司。'
CONTACT='应用运营及健康管理服务提供方、个人信息处理者：杭州嘉医汇健康管理有限公司；受托技术服务方：杭州嘉静佑辰科技有限公司。'
REPLACEMENTS=[(OLD_INTRO,INTRO),(OLD_ROLE,ROLE),(OLD_CONTACT,CONTACT),('5. 平台、服务方与第三方服务','5. 个人信息处理者、受托技术服务方与第三方服务')]
sha=lambda b:hashlib.sha256(b).hexdigest()
def privacy(t):
 for old,new in REPLACEMENTS:
  assert old in t,old
  t=t.replace(old,new)
 t=t.replace('不因本次主体说明而扩大信息使用范围。','本次更新澄清双方职责，不扩大信息使用范围。')
 t=re.sub(r'(更新日期：|生效日期：)2026年10月\d+日',r'\g<1>2026年10月17日',t)
 t=t.replace('"heading":"运营主体"','"heading":"运营主体（2026年10月17日更新）"')
 return t
items=json.loads((BASE.parent/'baseline.json').read_text(encoding='utf-8'))
lookup={x['name']:x for x in items};files=[]
def add(oldname,newname,data,kind):
 old=lookup[oldname];p=OUT/newname;p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(data)
 remote=old['path'] if kind in ['page','entry'] else str(pathlib.PurePosixPath(old['path']).with_name(pathlib.PurePosixPath(newname).name))
 files.append(dict(oldPath=old['path'],path=remote,oldSha=old['sha'],sha=sha(data),name=newname,kind=kind))
for name in ['corporate-privacy.html','app-privacy.html']:
 add(name,name,privacy((BASE/name).read_text(encoding='utf-8')).encode(),'page')
t=(BASE/'app.html').read_text(encoding='utf-8')
t=t.replace('嘉医汇健康管家 App 由杭州嘉静佑辰科技有限公司运营，','嘉医汇健康管家 App 由杭州嘉医汇健康管理有限公司运营，')
anchor='嘉医汇健康管家 App 由杭州嘉医汇健康管理有限公司运营，为用户提供'
assert anchor in t
t=t.replace(anchor,'嘉医汇健康管家 App 由杭州嘉医汇健康管理有限公司运营，杭州嘉静佑辰科技有限公司按嘉医汇要求提供系统研发、维护与技术支持，为用户提供')
add('app.html','app.html',t.encode(),'page')
t=(BASE/'support.html').read_text(encoding='utf-8')
assert '杭州嘉医汇健康管理有限公司' in t
t=t.replace('杭州嘉医汇健康管理有限公司','杭州嘉医汇健康管理有限公司；受托技术服务方：杭州嘉静佑辰科技有限公司（按嘉医汇要求提供系统研发、维护与技术支持）',1)
add('support.html','support.html',t.encode(),'page')
for scope in ['android','android-review','ios','ios-review']:
 chunk=next((BASE/scope).glob('531.*.js'));data=privacy(chunk.read_text(encoding='utf-8')).encode()
 newchunk='531.'+sha(data)[:8]+'.js';add(scope+'/'+chunk.name,scope+'/'+newchunk,data,'asset')
 main=next((BASE/scope).glob('app.*.js'));t=main.read_text(encoding='utf-8')
 oldhash=chunk.name.split('.')[1];newhash=newchunk.split('.')[1]
 assert t.count('531:"'+oldhash+'"')==1
 t=t.replace('531:"'+oldhash+'"','531:"'+newhash+'"');data=t.encode()
 newmain='app.'+sha(data)[:8]+'.js';add(scope+'/'+main.name,scope+'/'+newmain,data,'asset')
 html=(BASE/scope/'index.html').read_bytes();assert html.count(main.name.encode())==1
 add(scope+'/index.html',scope+'/index.html',html.replace(main.name.encode(),newmain.encode()),'entry')
# Guard: all modifications are reversible literal copy substitutions or lazy-chunk references.
for f in files:
 if f['name'].endswith('.js'):subprocess.run(['node','--check',str(OUT/f['name'])],check=True,capture_output=True)
(BASE.parent/'manifest.json').write_text(json.dumps(files,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps({'prepared':len(files),'syntax':'passed','published':False}))
