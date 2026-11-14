import React, { useEffect, useRef, useState } from 'react';
import { API_ORIGIN, inAppServiceGroupAPI as api, staffAPI } from '../api';
import './ServiceAssistantPage.css';
import './InAppServiceGroupsPage.css';

const stamp = value => value ? new Date(value).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' }) : '暂无消息';

export default function InAppServiceGroupsPage() {
  const [groups, setGroups] = useState([]);
  const [selected, setSelected] = useState(null);
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
    try {
      const pages = await Promise.all(Array.from({ length: loadedPages.current }, (_, i) => api.list(i + 1)));
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
      const res = await api.list(nextPage);
      loadedPages.current = nextPage;
      setGroups(previous => [...previous, ...(res.data || [])]);
      setHasMore(!!res.hasMore);
    } catch (e) { setError(e.message || '更多服务群读取失败'); }
    finally { setBusy(false); }
  };
  const loadMessages = async id => {
    try {
      const res = await api.messages(id);
      if (currentId.current === id) setMessages(res.data || []);
    } catch (e) { setError(e.message || '群消息读取失败'); }
  };
  useEffect(() => { refresh(); const timer = setInterval(() => { if (document.visibilityState === 'visible') refresh(); }, 5000); return () => clearInterval(timer); }, []);
  useEffect(() => {
    if (!selected) return;
    const timer = setInterval(() => { if (document.visibilityState === 'visible') loadMessages(selected.id); }, 5000);
    return () => clearInterval(timer);
  }, [selected?.id]);
  useEffect(() => {
    if (!selected || selected.supervised) return;
    const pulse = () => { if (document.visibilityState === 'visible') api.presence(selected.id).catch(() => {}); };
    pulse();
    const timer = setInterval(pulse, 30000);
    document.addEventListener('visibilitychange', pulse);
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', pulse); };
  }, [selected?.id, selected?.supervised]);
  const open = group => { followLatest.current = true; currentId.current = group.id; setSelected(group); setMessages([]); setDraft(''); setError(''); loadMessages(group.id); };
  const findPatient = async () => {
    if (!search.trim()) return setPatients([]);
    try { const res = await staffAPI.getPatients({ search: search.trim(), limit: 10 });
      setPatients(res.data?.patients || []); setError(''); }
    catch (e) { setError(e.message || '客户查询失败'); }
  };
  const editMembers = async patientId => {
    setBusy(true); setError('');
    try {
      const res = await api.configuration(patientId);
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
        memberIds, membershipVersion: configuration.membershipVersion });
      setConfiguration(null); setPatients([]); setSearch('');
      await refresh(); open(res.data);
    } catch (e) { setError(e.message || '保存群成员失败，请刷新后重试'); }
    finally { setBusy(false); }
  };
  const send = async () => {
    if (!selected || !draft.trim() || busy) return;
    setBusy(true); setError('');
    try { await api.send(selected.id, draft.trim()); followLatest.current = true; setDraft(''); await loadMessages(selected.id); await refresh(); window.dispatchEvent(new Event('notif-refresh')); }
    catch (e) { setError(e.message || '发送失败'); }
    finally { setBusy(false); }
  };
  const visibleGroups = groups.filter(group => scope === 'all' ||
    scope === 'supervised' && group.supervised ||
    scope === 'pending' && group.waitingForStaff);

  return <main className="service-assistant in-app-service-groups">
    <h1>系统服务群</h1>
    <p>客户的健管专员负责建群和选择入群人员；健康顾问、营养师及就医专员担任团队负责人时，可监管本团队成员的服务对话。未入群人员不能回复。</p>
    {canConfigure && <>
    <div className="sg-search-row">
      <input aria-label="查找客户" value={search} onChange={e => setSearch(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') findPatient(); }} placeholder="查找负责的客户" />
      <button type="button" onClick={findPatient}>查找</button>
      <button type="button" onClick={refresh}>刷新</button>
    </div>
    <div className="sg-search-results">{patients.map(patient => <button key={patient._id} type="button" disabled={busy}
      onClick={() => editMembers(patient._id)}>{patient.name} · 配置服务群成员</button>)}
    </div>
    </>}
    {configuration && <section aria-label="配置服务群成员" className="sg-configuration">
      <h2>{configuration.patientName} · 选择入群成员</h2>
      <p>只有当前分配给该客户的服务人员可入群。</p>
      <div className="sg-candidates">{configuration.candidates.map(person => <label key={person._id} className="sg-candidate">
        <input type="checkbox" checked={memberIds.includes(String(person._id))}
          onChange={event => setMemberIds(previous => event.target.checked
            ? [...previous, String(person._id)] : previous.filter(id => id !== String(person._id)))} />
        {person.name} · {person.role}
      </label>)}</div>
      <div className="sg-configuration-actions">
        <button type="button" className="sa-primary" disabled={busy || memberIds.length === 0} onClick={saveMembers}>保存群成员</button>
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
          <strong>{group.patientName}的服务群</strong>{group.waitingForStaff && <span style={{ background: '#DC3545', color: 'white', borderRadius: 12, padding: '3px 9px', fontSize: 12, display: 'inline-block' }}>● 待人工回复</span>}
          {group.supervised && <small>团队监管 · 只读</small>}
          <small>{group.staff.map(person => person.name).join('、')}</small>
          <small>{stamp(group.lastMessageAt)}{group.waitingForStaff ? ' · 待团队回复' : ''}</small>
        </button>)}
        {hasMore && <button type="button" disabled={busy} onClick={loadMore}>加载更多服务群</button>}
      </section>
      <section aria-label="群消息" className="sg-chat-panel">
        {selected ? <>
          <div className="sg-chat-header">
            <div><h2>{selected.patientName}的服务群</h2>
              <small>团队成员：{selected.staff.map(person => person.name).join('、')}</small></div>
            {selected.canConfigure && <button type="button" onClick={() => editMembers(selected.patientId)}>调整群成员</button>}
          </div>
          {selected.assistant && <div style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '8px 20px', background: '#eef9f9' }}>
            <img alt="小嘉" src={API_ORIGIN + selected.assistant.avatar} style={{ width: 40, height: 40, borderRadius: '50%' }} />
            <small>小嘉｜嘉医汇AI健康管家 · {selected.supervised ? '仅监管查看不影响AI接待' : '您正在接待此群，小嘉暂停回复；离开后恢复自动接待'}</small>
          </div>}
          <div className="sg-messages" ref={messagePane} onScroll={event => { const pane = event.currentTarget; followLatest.current = pane.scrollHeight - pane.scrollTop - pane.clientHeight < 48; }}>
            {messages.length === 0 && <p className="sg-empty-messages">暂无消息，可以开始沟通。</p>}
            {messages.map(message => <article key={message.id}
              className={`sg-message${message.senderType === 'staff' ? ' is-staff' : ''}`}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                {message.senderAvatar && <img alt="" src={message.senderAvatar.startsWith('/') ? API_ORIGIN + message.senderAvatar : message.senderAvatar} style={{ width: 36, height: 36, borderRadius: '50%', objectFit: 'cover' }} />}
                <small>{message.senderName} · {({ familyDoctor: '健康顾问', nutritionist: '营养师', healthManager: '健管专员', medicalAssistant: '就医专员', customer: '客户', ai: '嘉医汇AI健康管家' })[message.senderRole] || '服务人员'} · {stamp(message.createdAt)}</small>
              </div>
              <div>{message.content}</div>
            </article>)}
          </div>
          {selected.supervised ? <p className="sg-readonly">仅监管查看，未入群不能回复。</p>
            : <div className="sg-composer">
              <textarea aria-label="服务群消息" value={draft} onChange={e => setDraft(e.target.value)}
                maxLength={2000} rows={4} placeholder="给客户发送消息…" />
              <button type="button" className="sa-primary" disabled={busy || !draft.trim()} onClick={send}>发送</button>
            </div>}
        </> : <p className="sg-select-prompt">从左侧选择一个服务群，查看对话记录。</p>}
      </section>
    </div>
  </main>;
}
