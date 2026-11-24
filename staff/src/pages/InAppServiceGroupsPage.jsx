import GroupVoiceInput from '../components/GroupVoiceInput';
import { readGroupChatAttachment } from '../utils/groupChatAttachment';
import GroupVoiceMessage from '../components/GroupVoiceMessage';
import ServiceGroupHistory from '../components/ServiceGroupHistory';
import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { API_ORIGIN, inAppServiceGroupAPI as api, staffAPI } from '../api';
import { messageTimeSeparator } from '../utils/messageTime.js';
import './ServiceAssistantPage.css';
import './InAppServiceGroupsPage.css';

const categories = [['advisor','健康顾问','嘉医服务群'],['nutrition','营养师','营养干预服务群'],['medical','就医专员','就医服务群'],['specialty','专科医师','专病管理群']];
const stamp = value => value ? new Date(value).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' }) : '暂无消息';
const roleLabel = person => person.kind === 'customer' ? '客户' : ({ familyDoctor: '健康顾问', nutritionist: '营养师', healthManager: '健管专员', medicalAssistant: '就医专员', specialist: '专科医师', ai:'AI健康管家', customer: '客户' })[person.role] || person.role || '服务人员';
const mentionLabel = person => person.kind === 'customer' || person.role === '客户' ? person.name : `${person.name}（${roleLabel(person)}）`;
const memberLabel = person => `${person.name} · ${roleLabel(person)}`;

