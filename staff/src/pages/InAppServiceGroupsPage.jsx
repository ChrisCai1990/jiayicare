import React, { useEffect, useRef, useState } from 'react';
import { inAppServiceGroupAPI as api, staffAPI } from '../api';
import './ServiceAssistantPage.css';

const stamp = value => value ? new Date(value).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' }) : '暂无消息';

export default function InAppServiceGroupsPage() {
  const [groups, setGroups] = useState([]);
  const [selected, setSelected] = useState(null);
  const [messages, setMessages] = useState([]);
  const [search, setSearch] = useState('');
  const [patients, setPatients] = useState([]);
  const [draft, setDraft] = useState('');
  const [scope, setScope] = useState('all');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const currentId = useRef('');
  const loadedPages = useRef(1);

  const refresh = async () => {
    try {
      const pages = await Promise.all(Array.from({ length: loadedPages.current }, (_, i) => api.list(i + 1)));
      setGroups(pages.flatMap(res => res.data || []));
      setHasMore(!!pages.at(-1)?.hasMore);
    }
    catch (e) { setError(e.message || '服务群读取失败'); }
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
  useEffect(() => { refresh(); }, []);
  useEffect(() => {
    if (!selected) return;
    const timer = setInterval(() => { loadMessages(selected.id); refresh(); }, 10000);
    return () => clearInterval(timer);
  }, [selected?.id]);
  const open = group => { currentId.current = group.id; setSelected(group); setMessages([]); setError(''); loadMessages(group.id); };
  const findPatient = async () => {
    if (!search.trim()) return setPatients([]);
    try { const res = await staffAPI.getPatients({ search: search.trim(), limit: 10, scope: 'mine' });
      setPatients(res.data?.patients || []); setError(''); }
    catch (e) { setError(e.message || '客户查询失败'); }
  };
  const create = async patientId => {
    setBusy(true); setError('');
    try { const res = await api.create(patientId); await refresh(); setPatients([]); setSearch(''); open(res.data); }
    catch (e) { setError(e.message || '建立服务群失败'); }
    finally { setBusy(false); }
  };
  const send = async () => {
    if (!selected || !draft.trim() || busy) return;
    setBusy(true); setError('');
    try { await api.send(selected.id, draft.trim()); setDraft(''); await loadMessages(selected.id); await refresh(); }
    catch (e) { setError(e.message || '发送失败'); }
    finally { setBusy(false); }
  };
  const visibleGroups = groups.filter(group => scope === 'all' ||
    scope === 'supervised' && group.supervised ||
    scope === 'pending' && group.waitingForStaff);

  return <main className="service-assistant">
    <h1>系统服务群</h1>
    <p>客户在嘉医汇 App 发消息，当前服务团队在这里沟通。团队负责人可以只读查看本团队服务群。</p>
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      <input aria-label="查找客户" value={search} onChange={e => setSearch(e.target.value)} placeholder="查找负责的客户" />
      <button type="button" onClick={findPatient}>查找</button>
      <button type="button" onClick={refresh}>刷新</button>
    </div>
    {patients.map(patient => <button key={patient._id} type="button" disabled={busy}
      onClick={() => create(patient._id)}>{patient.name} · 建立或打开服务群</button>)}
    {error && <p role="alert">{error}</p>}
    <div style={{ display: 'flex', gap: 8, marginTop: 16, flexWrap: 'wrap' }}>
      <button type="button" aria-pressed={scope === 'all'} onClick={() => setScope('all')}>全部服务群（{groups.length}）</button>
      <button type="button" aria-pressed={scope === 'supervised'} onClick={() => setScope('supervised')}>
        团队监管（{groups.filter(group => group.supervised).length}）
      </button>
      <button type="button" aria-pressed={scope === 'pending'} onClick={() => setScope('pending')}>
        待回复（{groups.filter(group => group.waitingForStaff).length}）
      </button>
    </div>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 300px), 1fr))', gap: 16, marginTop: 16 }}>
      <section aria-label="服务群列表">
        {visibleGroups.length === 0 && <p>此范围暂无服务群。可查找客户后建立；客户也可以在 App 中发起。</p>}
        {visibleGroups.map(group => <button key={group.id} type="button" onClick={() => open(group)}
          style={{ display: 'block', width: '100%', textAlign: 'left', marginBottom: 8 }}>
          <strong>{group.patientName}的服务群</strong>
          {group.supervised && <small>团队监管 · 只读</small>}
          <small>{group.staff.map(person => person.name).join('、')}</small>
          <small>{stamp(group.lastMessageAt)}{group.waitingForStaff ? ' · 待团队回复' : ''}</small>
        </button>)}
        {hasMore && <button type="button" disabled={busy} onClick={loadMore}>加载更多服务群</button>}
      </section>
      <section aria-label="群消息">
        {selected && <><h2>{selected.patientName}的服务群</h2>
          <small>团队成员：{selected.staff.map(person => person.name).join('、')}</small>
          {messages.map(message => <article key={message.id}
            style={{ borderBottom: '1px solid #d8e2dc', padding: '10px 0', overflowWrap: 'anywhere' }}>
            <small>{message.senderName} · {stamp(message.createdAt)}</small>
            <div style={{ whiteSpace: 'pre-wrap' }}>{message.content}</div>
          </article>)}
          {!selected.supervised && <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <textarea aria-label="服务群消息" value={draft} onChange={e => setDraft(e.target.value)}
              maxLength={2000} rows={3} style={{ flex: 1 }} />
            <button type="button" disabled={busy || !draft.trim()} onClick={send}>发送</button>
          </div>}
        </>}
      </section>
    </div>
  </main>;
}
