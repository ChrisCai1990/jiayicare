import React, { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { serviceGroupAPI as api, staffAPI } from "../api";
import { useStaff, usePermission } from "../App";
import {
  currentWecomGroup,
  shareToWecomGroup,
} from "../utils/serviceGroupWecom";
import "./ServiceAssistantPage.css";

const labels = {
  task: "待办",
  record: "服务记录",
  summary: "服务总结",
  notification: "群通知",
  command: "指令",
};
const statuses = {
  draft: "待确认",
  planned: "待跟进",
  in_progress: "处理中",
  completed: "已完成",
  cancelled: "已取消",
  confirmed: "已确认",
};
const categories = {
  physical_exam: "体检报告",
  lab_report: "检验报告",
  exam_report: "检查报告",
  functional_medicine: "功能医学",
  outpatient_record: "门诊病历",
  inpatient_record: "住院病历",
  prescription_order: "处方",
  body_composition: "身体成分",
  genetic_test: "基因检测",
  questionnaire: "问卷",
  other_customer_material: "其他资料",
};
const idOf = (p) => p?._id || p;
const date = (value) =>
  value ? new Date(value).toLocaleDateString("zh-CN") : "未设置";
const mask = (value) =>
  String(value || "").replace(/^(\d{3})\d{4}(\d{4})$/, "$1****$2");
const key = () => crypto.randomUUID();

function PersonSearch({ onSelect }) {
  const [query, setQuery] = useState(""),
    [results, setResults] = useState([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    setResults([]);
    setError("");
    if (!query.trim()) {
      setBusy(false);
      return;
    }
    setBusy(true);
    const timer = setTimeout(
      () =>
        staffAPI
          .getPatients({ search: query, limit: 20 })
          .then((r) => {
            if (active) setResults(r.data.patients || []);
          })
          .catch((e) => {
            if (active) setError(e.message);
          })
          .finally(() => {
            if (active) setBusy(false);
          }),
      300
    );
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [query]);
  return (
    <div>
      <label>
        添加家庭成员
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="搜索本人或家属姓名、手机号"
        />
      </label>
      {busy && <small>正在搜索…</small>}
      {error && <p role="alert">{error}</p>}
      {!busy && query && !results.length && !error && (
        <small>未找到可访问的成员</small>
      )}
      <div className="sa-search">
        {results.map((p) => (
          <button
            type="button"
            key={p._id}
            onClick={() => {
              onSelect(p);
              setQuery("");
            }}
          >
            {p.name} · {mask(p.phone)}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function ServiceAssistantPage() {
  const inGroupSidebar = /wxwork/i.test(navigator.userAgent) && new URLSearchParams(window.location.search).get("embedded") === "1";
  const [currentChat, setCurrentChat] = useState("");
  const [familyCandidates, setFamilyCandidates] = useState([]);
  const [remindersOnly, setRemindersOnly] = useState(false);
  const [appInbox, setAppInbox] = useState(null);
  const [pairCode, setPairCode] = useState('');
  const recogniseRef = useRef(null);
  const { staff } = useStaff(),
    can = usePermission();
  const [caps, setCaps] = useState(null),
    [groups, setGroups] = useState([]),
    [groupId, setGroupId] = useState(""),
    [bundle, setBundle] = useState(null);
  const [tab, setTab] = useState("task"),
    [personId, setPersonId] = useState(""),
    [native, setNative] = useState(null);
  const [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false),
    [groupName, setGroupName] = useState(""),
    [chatId, setChatId] = useState(""),
    [members, setMembers] = useState([]);
  const [form, setForm] = useState(null),
    [command, setCommand] = useState(""),
    [source, setSource] = useState(""),
    [settings, setSettings] = useState(false),
    [teamOptions, setTeamOptions] = useState([]);
  const [selectedTeam, setSelectedTeam] = useState([]),
    [aiConsent, setAiConsent] = useState(false);
  const [archiveConsent, setArchiveConsent] = useState(false),
    [messages, setMessages] = useState([]);
  const [file, setFile] = useState(null),
    [reportTitle, setReportTitle] = useState(""),
    [reportDate, setReportDate] = useState(""),
    [category, setCategory] = useState("physical_exam"),
    [receipt, setReceipt] = useState(null);
  const [sourceMessage, setSourceMessage] = useState(null);
  const version = useRef(0),
    fileRef = useRef(null),
    groupRef = useRef("");
  const busyLock = useRef(false);
  const prefetchedBundle = useRef(null);
  const g = bundle?.group,
    entries = bundle?.entries || [];
  const listGroups = async () => {
    const r = await api.get("");
    setGroups(r.data);
    return r.data;
  };
  useEffect(() => {
    let active = true;
    Promise.all([api.get("/capabilities"), inGroupSidebar ? Promise.resolve(null) : api.get("")])
      .then(([c, r]) => {
        if (active) {
          setCaps(c.data);
          if (r) setGroups(r.data);
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, []);
  const refresh = async (id = groupId) => {
    if (!id) return;
    const tick = ++version.current;
    setLoading(true);
    try {
      const r = await api.get("/" + id);
      if (version.current === tick) setBundle(r.data);
    } finally {
      if (version.current === tick) setLoading(false);
    }
  };
  useEffect(() => {
    groupRef.current = groupId;
    setFamilyCandidates([]);
    setRemindersOnly(false);
    const prefetched = prefetchedBundle.current;
    prefetchedBundle.current = null;
    setBundle(prefetched?.group._id === groupId ? prefetched : null);
    setPersonId("");
    setNative(null);
    setForm(null);
    setReceipt(null);
    setFile(null);
    setSourceMessage(null);
    setSource("");
    setCommand("");
    setError("");
    setNotice("");
    setSettings(false);
    setMessages([]);
    if (fileRef.current) fileRef.current.value = "";
    if (prefetched?.group._id !== groupId) refresh(groupId).catch((e) => setError(e.message));
    return () => {
      version.current++;
    };
  }, [groupId]);
  useEffect(() => {
    let active = true;
    setNative(null);
    if (groupId && personId)
      api
        .get(`/${groupId}/patient/${personId}`)
        .then((r) => {
          if (active) setNative(r.data);
        })
        .catch((e) => {
          if (active) setError(e.message);
        });
    return () => {
      active = false;
    };
  }, [groupId, personId, bundle]);
  const run = async (fn, identifying = false) => {
    if (busyLock.current) return;
    busyLock.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      if (inGroupSidebar && !identifying) {
        const actualChat = await currentWecomGroup();
        if (!currentChat || actualChat !== currentChat || (g && g.chatId !== actualChat)) {
          setGroupId(""); setBundle(null); setCreating(false); setSettings(false);
          setCurrentChat("");
          throw new Error("当前群已变化，已停止操作，请点击重新识别当前群");
        }
      }
      await fn();
    } catch (e) {
      setError(e.message);
    } finally {
      busyLock.current = false;
      setBusy(false);
    }
  };
  const addMember = (p) =>
    setMembers((old) =>
      old.some((m) => idOf(m.patientId) === p._id)
        ? old
        : [...old, { patientId: p, relation: "" }]
    );
  const loadFamily = (p) => run(async () => {
    const r = await api.get('/family-candidates/' + idOf(p));
    setFamilyCandidates(r.data);
    if (!r.data.length) setNotice('没有可导入的已关联家庭成员；未关联或无权限的档案不会显示');
  });
  const prepareDraft = (kind) => run(async () => {
    const r = await api.post(`/${groupId}/workbench-draft`, {kind, patientId:personId || null});
    setTab(r.data.kind);
    setForm({...r.data, patientId:personId, assignedTo:staff._id, dueAt:'', requestKey:key()});
    setNotice(kind === 'reply' ? '回复仅为草稿，请核对服务对象、内容及群内可披露范围后再发送' : '交接草稿已整理，请补充交接人员及未录入事项');
  });
  const openForm = (kind, content = "") =>
    setForm({
      kind,
      title: "",
      content,
      patientId: personId,
      assignedTo: staff._id,
      dueAt: "",
      requestKey: key(),
    });
  const update = async (entry, changes) => {
    await api.patch(`/${groupId}/entries/${entry._id}`, {
      version: entry.__v,
      ...changes,
    });
    await refresh();
    setNotice("已保存到嘉医汇");
  };
  const recognise = () =>
    run(async () => {
      const id = await currentWecomGroup();
      const sameChat = id === currentChat;
      // A confirmed chat change invalidates the old household before any lookup.
      // Do not persist the last household across webview reloads: it may be another chat.
      if (!sameChat) {
        ++version.current;
        setGroupId(""); setBundle(null); setCreating(false); setSettings(false);
        setLoading(false);
      }
      setCurrentChat(id);
      let resolved;
      try {
        resolved = (await api.get('/by-chat/' + encodeURIComponent(id))).data;
      } catch (e) {
        // Failed authorization must never leave previously visible patient data.
        setBundle(null); setGroupId(''); setCreating(false);
        throw e;
      }
      if (inGroupSidebar && await currentWecomGroup() !== id) {
        setBundle(null); setGroupId(''); setCurrentChat('');
        throw new Error('当前群已变化，请重新识别');
      }
      const found = resolved?.group;
      // Visibility checks must not discard an in-progress form in the same chat.
      if (sameChat && found && found._id === groupId && g?.chatId === id) {
        setBundle(resolved);
        return;
      }
      if (sameChat && !found && creating) return;
      if (found) {
        prefetchedBundle.current = resolved;
        setCreating(false); setSettings(false); setGroupId(found._id);
      }
      else {
        let name = '', nameNotice = '';
        try {
          const r = await api.post('/wecom-chat-name', {chatId:id});
          name = r.data.name;
        } catch {
          nameNotice = '群名称未能自动读取，请手动填写原群名（不会修改企微群名）';
        }
        if (inGroupSidebar && await currentWecomGroup() !== id) {
          setCurrentChat('');
          throw new Error('当前群已变化，请重新识别');
        }
        setGroupId(""); setBundle(null); setSettings(false);
        setCreating(true);
        setGroupName(name); setMembers([]); setFamilyCandidates([]);
        setChatId(id);
        setNotice(nameNotice || "已带入企微群名，请核对家庭成员后保存绑定");
      }
    }, true);
  recogniseRef.current = recognise;
  useEffect(() => {
    if (!inGroupSidebar) return;
    recogniseRef.current();
    const revisit = () => {
      if (document.visibilityState === "visible") recogniseRef.current();
    };
    document.addEventListener("visibilitychange", revisit);
    return () => document.removeEventListener("visibilitychange", revisit);
  }, [inGroupSidebar]);
  const saveGroup = () =>
    run(async () => {
      const payload = {
        name: groupName,
        chatId: inGroupSidebar ? currentChat : chatId,
        members: members.map((m) => ({
          patientId: idOf(m.patientId),
          relation: m.relation,
        })),
      };
      if (settings) {
        await api.patch("/" + groupId, {
          ...payload,
          staffIds: selectedTeam,
          aiConsent,
          archiveConsent,
        });
        setSettings(false);
        await refresh();
      } else {
        const r = await api.post("", payload);
        setCreating(false);
        setGroupId(r.data._id);
      }
      if (!inGroupSidebar) await listGroups();
    });
  const editSettings = () =>
    run(async () => {
      const r = await api.get("/team-options");
      setTeamOptions(r.data);
      setSelectedTeam(g.staffIds.map(idOf));
      setAiConsent(g.aiConsent);
      setArchiveConsent(g.archiveConsent);
      setGroupName(g.name);
      setChatId(g.chatId);
      setMembers(g.members);
      setSettings(true);
    });
  const appInboxPanel = <details className="sa-card">
    <summary>应用聊天收件箱</summary>
    <small>文字仅进入本人收件箱，保留7天；不会自动关联客户或执行。文件请使用报告归档。</small>
    <button disabled={busy} onClick={()=>run(async()=>{const r=await api.post('/app-pair-code',{});setPairCode(r.data.linked ? '当前系统员工已绑定企微账号' : r.data.code);},true)}>绑定我的企微账号</button>
    <button disabled={busy} onClick={()=>run(async()=>{const r=await api.get('/app-inbox');setAppInbox(r.data);},true)}>读取我的应用消息</button>
    {pairCode && <label>复制绑定口令发给应用（10分钟有效，勿转给他人）<textarea readOnly value={pairCode}/></label>}
    {appInbox && !appInbox.configured && <p>应用回调尚未配置，请先完成管理员接入。</p>}
    {appInbox?.linked && <label><input type="checkbox" checked={appInbox.remindersEnabled} disabled={busy} onChange={e=>{const enabled=e.target.checked;run(async()=>{await api.patch('/app-reminders',{enabled});setAppInbox(old=>({...old,remindersEnabled:enabled}));},true);}}/>每天接收一次工作时段待办提醒（不含客户资料）</label>}
    {appInbox?.linked && !appInbox.reminderServiceConfigured && <small>提醒服务尚未启用；勾选仅保存个人偏好。</small>}
    {appInbox?.configured && !appInbox.messages.length && <p>暂无消息</p>}
    {appInbox?.messages.map(m=><div className="sa-card" key={m._id}>
      <small>{date(m.createdAt)}</small><p style={{whiteSpace:'pre-wrap'}}>{m.text}</p>
      <button disabled={busy || !g} onClick={()=>{setTab('summary');setSource(m.text);setNotice('已填入总结输入，请核对当前家庭和服务对象');}}>填入当前家庭总结</button>
      <button disabled={busy || !g} onClick={()=>{setCommand(m.text);setNotice('已填入快捷指令，请核对家庭后手动整理');}}>填入当前家庭指令</button>
    </div>)}
  </details>;
  const entryForm = form && (
    <form
      className="sa-card sa-form"
      onSubmit={(e) => {
        e.preventDefault();
        run(async () => {
          if (form._id)
            await api.patch(`/${groupId}/entries/${form._id}`, {
              version: form.__v,
              title: form.title,
              content: form.content,
            });
          else await api.post(`/${groupId}/entries`, form);
          setForm(null);
          await refresh();
          setNotice("草稿已保存，请核对后确认");
        });
      }}
    >
      <h3>
        {form._id ? "编辑" : "新建"}
        {labels[form.kind]}
      </h3>
      <label>
        服务对象
        <select
          disabled={!!form._id}
          value={form.patientId || ""}
          onChange={(e) => setForm({ ...form, patientId: e.target.value })}
        >
          <option value="">家庭共同事项 / 对象待澄清</option>
          {g?.members.map((m) => (
            <option key={idOf(m.patientId)} value={idOf(m.patientId)}>
              {m.patientId.name} · {m.relation || "成员"}
            </option>
          ))}
        </select>
      </label>
      <label>
        标题
        <input
          required
          maxLength={160}
          value={form.title}
          onChange={(e) => setForm({ ...form, title: e.target.value })}
        />
      </label>
      <label>
        {form.kind === "notification"
          ? "准备发给客户的文案"
          : "沟通内容与下一步"}
        <textarea
          required
          maxLength={20000}
          rows={5}
          value={form.content}
          onChange={(e) => setForm({ ...form, content: e.target.value })}
        />
      </label>
      {form.kind === "task" && !form._id && (
        <div className="sa-fields">
          <label>
            跟进日期
            <input
              required
              type="date"
              value={form.dueAt}
              onChange={(e) => setForm({ ...form, dueAt: e.target.value })}
            />
          </label>
          <label>
            负责人
            <select
              value={form.assignedTo}
              onChange={(e) => setForm({ ...form, assignedTo: e.target.value })}
            >
              {bundle.staff.map((s) => (
                <option value={s._id} key={s._id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}
      <div className="sa-actions">
        <button disabled={busy} className="sa-primary">
          保存草稿
        </button>
        <button type="button" disabled={busy} onClick={() => setForm(null)}>
          取消
        </button>
      </div>
    </form>
  );
  return (
    <div className="service-assistant sa-compact">
      <header className="sa-heading">
        <h1>家庭服务助手</h1>
      </header>
      <details className="sa-diagnostics">
        <summary>连接状态与重试</summary>
        <button disabled={busy} onClick={recognise}>
          {inGroupSidebar ? "重新识别当前群" : "识别当前企微群"}
        </button>
      <div className="sa-connection">
        {caps ? (
          <>
            <span>
              {currentChat ? "已识别当前企微群" : caps.sidebarConfigured
                ? "企微参数已配置 · 待客户端验证"
                : "企微侧边栏待配置"}
            </span>
            <span>
              {g?.lastMessageAt
                ? `最近接收群消息：${date(g.lastMessageAt)}`
                : "尚未接收到群消息 · 可手动录入"}
            </span>
            <span>{caps.aiConfigured ? "AI总结已启用" : "AI总结待配置"}</span>
          </>
        ) : (
          "正在检查接入状态…"
        )}
      </div>
      </details>
      {error && (
        <div className="sa-alert" role="alert">
          {error}
        </div>
      )}
      {notice && (
        <div className="sa-notice" role="status">
          {notice}
        </div>
      )}
      {(!inGroupSidebar || !g) && <div className="sa-toolbar">
        {inGroupSidebar ? <div><small>当前群绑定家庭</small><p>{g?.name || (creating ? "当前群尚未绑定，请在下方完成首次绑定" : error ? "暂时无法读取，请在连接状态中重试" : "正在读取当前群的绑定关系…")}</p></div> : <>
        <label>
          当前服务群
          <select
            aria-label="当前服务群"
            disabled={busy}
            value={groupId}
            onChange={(e) => { setCreating(false); setSettings(false); setGroupId(e.target.value); }}
          >
            <option value="">请选择服务群</option>
            {groups.map((x) => (
              <option value={x._id} key={x._id}>
                {x.name}
              </option>
            ))}
          </select>
        </label>
        {can("patients", "edit") && (
          <button
            disabled={busy}
            onClick={() => {
              setCreating(true);
              setGroupName("");
              setChatId("");
              setMembers([]);
            }}
          >
            新建服务群
          </button>
        )}
        </>}
      </div>}
      {(creating || settings) && (
        <section className="sa-card">
          <h2>{settings ? "服务群设置" : "绑定个人 / 家庭服务群"}</h2>
          <label>
            服务群名称
            <input
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              maxLength={120}
            />
          </label>
          <label>
            企微群标识（可稍后绑定）
            <input
              value={chatId}
              readOnly={inGroupSidebar}
              onChange={(e) => setChatId(e.target.value)}
              maxLength={128}
            />
          </label>
          <PersonSearch onSelect={addMember} />
          {members.map(m=><button type="button" disabled={busy} key={'family-'+idOf(m.patientId)} onClick={()=>loadFamily(m.patientId)}>读取{m.patientId.name}的原系统家庭关系</button>)}
          {familyCandidates.length > 0 && <div className="sa-card">
            <small>以下关系相对于原系统关联人，核对后逐个加入；不会改动原系统关系。</small>
            {familyCandidates.map(m=><div key={idOf(m.patientId)}>
              <span>{m.patientId.name} · {m.relativeTo}的{m.relation || '家属'}</span>
              <button type="button" disabled={busy || members.some(x=>idOf(x.patientId)===idOf(m.patientId))} onClick={()=>setMembers(old=>[...old,{patientId:m.patientId,relation:m.relation ? `${m.relativeTo}的${m.relation}` : '家属'}])}>加入家庭</button>
            </div>)}
          </div>}
          {members.map((m, i) => (
            <div className="sa-member-edit" key={idOf(m.patientId)}>
              <span>{m.patientId.name}</span>
              <input
                placeholder="关系，如本人 / 母亲"
                value={m.relation}
                onChange={(e) =>
                  setMembers((old) =>
                    old.map((v, j) =>
                      i === j ? { ...v, relation: e.target.value } : v
                    )
                  )
                }
              />
              {!settings && (
                <button
                  onClick={() =>
                    setMembers((old) => old.filter((_, j) => i !== j))
                  }
                >
                  移除
                </button>
              )}
            </div>
          ))}
          {settings && (
            <>
              <label>
                服务团队
                <select
                  multiple
                  value={selectedTeam}
                  onChange={(e) =>
                    setSelectedTeam(
                      Array.from(e.target.selectedOptions, (o) => o.value)
                    )
                  }
                >
                  {teamOptions.map((s) => (
                    <option key={s._id} value={s._id}>
                      {s.name} · {s.role}
                    </option>
                  ))}
                </select>
              </label>
              <small>成员还须具有家庭档案访问权限。负责人始终保留。</small>
              <label className="sa-check">
                <input
                  type="checkbox"
                  checked={aiConsent}
                  onChange={(e) => setAiConsent(e.target.checked)}
                />
                已确认本群沟通内容可交由机构配置的AI整理
              </label>
            </>
          )}
          <div className="sa-actions">
            <button
              className="sa-primary"
              disabled={busy || !groupName.trim() || !members.length}
              onClick={saveGroup}
            >
              保存绑定
            </button>
            <button
              disabled={busy}
              onClick={() => {
                setCreating(false);
                setSettings(false);
              }}
            >
              取消
            </button>
          </div>
          {settings && (
            <label className="sa-check">
              <input
                type="checkbox"
                checked={archiveConsent}
                onChange={(e) => setArchiveConsent(e.target.checked)}
              />
              已核对本群会话存档授权及成员同意范围，允许接收存档消息
            </label>
          )}
        </section>
      )}
      {loading && <p role="status">正在读取家庭服务数据…</p>}
      {!g && appInboxPanel}
      {!inGroupSidebar && !groupId && !creating && (
        <div className="sa-empty">
          <h2>从一个服务群开始</h2>
          <p>
            绑定已在嘉医汇建档的家庭成员，即可集中处理待办、沟通、报告和交接。
          </p>
        </div>
      )}
      {g && (
        <>
          <section className="sa-card sa-household">
            <div className="sa-row">
              <h2>{g.name}</h2>
              {can("patients", "edit") && (
                <button disabled={busy} onClick={editSettings}>
                  群设置
                </button>
              )}
            </div>
            <label>
              当前服务对象
              <select
                aria-label="当前服务对象"
                disabled={busy}
                value={personId}
                onChange={(e) => {
                  setPersonId(e.target.value);
                  setForm(null);
                  setReceipt(null);
                  setFile(null);
                  if (fileRef.current) fileRef.current.value = "";
                }}
              >
                <option value="">家庭共同事项</option>
                {g.members.map((m) => (
                  <option key={idOf(m.patientId)} value={idOf(m.patientId)}>
                    {m.patientId.name} · {m.relation || "成员"} ·{" "}
                    {mask(m.patientId.phone)}
                  </option>
                ))}
              </select>
            </label>
            <div className="sa-stats">
              <div>
                <strong>
                  {
                    entries.filter((e) =>
                      ["planned", "in_progress"].includes(e.status)
                    ).length
                  }
                </strong>
                待跟进
              </div>
              <div>
                <strong>
                  {
                    entries.filter(
                      (e) =>
                        ["planned", "in_progress"].includes(e.status) &&
                        e.dueAt &&
                        new Date(e.dueAt) <
                          new Date(new Date().setHours(0, 0, 0, 0))
                    ).length
                  }
                </strong>
                已逾期
              </div>
              <div>
                <strong>
                  {entries.filter((e) => e.status === "draft").length}
                </strong>
                待确认
              </div>
            </div>
            {personId && (
              <Link to={"/patients/" + personId}>打开个人完整档案 →</Link>
            )}
          </section>
          <nav className="sa-tabs" aria-label="服务功能">
            {Object.entries({ ...labels, report: "报告归档" })
              .filter(([k]) => k !== "command")
              .map(([k, v]) => (
                <button
                  key={k}
                  aria-pressed={tab === k}
                  onClick={() => {
                    setTab(k);
                    setForm(null);
                  }}
                >
                  {v}
                </button>
              ))}
          </nav>
          {appInboxPanel}
          <details className="sa-card">
            <summary>服务概览 · 交接与回复</summary>
            <small>依据助手最近200条已保存事项；不代表完整群聊历史。</small>
            <div className="sa-actions">
              <button disabled={busy || !can('service_records','create')} onClick={()=>prepareDraft('handoff')}>一键交接草稿</button>
              <button disabled={busy || !personId || !can('service_records','create')} onClick={()=>prepareDraft('reply')}>拟客户回复</button>
              <button onClick={()=>setRemindersOnly(v=>!v)}>{remindersOnly ? '查看团队待跟进' : '只看我的临期提醒'}</button>
            </div>
            {!personId && <small>客户回复需先选择具体家庭成员，避免混入家人资料。</small>}
            {entries.filter(e=>e.kind==='task' && ['planned','in_progress'].includes(e.status) && (!remindersOnly || (idOf(e.assignedTo)===staff._id && e.dueAt && new Date(e.dueAt).getTime()<=Date.now()+86400000))).sort((a,b)=>(a.dueAt?new Date(a.dueAt).getTime():Infinity)-(b.dueAt?new Date(b.dueAt).getTime():Infinity)).slice(0,20).map(e=><p key={'overview-'+e._id}>
              {e.title} · {bundle.staff?.find(s=>s._id===idOf(e.assignedTo))?.name || '负责人待核对'} · {date(e.dueAt)}{e.dueAt && new Date(e.dueAt)<new Date() ? ' · 已到期' : ''}
            </p>)}
            {remindersOnly && <small>仅显示分配给我、未来24小时内到期或已逾期的已确认待办；这是站内查看，不是企微推送。</small>}
          </details>
          <section className="sa-card sa-command">
            <label>
              快捷指令
              <input
                value={command}
                onChange={(e) => setCommand(e.target.value)}
                placeholder="嘉医汇待办：帮母亲确认复诊时间"
              />
            </label>
            <button
              disabled={busy || !command.trim()}
              onClick={() =>
                run(async () => {
                  const r = await api.post(`/${groupId}/command`, {
                    text: command,
                  });
                  const c = r.data;
                  setTab(c.kind === "archive" ? "report" : c.kind);
                  if (c.kind === "archive") {
                    setReportTitle(c.text);
                    setNotice("请选择文件及明确服务对象后归档");
                  } else if (c.kind === "summary") {
                    setSource(c.text);
                  } else {
                    openForm(c.kind, c.text);
                    setNotice("请核对服务对象、负责人和日期，再保存");
                  }
                })
              }
            >
              整理为草稿
            </button>
            <small>当前指令在助手内处理；企微群口令监听尚未接入。</small>
          </section>
          {g.archiveConsent && (
            <section className="sa-card">
              <div className="sa-row">
                <h3>群消息收件箱</h3>
                <button
                  disabled={busy}
                  onClick={() =>
                    run(async () => {
                      const r = await api.get(`/${groupId}/messages`);
                      setMessages(r.data);
                      if (!r.data.length)
                        setNotice("暂无已接入的群消息，请核对存档采集器");
                    })
                  }
                >
                  读取已授权消息
                </button>
              </div>
              {messages
                .filter((m) => m.groupId === groupId)
                .map((m) => (
                  <div className="sa-native" key={m._id}>
                    <small>
                      {m.sender} · {date(m.sentAt)}
                    </small>
                    <p className="sa-pre">{m.text}</p>
                    <div className="sa-actions">
                      <button
                        onClick={() => {
                          setSource((old) =>
                            [old, `${m.sender} ${date(m.sentAt)}：${m.text}`]
                              .filter(Boolean)
                              .join("\n")
                          );
                          setTab("summary");
                        }}
                      >
                        加入总结
                      </button>
                      <button
                        onClick={() => {
                          openForm("task", m.text);
                          setTab("task");
                        }}
                      >
                        提取待办
                      </button>
                      {m.commandKind && (
                        <button onClick={() => setCommand(m.text)}>
                          填入快捷指令
                        </button>
                      )}
                      {m.attachment?.name && (
                        <button
                          onClick={() => {
                            setSourceMessage(m);
                            setFile(null);
                            setReportTitle(m.attachment.name);
                            setTab("report");
                            setReceipt(null);
                          }}
                        >
                          归档群文件：{m.attachment.name}
                        </button>
                      )}
                    </div>
                  </div>
                ))}
            </section>
          )}
          {tab !== "report" && (
            <div className="sa-row">
              <h2>{labels[tab]}</h2>
              {can(
                tab === "task" ? "followups" : "service_records",
                "create"
              ) && (
                <button disabled={busy} onClick={() => openForm(tab)}>
                  新建{labels[tab]}
                </button>
              )}
            </div>
          )}
          {entryForm}
          {tab === "summary" && (
            <section className="sa-card">
              <h3>本次沟通 / 交接总结</h3>
              <label>
                待整理的沟通内容
                <textarea
                  rows={5}
                  maxLength={20000}
                  value={source}
                  onChange={(e) => setSource(e.target.value)}
                  placeholder="粘贴本次需要整理的沟通，保留发言人与日期。"
                />
              </label>
              <button
                className="sa-primary"
                disabled={
                  busy || !source.trim() || !caps?.aiConfigured || !g.aiConsent
                }
                onClick={() =>
                  run(async () => {
                    await api.post(`/${groupId}/summary`, {
                      sourceText: source,
                      requestKey: key(),
                    });
                    setSource("");
                    await refresh();
                    setNotice("总结草稿已生成，待人工确认");
                  })
                }
              >
                生成AI总结草稿
              </button>
              {!g.aiConsent && (
                <small>
                  负责人可在群设置中确认AI处理授权；也可以手动新建总结。
                </small>
              )}
            </section>
          )}
          {tab === "report" && (
            <form
              className="sa-card"
              onSubmit={(e) => {
                e.preventDefault();
                run(async () => {
                  const data = new FormData();
                  data.append("file", file);
                  data.append("patientId", personId);
                  data.append("title", reportTitle);
                  data.append("date", reportDate);
                  data.append("documentCategory", category);
                  const r = sourceMessage
                    ? await api.post(`/${groupId}/archive-message`, {
                        messageId: sourceMessage._id,
                        patientId: personId,
                        title: reportTitle,
                        date: reportDate,
                        documentCategory: category,
                      })
                    : await api.upload(groupId, data);
                  setReceipt(r.data);
                  setFile(null);
                  setSourceMessage(null);
                  if (fileRef.current) fileRef.current.value = "";
                  await refresh();
                });
              }}
            >
              <h2>报告归档</h2>
              <p>请先选择报告所属的具体家庭成员。</p>
              <label>
                原始文件
                <input
                  ref={fileRef}
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png,.webp"
                  disabled={busy}
                  onChange={(e) => {
                    const f = e.target.files[0];
                    setReceipt(null);
                    setSourceMessage(null);
                    if (f?.size > 20 * 1024 * 1024) {
                      setError("单个文件最大20MB");
                      e.target.value = "";
                      setFile(null);
                      return;
                    }
                    setFile(f || null);
                    setReportTitle(f?.name || "");
                  }}
                />
              </label>
              {sourceMessage && (
                <p>
                  当前使用群文件：{sourceMessage.attachment.name}{" "}
                  <button type="button" onClick={() => setSourceMessage(null)}>
                    取消群文件
                  </button>
                </p>
              )}
              <label>
                报告名称
                <input
                  required
                  maxLength={160}
                  value={reportTitle}
                  onChange={(e) => setReportTitle(e.target.value)}
                />
              </label>
              <div className="sa-fields">
                <label>
                  资料类别
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                  >
                    {Object.entries(categories).map(([k, v]) => (
                      <option value={k} key={k}>
                        {v}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  检查日期
                  <input
                    type="date"
                    value={reportDate}
                    onChange={(e) => setReportDate(e.target.value)}
                  />
                </label>
              </div>
              <button
                className="sa-primary"
                disabled={
                  busy ||
                  !personId ||
                  (!file && !sourceMessage) ||
                  !caps?.storageConfigured ||
                  !can("reports", "create")
                }
              >
                {busy ? "正在归档…" : "确认上传到所选成员"}
              </button>
              <small>
                上传后进入待解析。本入口按同客户原件摘要去重；历史未计算摘要的报告仍需核对。
              </small>
              {receipt && (
                <p role="status">
                  {receipt.duplicate
                    ? "该原件已归档，本次未重复上传"
                    : "已上传 · 待解析"}{" "}
                  · 报告编号 {receipt.reportId}
                </p>
              )}
            </form>
          )}
          {entries
            .filter(
              (e) =>
                e.kind === tab && (!personId || idOf(e.patientId) === personId)
            )
            .map((e) => (
              <article className="sa-card" key={e._id}>
                <div className="sa-row">
                  <h3>{e.title}</h3>
                  <span className={"sa-status " + e.status}>
                    {statuses[e.status] || e.status}
                  </span>
                </div>
                <small>
                  {g.members.find(
                    (m) => idOf(m.patientId) === idOf(e.patientId)
                  )?.patientId.name || "家庭共同事项"}{" "}
                  ·{" "}
                  {bundle.staff.find((s) => s._id === idOf(e.assignedTo))
                    ?.name || "服务人员"}
                  {e.dueAt ? " · " + date(e.dueAt) : ""}
                  {e.aiGenerated ? " · AI草稿" : ""}
                </small>
                <p className="sa-pre">{e.content}</p>
                {e.result && <p className="sa-pre">处理结果：{e.result}</p>}
                <details>
                  <summary>来源与操作记录</summary>
                  <small>
                    创建时间：
                    {e.createdAt
                      ? new Date(e.createdAt).toLocaleString("zh-CN")
                      : "本次录入"}
                  </small>
                  {(e.history || []).map((h, i) => (
                    <small key={i}>
                      {h.at ? new Date(h.at).toLocaleString("zh-CN") : ""} ·{" "}
                      {bundle.staff.find((s) => s._id === idOf(h.actor))
                        ?.name || "服务人员"}{" "}
                      · {h.action}
                    </small>
                  ))}
                </details>
                {(e.suggestions || []).map((suggestion, index) => (
                  <div className="sa-native" key={index}>
                    <strong>{suggestion.title}</strong>
                    <p className="sa-pre">{suggestion.content}</p>
                    <small>原文依据：{suggestion.sourceQuote}</small>
                    <button
                      disabled={busy || !can("followups", "create")}
                      onClick={() => {
                        setTab("task");
                        setForm({
                          kind: "task",
                          title: suggestion.title,
                          content: suggestion.content,
                          patientId: "",
                          assignedTo: staff._id,
                          dueAt: "",
                          requestKey: `summary-${e._id}-${index}`,
                        });
                      }}
                    >
                      核对对象并创建待办
                    </button>
                  </div>
                ))}
                <div className="sa-actions">
                  {e.status === "draft" &&
                    can(
                      e.kind === "task" ? "followups" : "service_records",
                      "edit"
                    ) && (
                      <>
                        <button disabled={busy} onClick={() => setForm(e)}>
                          编辑
                        </button>
                        <button
                          disabled={busy}
                          className="sa-primary"
                          onClick={() =>
                            run(() =>
                              update(e, {
                                status:
                                  e.kind === "task" ? "planned" : "confirmed",
                              })
                            )
                          }
                        >
                          确认{e.kind === "task" ? "并安排跟进" : "记录"}
                        </button>
                        <button
                          disabled={busy}
                          onClick={() =>
                            run(() => update(e, { status: "cancelled" }))
                          }
                        >
                          取消草稿
                        </button>
                      </>
                    )}
                  {e.kind === "task" &&
                    ["planned", "in_progress"].includes(e.status) && (
                      <>
                        {e.status === "planned" && (
                          <button
                            disabled={busy}
                            onClick={() =>
                              run(() => update(e, { status: "in_progress" }))
                            }
                          >
                            开始处理
                          </button>
                        )}
                        <button
                          disabled={busy}
                          onClick={() => {
                            const result = window.prompt("请填写实际完成结果");
                            if (result?.trim())
                              run(() =>
                                update(e, { status: "completed", result })
                              );
                          }}
                        >
                          记录完成结果
                        </button>
                      </>
                    )}
                  {e.kind === "notification" && e.status === "confirmed" && (
                    <>
                      <button
                        disabled={busy}
                        onClick={() =>
                          run(async () => {
                            await navigator.clipboard.writeText(e.content);
                            setNotice("已复制文案，请在正确的服务群核对后发送");
                          })
                        }
                      >
                        复制文案
                      </button>
                      <button
                        disabled={busy || !caps?.sidebarConfigured || !g.chatId}
                        onClick={() =>
                          run(async () => {
                            if (
                              !window.confirm(
                                "确认将这段文案分享到当前绑定的服务群？"
                              )
                            )
                              return;
                            await shareToWecomGroup(g.chatId, e.content);
                            await update(e, { delivery: "shared" });
                            setNotice("企微分享操作已完成，不代表客户已阅读");
                          })
                        }
                      >
                        分享到当前企微群
                      </button>
                      <button
                        disabled={busy}
                        onClick={() =>
                          run(async () => {
                            if (window.confirm("确认已手动发送到正确服务群？"))
                              await update(e, {
                                delivery: "manually_confirmed",
                              });
                          })
                        }
                      >
                        标记已手动通知
                      </button>
                      <small>
                        {e.delivery === "unsent"
                          ? "尚未通知"
                          : e.delivery === "shared"
                          ? "已调用企微分享"
                          : "人工确认已通知"}
                      </small>
                    </>
                  )}
                </div>
                {e.nativeId && (
                  <small>
                    已关联嘉医汇{e.kind === "task" ? "随访待办" : "服务记录"} ·{" "}
                    {e.nativeId}
                  </small>
                )}
              </article>
            ))}
          {native && ["task", "record", "report"].includes(tab) && (
            <section className="sa-card">
              <h3>
                个人档案中的
                {tab === "task"
                  ? "随访待办"
                  : tab === "report"
                  ? "报告"
                  : "服务记录"}
              </h3>
              {(
                native[
                  tab === "task"
                    ? "followups"
                    : tab === "report"
                    ? "reports"
                    : "service_records"
                ] || []
              ).map((x) => (
                <div className="sa-native" key={x._id}>
                  <strong>{x.theme || x.title || "服务事项"}</strong>
                  <small>
                    {date(x.date || x.checkDate)} ·{" "}
                    {statuses[x.status] ||
                      (x.audit_status === "audited"
                        ? "已审核"
                        : x.aiStatus === "processing"
                        ? "解析中"
                        : x.aiStatus === "none"
                        ? "待解析"
                        : "")}
                  </small>
                  <p className="sa-pre">{x.content}</p>
                  {tab === "task" && (
                    <button
                      onClick={() => {
                        setTab("notification");
                        setForm({
                          kind: "notification",
                          title: `待办提醒：${x.theme || "服务跟进"}`,
                          content:
                            "您好，想与您确认后续服务安排，方便时请与服务顾问联系。",
                          patientId: personId,
                          assignedTo: staff._id,
                          dueAt: "",
                          requestKey: key(),
                          relatedFollowUpId: x._id,
                        });
                      }}
                    >
                      为此事项拟群通知
                    </button>
                  )}
                </div>
              ))}
              {!native[
                tab === "task"
                  ? "followups"
                  : tab === "report"
                  ? "reports"
                  : "service_records"
              ] && <p>无此模块查看权限</p>}
            </section>
          )}
        </>
      )}
    </div>
  );
}