export default function InAppServiceGroupsPage() {
  const staffId = (() => { try { return String(JSON.parse(localStorage.getItem('jy_staff_info'))?._id || ''); } catch { return ''; } })();
  const [previewImage,setPreviewImage]=useState('');
  const [historyOpen,setHistoryOpen]=useState(false);
  const [quote,setQuote]=useState(null),[quoteMenu,setQuoteMenu]=useState(null),[historyAnchor,setHistoryAnchor]=useState(null);
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
  const linkedGroup=useRef(new URLSearchParams(window.location.search).get('groupId')||'');
  const [groupSearch,setGroupSearch]=useState('');
  const [groupQuery,setGroupQuery]=useState('');
  const queryRef=useRef('');queryRef.current=groupQuery;
  const [groups, setGroups] = useState([]);
  const [selected, setSelected] = useState(null);
  const [older, setOlder] = useState(false);
  const [messages, setMessages] = useState([]);
  const [search, setSearch] = useState('');
  const [patients, setPatients] = useState([]);
  const [emojiOpen,setEmojiOpen]=useState(false);
  const emojiPicker=useRef(null);
  const draftInput=useRef(null);
  useEffect(()=>{if(!emojiOpen)return;const outside=event=>{if(!emojiPicker.current?.contains(event.target))setEmojiOpen(false);};document.addEventListener('pointerdown',outside);return()=>document.removeEventListener('pointerdown',outside);},[emojiOpen]);

  const emojis=['😊','🙂','😄','🤗','🙏','🤝','👍','👌','💪','❤️','🌹','🌷','🌞','🎉','👏','✅','💐','🍀','☕','🌙'];
  const mentionPosition=useRef(null);
  const [voiceMode,setVoiceMode]=useState(false);
  useEffect(()=>{if(!voiceMode&&!emojiOpen)draftInput.current?.focus();},[voiceMode]);
  const [draft, setDraft] = useState('');
  const [pendingFile, setPendingFile] = useState(null);
  const [attaching, setAttaching] = useState(false);
  const addAttachment = async file => {
    if (!file || busy || attaching) return;
    const groupId = currentId.current;
    setAttaching(true);
    try {
      const attachment = await readGroupChatAttachment(file);
      if (currentId.current === groupId) { setPendingFile(attachment); setError(''); setVoiceMode(false); }
    } catch (error) { if (currentId.current === groupId) setError(error.message || '读取附件失败'); }
    finally { setAttaching(false); }
  };
  const pasteAttachment = event => {
    const images = Array.from(event.clipboardData?.items || []).filter(item => item.kind === 'file' && item.type.startsWith('image/'));
    if (!images.length) return;
    event.preventDefault();
    if (images.length > 1) { setError('每次只能发送一张图片'); return; }
    const pastedText = event.clipboardData.getData('text/plain');
    if (pastedText) {
      const { selectionStart, selectionEnd } = event.currentTarget;
      setDraft(value => (value.slice(0, selectionStart) + pastedText + value.slice(selectionEnd)).slice(0, 2000));
    }
    void addAttachment(images[0].getAsFile());
  };
  useLayoutEffect(() => {
    const input = draftInput.current;
    if (!input) return;
    const fit = () => {
      const style = getComputedStyle(input);
      const padding = parseFloat(style.paddingTop) + parseFloat(style.paddingBottom);
      const border = parseFloat(style.borderTopWidth) + parseFloat(style.borderBottomWidth);
      const line = parseFloat(style.lineHeight);
      input.style.height = 'auto';
      const height = Math.min(input.scrollHeight + border, line * 3 + padding + border);
      input.style.height = `${height}px`;
      input.style.overflowY = input.scrollHeight + border > height ? 'auto' : 'hidden';
    };
    fit();
    let width = input.clientWidth;
    const observer = new ResizeObserver(() => {
      if (input.clientWidth !== width) { width = input.clientWidth; fit(); }
    });
    observer.observe(input);
    return () => observer.disconnect();
  }, [draft, voiceMode, selected?.id, selected?.supervised, selected?.status]);

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

  const refresh = async (force=false) => {
    if (refreshing.current && !force) return;
    refreshing.current = true;
    const requestedQuery=queryRef.current;
    const requestedCategory = categoryRef.current;
    const requestedStatus = statusRef.current;
    try {
      const pages = await Promise.all(Array.from({ length: loadedPages.current }, (_, i) => api.list(i + 1, requestedCategory, requestedStatus, requestedQuery)));
      if (requestedCategory !== categoryRef.current || requestedStatus !== statusRef.current || requestedQuery !== queryRef.current) return;
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
      const category=categoryRef.current,status=statusRef.current,query=queryRef.current;
      const res = await api.list(nextPage, category, status, query);
      if(category!==categoryRef.current || status!==statusRef.current || query!==queryRef.current)return;
      loadedPages.current = nextPage;
      setGroups(previous => [...previous, ...(res.data || [])]);
      setHasMore(!!res.hasMore);
    } catch (e) { setError(e.message || '更多服务群读取失败'); }
    finally { setBusy(false); }
  };
  const loadMessages = async (id, before = '') => {
    try {
      const res = await api.messages(id, before);
      if (currentId.current === id) { const rows=res.data||[];setMessages(prev=>{const retained=before?prev:(rows.length?prev.filter(m=>+new Date(m.createdAt)<+new Date(rows[0].createdAt)):[]);return [...new Map([...retained,...rows].map(m=>[String(m.id),m])).values()].sort((a,b)=>+new Date(a.createdAt)-+new Date(b.createdAt)||String(a.id).localeCompare(String(b.id)));}); if(before || !messages.length)setOlder(!!res.hasMore); if(res.firstMentionMessageId){setMentionAnchor(String(res.firstMentionMessageId));followLatest.current=false;setTimeout(()=>document.getElementById('sg-msg-'+res.firstMentionMessageId)?.scrollIntoView({block:'center'}),100);} }
    } catch (e) { setError(e.message || '群消息读取失败'); }
  };
  useEffect(() => { loadedPages.current = 1; setGroups([]); refresh(true); const timer = setInterval(() => { if (document.visibilityState === 'visible') refresh(); }, 5000); return () => clearInterval(timer); }, [category, archive, groupQuery]);
  useEffect(() => {
    if (!selected) return;
    const timer = setInterval(() => { if (document.visibilityState === 'visible') loadMessages(selected.id); }, 5000);
    return () => clearInterval(timer);
  }, [selected?.id]);
  useEffect(() => {
    if (!selected || selected.supervised || selected.status === 'closed') return;
    const pulse = () => { if (document.visibilityState === 'visible' && document.hasFocus()) api.presence(selected.id).catch(() => {}); };
    pulse();
    const timer = setInterval(pulse, 30000);
    document.addEventListener('visibilitychange', pulse);
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', pulse); };
  }, [selected?.id, selected?.supervised, selected?.status]);
  useEffect(()=>{const id=linkedGroup.current;if(!id)return;linkedGroup.current='';let active=true;api.list(1,'','active','',id).then(result=>{if(active&&result.data?.[0])open(result.data[0]);else if(active)setError('服务群已归档或您已不在服务范围内');}).catch(e=>active&&setError(e.message));return()=>{active=false;};},[]);
  const open = group => { followLatest.current = true; currentId.current = group.id; setSelected(group); setMessages([]); setOlder(false); setDraft('');setPendingFile(null);setQuote(null);setQuoteMenu(null); setMentionIds([]); setMentionAnchor(''); setShowMentions(false); setError(''); loadMessages(group.id); };
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
    if (!selected || (!draft.trim() && !pendingFile) || busy || attaching) return;
    setBusy(true); setError('');
    try { if (pendingFile) await api.sendFile(selected.id,pendingFile,draft.trim(),quote?.id);
      else await api.send(selected.id, draft.trim(), mentionIds.filter(id=>mentionCandidates.some(p=>String(p.id)===id && draft.includes('@'+mentionLabel(p)))),quote?.id);
      setPendingFile(null);setMentionIds([]); setShowMentions(false); followLatest.current = true; setDraft('');setQuote(null);setQuoteMenu(null); await loadMessages(selected.id); await refresh(); window.dispatchEvent(new Event('notif-refresh')); }
    catch (e) { setError(e.message || '发送失败'); }
    finally { setBusy(false); }
  };
  const recall = async message => {
    if (!selected || busy || !window.confirm('确定撤回这条消息吗？')) return;
    setBusy(true);setError('');
    try {
      await api.recall(selected.id,message.id);
      setMessages(rows=>rows.filter(row=>String(row.id)!==String(message.id)));
      setQuote(current=>String(current?.id)===String(message.id)?null:current);
      setQuoteMenu(null);
      await refresh();
      window.dispatchEvent(new Event('notif-refresh'));
    } catch(e) {setError(e.message || '撤回失败');}
    finally {setBusy(false);}
  };
  const loadTasks = async () => { try { const result = await api.lifecycle(); setTasks(result.data || []); } catch(e){setError(e.message || '确认待办读取失败');} };
  useEffect(()=>{loadTasks();const timer=setInterval(()=>{if(document.visibilityState==='visible')loadTasks();},30000);return()=>clearInterval(timer);},[]);
  const confirmTask = async () => {
    if(!confirmation || busy)return;setBusy(true);setError('');
    try {await api.confirm({...confirmation,checked,note});setConfirmation(null);setSelected(null);currentId.current='';await Promise.all([refresh(),loadTasks()]);window.dispatchEvent(new Event('notif-refresh'));}
    catch(e){setError(e.message || '确认失败，请刷新后重试');}finally{setBusy(false);}
  };
  const mentionCandidates = selected ? [...selected.staff, {...selected.customer,role:'客户'}, {...selected.assistant,role:'ai'}].filter(p=>p.id) : [];
  const mention = person => {setMentionIds(ids=>[...new Set([...ids,String(person.id)])]);const label=mentionLabel(person);setDraft(text=>{const at=mentionPosition.current;return at!=null&&text[at]==='@'?text.slice(0,at)+'@'+label+' '+text.slice(at+1):text+'@'+label+' ';});setShowMentions(false);};
  const visibleGroups = groups.filter(group => scope === 'all' ||
    scope === 'supervised' && group.supervised ||
    scope === 'pending' && group.waitingForStaff);

  return <main className={`service-assistant in-app-service-groups${selected ? ' sg-chat-open' : ''}`}>
    <h1>系统服务群</h1>
    <details className={`sg-lifecycle${tasks.length ? '' : ' is-empty'}`}>
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
    <div className="sg-filters sg-status-filters"><button aria-pressed={!archive} onClick={()=>{setArchive(false);setSelected(null);currentId.current='';}}>服务中</button><button aria-pressed={archive} onClick={()=>{setArchive(true);setSelected(null);currentId.current='';}}>已归档</button></div>
    <form className="sg-search-row" role="search" onSubmit={event=>{event.preventDefault();setGroupQuery(groupSearch.trim());setSelected(null);currentId.current='';}}>
      <input aria-label="搜索服务群" maxLength={80} value={groupSearch} onChange={e=>setGroupSearch(e.target.value)} placeholder="搜索客户姓名或群名称" />
      <button type="submit">搜索群</button>
      {(groupSearch || groupQuery) && <button type="button" onClick={()=>{setGroupSearch('');setGroupQuery('');}}>清除</button>}
    </form>
    <nav className="sg-filters sg-category-filters" aria-label="服务类型">
      {[['','全部'],...categories.map(([key,label]) => [key,label]),['legacy','原服务群']].map(([key,label]) => <button key={key} aria-pressed={category === key} onClick={() => { setCategory(key); setSelected(null); currentId.current = ''; setConfiguration(null); }}>{label}</button>)}
    </nav>
    <p className="sg-permission-note">所属健康顾问统筹查看客户全部服务群；其他岗位仅查看自己参与的服务群，团队负责人可只读监管本团队成员参与的群。健管专员负责建群，未入群人员不能回复。</p>
    {canConfigure && <details className="sg-manual"><summary>手动配置服务群</summary>
    <div className="sg-search-row">
      <input aria-label="查找客户" value={search} onChange={e => setSearch(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') findPatient(); }} placeholder="查找负责的客户" />
      <button type="button" onClick={findPatient}>查找</button>
      <button type="button" onClick={refresh}>刷新</button>
    </div>
    <div className="sg-search-results">{patients.map(patient => <button key={patient._id} type="button" disabled={busy}
      onClick={() => editMembers(patient._id)}>{patient.name} · 客户 · 配置服务群成员</button>)}
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
    <div className="sg-filters sg-scope-filters">
      <button type="button" aria-pressed={scope === 'all'} onClick={() => setScope('all')}>全部服务群（{groups.length}）</button>
      <button type="button" aria-pressed={scope === 'supervised'} onClick={() => setScope('supervised')}>
        团队监管（{groups.filter(group => group.supervised).length}）
      </button>
      <button type="button" aria-pressed={scope === 'pending'} onClick={() => setScope('pending')}>
        待回复（{groups.filter(group => group.waitingForStaff).length}）
      </button>
    </div>
    <div className={`sg-workspace${selected ? ' sg-has-selection' : ''}`}>
      <section aria-label="服务群列表" className="sg-group-list">
        {visibleGroups.length === 0 && <p>{groupQuery ? '未找到匹配的服务群，请检查关键词或切换服务类型、服务状态。' : '此范围暂无已配置的服务群。健管专员可查找客户并配置成员。'}</p>}
        {visibleGroups.map(group => <button key={group.id} type="button" onClick={() => open(group)}
          className={`sg-group-item${selected?.id === group.id ? ' is-selected' : ''}`}
          aria-pressed={selected?.id === group.id}>
          <strong>{group.name || `${group.patientName}的服务群`}</strong>{group.waitingForStaff && <span style={{ background: '#DC3545', color: 'white', borderRadius: 12, padding: '3px 9px', fontSize: 12, display: 'inline-block' }}>● 待人工回复</span>}
          {group.mentionCount > 0 && <span className="sg-mention-badge">有人@我 · {group.mentionCount}</span>}{group.status==='closed'&&<small>已归档 · {stamp(group.closedAt)}</small>}
          {group.supervised && <small>团队监管 · 只读</small>}
          <small>客户：{group.patientName}</small>
          <small className="sg-group-staff">{group.staff.map(memberLabel).join('、')}</small>
          <small>{stamp(group.lastMessageAt)}{group.waitingForStaff ? ' · 待团队回复' : ''}</small>
        </button>)}
        {hasMore && <button type="button" disabled={busy} onClick={loadMore}>加载更多服务群</button>}
      </section>
      <section aria-label="群消息" className="sg-chat-panel">
        {selected ? <>
          {historyOpen && <ServiceGroupHistory key={selected.id} group={selected} initialMessageId={historyAnchor} onClose={()=>{setHistoryOpen(false);setHistoryAnchor(null);}}/>}
          <div className="sg-chat-header">
            <button type="button" className="sg-back-to-list" onClick={() => { setSelected(null); setPendingFile(null); currentId.current = ''; }} aria-label="返回服务群列表">‹ 返回群列表</button>
            <div className="sg-chat-heading"><h2>{selected.name || `${selected.patientName}的服务群`}</h2>
              {selected.assistant && <div className="sg-assistant-status">
                <img alt="小嘉" src={API_ORIGIN + selected.assistant.avatar} />
                <small>{selected.supervised ? '小嘉 · AI接待不受监管查看影响' : '小嘉 · 人工接待中，@小嘉协助；离开后恢复自动接待'}</small>
              </div>}
            </div>
            <div className="sg-chat-actions">
            <button type="button" aria-label="群聊更多" onClick={()=>setHistoryOpen(true)}>…</button>
            {selected.canConfigure && selected.status !== 'closed' && <button type="button" onClick={() => editMembers(selected.patientId, selected.serviceType)}>调整群成员</button>}
            </div>
          </div>
          <div className="sg-messages" ref={messagePane} onScroll={event => { const pane = event.currentTarget; followLatest.current = pane.scrollHeight - pane.scrollTop - pane.clientHeight < 48; }}>
            {older&&<button onClick={()=>{followLatest.current=false;loadMessages(selected.id,messages[0]?.id);}}>查看更早消息</button>}
            {messages.length === 0 && <p className="sg-empty-messages">暂无消息，可以开始沟通。</p>}
            {messages.map((message, index) => <React.Fragment key={message.id}>
              {messageTimeSeparator(message.createdAt, messages[index - 1]?.createdAt) && <div className="sg-time-separator"><time dateTime={message.createdAt}>{messageTimeSeparator(message.createdAt, messages[index - 1]?.createdAt)}</time></div>}
              <article title={stamp(message.createdAt)} onClick={e=>{if(selected.status!=='closed'&&!selected.supervised&&!e.target.closest('button,a,input,textarea,audio')&&!window.getSelection()?.toString()){setQuoteMenu(message);}}} onContextMenu={e=>{if(selected.status!=='closed'&&!selected.supervised){e.preventDefault();setQuoteMenu(message);}}} id={'sg-msg-'+message.id} key={message.id}
              className={`sg-message${message.senderType === 'staff' ? ' is-staff' : ''}`}>
              {message.senderAvatar ? <img className="sg-sender-avatar" alt={message.senderName || '发送人'} src={message.senderAvatar.startsWith('/') ? API_ORIGIN + message.senderAvatar : message.senderAvatar} /> : <span className="sg-sender-avatar sg-avatar-fallback" aria-label={message.senderName || '发送人'}>{(message.senderName || '群').slice(0,1)}</span>}
              <div className="sg-message-body">
                <small className="sg-sender-name">{message.senderName} · {({ familyDoctor: '健康顾问', nutritionist: '营养师', healthManager: '健管专员', medicalAssistant: '就医专员', specialist: '专科医师', customer: '客户', ai: '嘉医汇AI健康管家' })[message.senderRole] || '服务人员'}</small>
                <div className="sg-bubble">
              {mentionAnchor===String(message.id)&&<strong className="sg-mention-badge">有人@我</strong>}
              {quoteMenu?.id===message.id&&<div className="sg-message-menu" role="group" aria-label="消息操作"><button onClick={()=>{setQuote(message);setQuoteMenu(null);draftInput.current?.focus();}}>引用</button>{message.senderType==='staff'&&String(message.senderId)===staffId&&Date.now()-new Date(message.createdAt).getTime()<120000&&<button disabled={busy} onClick={()=>recall(message)}>撤回</button>}<button onClick={()=>setQuoteMenu(null)}>取消</button></div>}
              {message.audioUrl?<GroupVoiceMessage groupId={selected.id} message={message}/>:(!message.fileUrl || !['[文件]','[图片]'].includes(message.content))&&<div style={{whiteSpace:'pre-wrap'}}>{message.content}</div>}
              {message.fileUrl && (message.fileMimeType?.startsWith('image/')
                ? <button type="button" className="sg-image-open" onClick={()=>setPreviewImage(message.fileUrl)} aria-label={message.fileName || '查看图片'}><img className="sg-message-image" src={message.fileUrl} alt={message.fileName || '聊天图片'} /></button>
                : <a href={message.fileUrl} target="_blank" rel="noreferrer" download={message.fileName} style={{display:'block',overflowWrap:'anywhere'}}>📎 {message.fileName||'查看文件'}</a>)}
              {message.senderType==='staff'&&String(message.senderId)===staffId&&Date.now()-new Date(message.createdAt).getTime()<120000&&<button type="button" className="sg-message-action" aria-label="消息操作" onClick={()=>setQuoteMenu(message)}>···</button>}
              {message.material && <div style={{marginTop:8}}>
                <small>{message.material.status}</small>
                <div style={{display:'flex',flexWrap:'wrap',gap:8}}>{(message.material.files||[]).map((url,i)=><a key={i} href={url} target="_blank" rel="noreferrer">{message.material.mimeType==='application/pdf'?'查看PDF':<img src={url} alt={`资料第${i+1}页`} style={{width:100,height:100,objectFit:'contain'}}/>}</a>)}</div>
                <a href={`/patients/${selected.patientId}?tab=reports&reportId=${message.material.id}`}>查看原始资料 / 核对</a>
              </div>}
              {!!message.mentions?.length&&<div className="sg-mention-links">{message.mentions.filter(person=>!person.name || !String(message.content || '').includes('@'+person.name)).map(p=><button key={p.id} onClick={()=>window.alert(`${p.name} · ${p.role || '服务成员'}`)}> @{p.name} · {p.role}</button>)}</div>}
                </div>
              {message.quote&&<button className="sg-quoted-message" onClick={()=>{if(message.quote.id){setHistoryAnchor(message.quote.id);setHistoryOpen(true);}}}>{message.quote.senderName}：{message.quote.content}</button>}
              </div>
            </article></React.Fragment>)}
          </div>
          {selected.status==='closed' ? <p className="sg-readonly">本次服务已结束，历史记录仅供查看。</p> : selected.supervised ? <p className="sg-readonly">仅监管查看，未入群不能回复。</p>
            : <div className="sg-composer">
              <button type="button" aria-label={voiceMode?'切换到键盘':'切换到语音'} title={voiceMode?'切换到键盘':'切换到语音'} style={{width:44,minWidth:44,height:44,padding:8,flexShrink:0}} onClick={()=>{setEmojiOpen(false);setShowMentions(false);setVoiceMode(v=>!v);}}>{voiceMode?<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M5 9h2m2 0h2m2 0h2m2 0h2M5 12h2m2 0h2m2 0h2m2 0h2M6 16h12"/></svg>:<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><rect x="8" y="2" width="8" height="13" rx="4"/><path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3m-4 0h8"/></svg>}</button>
              <div ref={emojiPicker} className="sg-mention-picker"><button type="button" aria-label="选择表情" onClick={()=>{setEmojiOpen(v=>!v);setShowMentions(false);setVoiceMode(false);}}>☺</button>{emojiOpen&&<div style={{display:'flex',flexWrap:'wrap'}}>{emojis.map(emoji=><button key={emoji} style={{width:48,minWidth:48,fontSize:22}} onClick={()=>setDraft(text=>(text+emoji).slice(0,2000))}>{emoji}</button>)}</div>}{showMentions&&<div>{mentionCandidates.map(p=><button key={p.id} onClick={()=>mention(p)}>{memberLabel(p)}</button>)}</div>}</div>
              <label className="sg-file-control" aria-label="选择图片或文件" title="添加图片或文件">＋<input type="file" accept="image/jpeg,image/png,image/webp,image/gif,.pdf,.docx,.xlsx,.pptx" hidden onChange={e=>{const file=e.target.files?.[0];e.target.value='';void addAttachment(file);}}/></label>
              <div className="sg-composer-field" style={{display:'flex',flexDirection:'column',flex:1,minWidth:0}}>{quote&&<div>{quote.senderName}：{quote.audioUrl?'[语音消息]':quote.content.slice(0,120)} <button onClick={()=>setQuote(null)}>取消引用</button></div>}{attaching&&<div className="sg-pending-file">正在读取附件…</div>}{pendingFile&&(pendingFile.mimeType.startsWith('image/')?<div className="sg-pending-image"><img src={pendingFile.data} alt="待发送图片"/><button type="button" onClick={()=>setPendingFile(null)}>移除图片</button></div>:<div className="sg-pending-file">📎 {pendingFile.name} <button type="button" onClick={()=>setPendingFile(null)}>移除</button></div>)}{voiceMode?<GroupVoiceInput key={selected.id} groupId={selected.id} quotedMessageId={quote?.id} onSent={()=>{setQuote(null);followLatest.current=true;loadMessages(selected.id);refresh();}} onText={text=>{setDraft(old=>old+text);setVoiceMode(false);}}/>:<textarea ref={draftInput} aria-label="服务群消息" onFocus={()=>setEmojiOpen(false)} onClick={()=>setEmojiOpen(false)} onPaste={pasteAttachment} value={draft} onChange={e => {setDraft(e.target.value);const at=e.target.selectionStart-1;mentionPosition.current=e.target.value[at]==='@'?at:null;setShowMentions(mentionPosition.current!==null);if(mentionPosition.current!==null)setEmojiOpen(false);}}
                maxLength={2000} rows={1} placeholder="给客户发送消息…" />}</div>
              {!voiceMode&&<button type="button" className="sa-primary" disabled={busy || attaching || (!draft.trim()&&!pendingFile)} onClick={send}>发送</button>}
            </div>}
        </> : <p className="sg-select-prompt">从左侧选择一个服务群，查看对话记录。</p>}
      </section>
    </div>
    {previewImage&&<div className="sg-image-preview" role="dialog" aria-modal="true" aria-label="查看聊天图片" onClick={()=>setPreviewImage('')}><button type="button" aria-label="关闭图片" onClick={()=>setPreviewImage('')}>×</button><img src={previewImage} alt="聊天原图" onClick={event=>event.stopPropagation()}/></div>}
  </main>;
}
