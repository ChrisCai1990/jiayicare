import React, { useEffect, useRef, useState } from 'react';
import { API_ORIGIN, inAppServiceGroupAPI as api, staffAPI } from '../api';
import './ServiceAssistantPage.css';
import './InAppServiceGroupsPage.css';

const categories = [['advisor','健康顾问','嘉医服务群'],['nutrition','营养师','营养干预服务群'],['medical','就医专员','就医服务群'],['specialty','专科医师','专病管理群']];
const stamp = value => value ? new Date(value).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' }) : '暂无消息';
const roleLabel = person => person.kind === 'customer' ? '客户' : ({ familyDoctor: '健康顾问', nutritionist: '营养师', healthManager: '健管专员', medicalAssistant: '就医专员', specialist: '专科医师', customer: '客户' })[person.role] || person.role || '服务人员';
const memberLabel = person => `${person.name} · ${roleLabel(person)}`;
const customerCode = id => id ? `KH-${id}` : '待核对';

export default function InAppServiceGroupsPage() {
  const [archive, setArchive] = useState(false);
  const [tasks, setTasks] = useState([]);
  const [confirmation, setConfirmation] = useState(null);
  const [checked, setChecked] = useState(false);
  const [note, setNote] = useState('');
  const [mentionIds, setMentionIds] = useState([]);
  const [showMentions, setShowMentions] = useState(false);
  const [mentionAnchor, setMentionAnchor] = useState('');
  const statusRef = useRef('active');
  statusRef.current = archive ? 'closed' : 'active';
  const [category, setCategory] = useState('');
  const categoryRef = useRef('');
  categoryRef.current = category;
  const [groups, setGroups] = useState([]);
  const [selected, setSelected] = useState(null);
  const [older, setOlder] = useState(false);
  const [messages, setMessages] = useState([]);
  const [search, setSearch] = useState('');
  const [patients, setPatients] = useState([]);
  const [draft, setDraft] = useState('');
  const [scope, setScope] = useState(() => new URLSearchParams(window.location.search).get('scope') === 'pending' ? 'pending' : 'all');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [canConfigure, setCanConfigure] = useState(false);
  const [configuration, setConfiguration] = useState(null);
  const [memberIds, setMemberIds] = useState([]);
  const currentId = useRef('');
  const messagePane = useRef(null);
  const followLatest = useRef(true);
  const loadedPages = useRef(1);
  useEffect(() => {
    if (followLatest.current && messagePane.current) messagePane.current.scrollTop = messagePane.current.scrollHeight;
  }, [messages]);
  const refreshing = useRef(false);

  const refresh = async () => {
    if (refreshing.current) return;
    refreshing.current = true;
    const requestedCategory = categoryRef.current;
    const requestedStatus = statusRef.current;
    try {
      const pages = await Promise.all(Array.from({ length: loadedPages.current }, (_, i) => api.list(i + 1, requestedCategory, statusRef.current)));
      if (requestedCategory !== categoryRef.current || requestedStatus !== statusRef.current) return;
      setGroups(pages.flatMap(res => res.data || []));
      setHasMore(!!pages.at(-1)?.hasMore);
      setCanConfigure(!!pages[0]?.canConfigure);
    }
    catch (e) { setError(e.message || '服务群读取失败'); }
    finally { refreshing.current = false; }
  };
  const loadMore = async () => {
    if (busy || !hasMore) return;
    setBusy(true);
    try {
      const nextPage = loadedPages.current + 1;
      const res = await api.list(nextPage, categoryRef.current, statusRef.current);
      loadedPages.current = nextPage;
      setGroups(previous => [...previous, ...(res.data || [])]);
      setHasMore(!!res.hasMore);
    } catch (e) { setError(e.message || '更多服务群读取失败'); }
    finally { setBusy(false); }
  };
  const loadMessages = async (id, before = '') => {
    try {
      const res = await api.messages(id, before);
      if (currentId.current === id) { setMessages(prev=>[...new Map([...prev,...(res.data||[])].map(m=>[String(m.id),m])).values()].sort((a,b)=>+new Date(a.createdAt)-+new Date(b.createdAt)||String(a.id).localeCompare(String(b.id)))); if(before || !messages.length)setOlder(!!res.hasMore); if(res.firstMentionMessageId){setMentionAnchor(String(res.firstMentionMessageId));followLatest.current=false;setTimeout(()=>document.getElementById('sg-msg-'+res.firstMentionMessageId)?.scrollIntoView({block:'center'}),100);} }
    } catch (e) { setError(e.message || '群消息读取失败'); }
  };
  useEffect(() => { loadedPages.current = 1; setGroups([]); refresh(); const timer = setInterval(() => { if (document.visibilityState === 'visible') refresh(); }, 5000); return () => clearInterval(timer); }, [category, archive]);
  useEffect(() => {
    if (!selected) return;
    const timer = setInterval(() => { if (document.visibilityState === 'visible') loadMessages(selected.id); }, 5000);
    return () => clearInterval(timer);
  }, [selected?.id]);
  useEffect(() => {
    if (!selected || selected.supervised || selected.status === 'closed') return;
    const pulse = () => { if (document.visibilityState === 'visible') api.presence(selected.id).catch(() => {}); };
    pulse();
    const timer = setInterval(pulse, 30000);
    document.addEventListener('visibilitychange', pulse);
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', pulse); };
  }, [selected?.id, selected?.supervised, selected?.status]);
  const open = group => { followLatest.current = true; currentId.current = group.id; setSelected(group); setMessages([]); setOlder(false); setDraft(''); setMentionIds([]); setMentionAnchor(''); setShowMentions(false); setError(''); loadMessages(group.id); };
  const findPatient = async () => {
    if (!search.trim()) return setPatients([]);
    try { const res = await staffAPI.getPatients({ search: search.trim(), limit: 10 });
      setPatients(res.data?.patients || []); setError(''); }
    catch (e) { setError(e.message || '客户查询失败'); }
  };
  const editMembers = async (patientId, type = category || 'advisor') => {
    setBusy(true); setError('');
    try {
      const res = await api.configuration(patientId, type);
      setConfiguration(res.data);
      setMemberIds((res.data.memberIds || []).map(String));
    } catch (e) { setError(e.message || '群成员读取失败'); }
    finally { setBusy(false); }
  };
  const saveMembers = async () => {
    if (!configuration || busy) return;
    setBusy(true); setError('');
    try {
      const res = await api.configure({ patientId: configuration.patientId,
        memberIds, serviceType: configuration.serviceType, membershipVersion: configuration.membershipVersion });
      setConfiguration(null); setPatients([]); setSearch('');
      await refresh(); open(res.data);
    } catch (e) { setError(e.message || '保存群成员失败，请刷新后重试'); }
    finally { setBusy(false); }
  };
  const send = async () => {
    if (!selected || !draft.trim() || busy) return;
    setBusy(true); setError('');
    try { await api.send(selected.id, draft.trim(), mentionIds.filter(id=>mentionCandidates.some(p=>String(p.id)===id && draft.includes('@'+p.name+'（'+roleLabel(p)+'）')))); setMentionIds([]); setShowMentions(false); followLatest.current = true; setDraft(''); await loadMessages(selected.id); await refresh(); window.dispatchEvent(new Event('notif-refresh')); }
    catch (e) { setError(e.message || '发送失败'); }
    finally { setBusy(false); }
  };
  const loadTasks = async () => { try { const result = await api.lifecycle(); setTasks(result.data || []); } catch(e){setError(e.message || '确认待办读取失败');} };
  useEffect(()=>{loadTasks();const timer=setInterval(()=>{if(document.visibilityState==='visible')loadTasks();},30000);return()=>clearInterval(timer);},[]);
  const confirmTask = async () => {
    if(!confirmation || busy)return;setBusy(true);setError('');
    try {await api.confirm({...confirmation,checked,note});setConfirmation(null);setSelected(null);currentId.current='';await Promise.all([refresh(),loadTasks()]);window.dispatchEvent(new Event('notif-refresh'));}
    catch(e){setError(e.message || '确认失败，请刷新后重试');}finally{setBusy(false);}
  };
  const mentionCandidates = selected ? [...selected.staff, {...selected.customer,role:'客户'}].filter(p=>p.id) : [];
  const mention = person => {setMentionIds(ids=>[...new Set([...ids,String(person.id)])]);const label=person.name+'（'+roleLabel(person)+'）';setDraft(text=>text.endsWith('@')?text+label+' ':text+'@'+label+' ');setShowMentions(false);};
  const visibleGroups = groups.filter(group => scope === 'all' ||
    scope === 'supervised' && group.supervised ||
    scope === 'pending' && group.waitingForStaff);

  return <main className="service-assistant in-app-service-groups">
    <h1>系统服务群</h1>
    <details className="sg-lifecycle">
      <summary>小嘉服务群待确认（{tasks.length}）</summary>
      {tasks.length>0&&<p>核对服务来源和成员后确认执行；归档保留聊天记录。</p>}
      {tasks.map(task=><div key={task.key} className="sg-task"><strong>{task.name} · {({create:'确认建群',link:'续接 / 关联现有群',archive:'确认服务结束'})[task.action]}</strong><small>{task.sourceLabel}</small><small>{task.members?.map(p=>p.name).join('、')}</small>{!task.ready&&<p>{task.reason}</p>}<button disabled={!task.ready || busy} onClick={()=>{setConfirmation(task);setChecked(false);setNote('');setError('');}}>核对并确认</button></div>)}

    </details>
    {confirmation&&<section className="sg-confirmation" role="dialog" aria-modal="true" aria-label="确认服务群操作">
      <h2>{confirmation.name} · {confirmation.action==='archive'?'结束并归档':confirmation.action==='link'?'续接 / 关联现有群':'创建服务群'}</h2>
      <p>服务依据：{confirmation.sourceLabel}</p><p>成员：{confirmation.members?.map(p=>p.name).join('、') || '保留原成员及历史记录'}</p>
      {confirmation.action==='archive'&&<><p>归档后停止发送消息，历史记录可继续查看。</p>{confirmation.waitingForStaff&&<p role="alert">此群还有待人工回复的客户消息。</p>}{confirmation.warnings?.map((w,i)=><p key={i}>待核对：{w}</p>)}<label><input type="checkbox" checked={checked} onChange={e=>setChecked(e.target.checked)}/>已核对未处理诉求、预约及续约，确认可以结束本次服务</label><textarea aria-label="结束说明" value={note} onChange={e=>setNote(e.target.value)} maxLength={1000} placeholder="填写处理情况及结束说明（内部留痕）"/></>}
      {confirmation.action!=='archive'&&<p>请确认服务已生效且成员正确。新群将由小嘉介绍成员并发送 @提醒。</p>}
      {error&&<p role="alert">{error}</p>}
      <button disabled={busy || (confirmation.action==='archive'&&(!checked||!note.trim()))} onClick={confirmTask}>确认执行</button><button onClick={()=>setConfirmation(null)}>暂不处理</button>
    </section>}
    <div className="sg-filters"><button aria-pressed={!archive} onClick={()=>{setArchive(false);setSelected(null);currentId.current='';}}>服务中</button><button aria-pressed={archive} onClick={()=>{setArchive(true);setSelected(null);currentId.current='';}}>已归档</button></div>
    <nav className="sg-filters" aria-label="服务类型">
      {[['','全部'],...categories.map(([key,label]) => [key,label]),['legacy','原服务群']].map(([key,label]) => <button key={key} aria-pressed={category === key} onClick={() => { setCategory(key); setSelected(null); currentId.current = ''; setConfiguration(null); }}>{label}</button>)}
    </nav>
    <p>客户的健管专员负责建群和选择入群人员；健康顾问、营养师及就医专员担任团队负责人时，可监管本团队成员的服务对话。未入群人员不能回复。</p>
    {canConfigure && <details className="sg-manual"><summary>手动配置服务群</summary>
    <div className="sg-search-row">
      <input aria-label="查找客户" value={search} onChange={e => setSearch(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') findPatient(); }} placeholder="查找负责的客户" />
      <button type="button" onClick={findPatient}>查找</button>
      <button type="button" onClick={refresh}>刷新</button>
    </div>
    <div className="sg-search-results">{patients.map(patient => <button key={patient._id} type="button" disabled={busy}
      onClick={() => editMembers(patient._id)}>{patient.name} · 客户 · {customerCode(patient._id)} · 配置服务群成员</button>)}
    </div>
    </details>}
    {configuration && <section aria-label="配置服务群成员" className="sg-configuration">
      <h2>{configuration.name} · 配置成员</h2>
      <select aria-label="建群类型" value={configuration.serviceType} onChange={e => editMembers(configuration.patientId, e.target.value)}>
        {categories.map(([key,label,suffix]) => <option key={key} value={key}>{label} · {suffix}</option>)}
        {configuration.serviceType === 'legacy' && <option value="legacy">原服务群</option>}
      </select>
      {!configuration.ready && <p role="alert">请先为客户分配本类专业人员和健管专员，再创建服务群。</p>}
      <p>只有当前分配给该客户的服务人员可入群。</p>
      <div className="sg-candidates">{configuration.candidates.map(person => <label key={person._id} className="sg-candidate">
        <input type="checkbox" checked={memberIds.includes(String(person._id))}
          onChange={event => setMemberIds(previous => event.target.checked
            ? [...previous, String(person._id)] : previous.filter(id => id !== String(person._id)))} />
        {person.name} · {person.role}
      </label>)}</div>
      <div className="sg-configuration-actions">
        <button type="button" className="sa-primary" disabled={busy || !configuration.ready || memberIds.length === 0} onClick={saveMembers}>保存群成员</button>
        <button type="button" onClick={() => setConfiguration(null)}>取消</button>
      </div>
    </section>}
    {error && <p role="alert">{error}</p>}
    <div className="sg-filters">
      <button type="button" aria-pressed={scope === 'all'} onClick={() => setScope('all')}>全部服务群（{groups.length}）</button>
      <button type="button" aria-pressed={scope === 'supervised'} onClick={() => setScope('supervised')}>
        团队监管（{groups.filter(group => group.supervised).length}）
      </button>
      <button type="button" aria-pressed={scope === 'pending'} onClick={() => setScope('pending')}>
        待回复（{groups.filter(group => group.waitingForStaff).length}）
      </button>
    </div>
    <div className="sg-workspace">
      <section aria-label="服务群列表" className="sg-group-list">
        {visibleGroups.length === 0 && <p>此范围暂无已配置的服务群。健管专员可查找客户并配置成员。</p>}
        {visibleGroups.map(group => <button key={group.id} type="button" onClick={() => open(group)}
          className={`sg-group-item${selected?.id === group.id ? ' is-selected' : ''}`}
          aria-pressed={selected?.id === group.id}>
          <strong>{group.name || `${group.patientName}的服务群`}</strong>{group.waitingForStaff && <span style={{ background: '#DC3545', color: 'white', borderRadius: 12, padding: '3px 9px', fontSize: 12, display: 'inline-block' }}>● 待人工回复</span>}
          {group.mentionCount > 0 && <span className="sg-mention-badge">有人@我 · {group.mentionCount}</span>}{group.status==='closed'&&<small>已归档 · {stamp(group.closedAt)}</small>}
          {group.supervised && <small>团队监管 · 只读</small>}
          <small>客户：{group.patientName} · {customerCode(group.patientId)}</small>
          <small>{group.staff.map(memberLabel).join('、')}</small>
          <small>{stamp(group.lastMessageAt)}{group.waitingForStaff ? ' · 待团队回复' : ''}</small>
        </button>)}
        {hasMore && <button type="button" disabled={busy} onClick={loadMore}>加载更多服务群</button>}
      </section>
      <section aria-label="群消息" className="sg-chat-panel">
        {selected ? <>
          <div className="sg-chat-header">
            <div><h2>{selected.name || `${selected.patientName}的服务群`}</h2>
              <small>客户：{selected.patientName} · {customerCode(selected.patientId)}</small><br />
              <small>团队成员：{selected.staff.map(memberLabel).join('、')}</small></div>
            {selected.canConfigure && selected.status !== 'closed' && <button type="button" onClick={() => editMembers(selected.patientId, selected.serviceType)}>调整群成员</button>}
          </div>
          {selected.assistant && <div style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '8px 20px', background: '#eef9f9' }}>
            <img alt="小嘉" src={API_ORIGIN + selected.assistant.avatar} style={{ width: 40, height: 40, borderRadius: '50%' }} />
            <small>小嘉｜嘉医汇AI健康管家 · {selected.supervised ? '仅监管查看不影响AI接待' : '您正在接待此群，小嘉暂停回复；离开后恢复自动接待'}</small>
          </div>}
          <div className="sg-messages" ref={messagePane} onScroll={event => { const pane = event.currentTarget; followLatest.current = pane.scrollHeight - pane.scrollTop - pane.clientHeight < 48; }}>
            {older&&<button onClick={()=>{followLatest.current=false;loadMessages(selected.id,messages[0]?.id);}}>查看更早消息</button>}
            {messages.length === 0 && <p className="sg-empty-messages">暂无消息，可以开始沟通。</p>}
            {messages.map(message => <article id={'sg-msg-'+message.id} key={message.id}
              className={`sg-message${message.senderType === 'staff' ? ' is-staff' : ''}`}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                {message.senderAvatar && <img alt="" src={message.senderAvatar.startsWith('/') ? API_ORIGIN + message.senderAvatar : message.senderAvatar} style={{ width: 36, height: 36, borderRadius: '50%', objectFit: 'cover' }} />}
                <small>{message.senderName} · {({ familyDoctor: '健康顾问', nutritionist: '营养师', healthManager: '健管专员', medicalAssistant: '就医专员', specialist: '专科医师', customer: '客户', ai: '嘉医汇AI健康管家' })[message.senderRole] || '服务人员'} · {stamp(message.createdAt)}</small>
              </div>
              {mentionAnchor===String(message.id)&&<strong className="sg-mention-badge">有人@我</strong>}
              <div style={{whiteSpace:'pre-wrap'}}>{message.content}</div>
              {!!message.mentions?.length&&<div className="sg-mention-links">{message.mentions.map(p=><button key={p.id} onClick={()=>window.alert(`${p.name} · ${p.role || '服务成员'}`)}> @{p.name} · {p.role}</button>)}</div>}
            </article>)}
          </div>
          {selected.status==='closed' ? <p className="sg-readonly">本次服务已结束，历史记录仅供查看。</p> : selected.supervised ? <p className="sg-readonly">仅监管查看，未入群不能回复。</p>
            : <div className="sg-composer">
              <div className="sg-mention-picker"><button aria-label="选择@成员" onClick={()=>setShowMentions(!showMentions)}> @成员</button>{showMentions&&<div>{mentionCandidates.map(p=><button key={p.id} onClick={()=>mention(p)}>{memberLabel(p)}</button>)}</div>}</div>
              <textarea aria-label="服务群消息" value={draft} onChange={e => {setDraft(e.target.value);if(e.target.value.endsWith('@'))setShowMentions(true);}}
                maxLength={2000} rows={4} placeholder="给客户发送消息…" />
              <button type="button" className="sa-primary" disabled={busy || !draft.trim()} onClick={send}>发送</button>
            </div>}
        </> : <p className="sg-select-prompt">从左侧选择一个服务群，查看对话记录。</p>}
      </section>
    </div>
  </main>;
}
