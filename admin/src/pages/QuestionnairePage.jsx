import React, { useEffect, useState, useRef } from 'react'
import { adminAPI } from '../api'
import { useToast } from '../App'

const STATUS_META = {
  draft:  { label: '草稿',   cls: 'badge-gray'  },
  active: { label: '发布中', cls: 'badge-green' },
  closed: { label: '已关闭', cls: 'badge-yellow' },
}

const Q_TYPE_LABELS = {
  radio: '单选', multi: '多选', dropdown: '下拉', scale: '量表',
  matrix: '矩阵', text: '文本', number: '数字', date: '日期',
}

const Q_TYPE_ICONS = {
  radio: '◉', multi: '☑', dropdown: '▾', scale: '★',
  matrix: '⊞', text: '✏', number: '#', date: '📅',
}

// ── 预设选项库 ────────────────────────────────────────────────────
const PRESETS = [
  { label: '性别', options: ['男', '女', '其他'] },
  { label: '是 / 否', options: ['是', '否'] },
  { label: '血型', options: ['A型', 'B型', 'AB型', 'O型', '不详'] },
  { label: '学历', options: ['小学及以下', '初中', '高中/中专', '大专', '本科', '硕士及以上'] },
  { label: '婚姻状况', options: ['未婚', '已婚', '离异', '丧偶', '分居'] },
  { label: '职业', options: ['医疗卫生人员', '教育工作者', '企事业单位职工', '公务员', '个体工商户', '农民', '工人', '军人', '学生', '自由职业者', '退休人员', '无业/失业', '其他'] },
  { label: '满意度', options: ['非常不满意', '不满意', '一般', '满意', '非常满意'] },
  { label: '频率', options: ['从不', '偶尔', '有时', '经常', '总是'] },
  { label: '程度', options: ['无', '轻度', '中度', '重度'] },
  { label: '民族', options: ['汉族','壮族','满族','回族','苗族','维吾尔族','土家族','彝族','蒙古族','藏族','布依族','侗族','瑶族','朝鲜族','白族','哈尼族','哈萨克族','黎族','傣族','畲族','傈僳族','仡佬族','东乡族','高山族','拉祜族','水族','佤族','纳西族','羌族','土族','仫佬族','锡伯族','柯尔克孜族','达斡尔族','景颇族','毛南族','撒拉族','布朗族','塔吉克族','阿昌族','普米族','鄂温克族','怒族','京族','基诺族','德昂族','保安族','俄罗斯族','裕固族','乌孜别克族','门巴族','鄂伦春族','独龙族','塔塔尔族','赫哲族','珞巴族','其他'] },
]

// ── 选项编辑区（含批量输入 + 预设库） ────────────────────────────
function OptionsEditor({ options = [], onChange }) {
  const [showBatch, setShowBatch] = useState(false)
  const [showPresets, setShowPresets] = useState(false)
  const [batchText, setBatchText] = useState('')
  const presetsRef = useRef(null)

  // 点击外部关闭预设面板
  useEffect(() => {
    if (!showPresets) return
    const handler = (e) => { if (presetsRef.current && !presetsRef.current.contains(e.target)) setShowPresets(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showPresets])

  const applyBatch = () => {
    const lines = batchText.split('\n').map(l => l.trim()).filter(Boolean)
    if (lines.length) onChange(lines)
    setShowBatch(false)
    setBatchText('')
  }

  return (
    <div>
      {/* 工具栏 */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ fontSize: 12, color: '#8AA89C' }}>选项</span>
        <div style={{ position: 'relative' }} ref={presetsRef}>
          <button className="btn btn-sm btn-ghost" style={{ fontSize: 11 }}
            onClick={() => { setShowPresets(v => !v); setShowBatch(false) }}>
            📋 插入预设 ▾
          </button>
          {showPresets && (
            <div style={{
              position: 'absolute', top: '100%', left: 0, zIndex: 100, marginTop: 4,
              background: '#fff', border: '1px solid #E0D9CE', borderRadius: 8,
              padding: 8, boxShadow: '0 4px 16px rgba(0,0,0,0.1)',
              display: 'flex', flexDirection: 'column', gap: 2, minWidth: 130,
            }}>
              {PRESETS.map(p => (
                <button key={p.label}
                  className="btn btn-sm btn-ghost"
                  style={{ justifyContent: 'flex-start', fontSize: 12, padding: '5px 10px' }}
                  onClick={() => { onChange(p.options); setShowPresets(false) }}>
                  {p.label}
                  <span style={{ color: '#aaa', marginLeft: 4, fontSize: 11 }}>({p.options.length}项)</span>
                </button>
              ))}
            </div>
          )}
        </div>
        <button className="btn btn-sm btn-ghost" style={{ fontSize: 11 }}
          onClick={() => { setShowBatch(v => !v); setShowPresets(false) }}>
          ✏️ 批量输入
        </button>
      </div>

      {/* 批量输入区 */}
      {showBatch && (
        <div style={{ marginBottom: 8, background: '#f9f7f3', borderRadius: 6, padding: 10 }}>
          <div style={{ fontSize: 12, color: '#8AA89C', marginBottom: 6 }}>每行一个选项，输入完成后点击确认</div>
          <textarea
            className="form-input" rows={5} autoFocus
            placeholder={'选项A\n选项B\n选项C'}
            value={batchText}
            onChange={e => setBatchText(e.target.value)}
            style={{ marginBottom: 6, fontFamily: 'monospace', fontSize: 13 }}
          />
          <div style={{ display: 'flex', gap: 6 }}>
            <button className="btn btn-sm btn-primary" onClick={applyBatch}>确认（替换当前选项）</button>
            <button className="btn btn-sm btn-ghost" onClick={() => { setShowBatch(false); setBatchText('') }}>取消</button>
          </div>
        </div>
      )}

      {/* 逐条选项 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {options.map((opt, oi) => (
          <div key={oi} style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
            <span style={{ fontSize: 11, color: '#aaa', minWidth: 18, textAlign: 'right' }}>{oi + 1}.</span>
            <input className="form-input" value={opt} placeholder={`选项 ${oi + 1}`} style={{ flex: 1 }}
              onChange={e => { const o = [...options]; o[oi] = e.target.value; onChange(o) }}
              onKeyDown={e => {
                // 按 Enter 自动添加下一项
                if (e.key === 'Enter') { e.preventDefault(); onChange([...options, '']) }
              }}
            />
            <button style={{ border: 'none', background: 'none', color: '#ccc', cursor: 'pointer', fontSize: 16, padding: '0 4px', lineHeight: 1 }}
              onClick={() => onChange(options.filter((_, idx) => idx !== oi))}>×</button>
          </div>
        ))}
      </div>

      <button className="btn btn-sm btn-ghost" style={{ alignSelf: 'flex-start', marginTop: 6, fontSize: 12 }}
        onClick={() => onChange([...options, ''])}>
        ＋ 添加选项
      </button>
      <div style={{ fontSize: 11, color: '#aaa', marginTop: 4 }}>提示：在选项框内按 Enter 快速添加下一项</div>
    </div>
  )
}

// ── 单题编辑卡 ────────────────────────────────────────────────────
function QuestionCard({ q, i, total, onUpdate, onRemove, onMove }) {
  const [collapsed, setCollapsed] = useState(false)

  const handleTypeChange = (type) => {
    const upd = { type }
    if (type === 'radio' || type === 'multi' || type === 'dropdown') {
      upd.options = q.options?.length ? q.options : ['', '']
    }
    if (type === 'scale')  { upd.min = 1; upd.max = 10; upd.minLabel = ''; upd.maxLabel = '' }
    if (type === 'matrix') { upd.rows = q.rows?.length ? q.rows : ['项目1']; upd.cols = q.cols?.length ? q.cols : ['无', '轻度', '中度', '重度'] }
    if (type === 'number') { upd.placeholder = q.placeholder || '请输入数字' }
    if (type === 'date')   { upd.placeholder = q.placeholder || '' }
    if (type === 'text')   { upd.placeholder = q.placeholder || '' }
    onUpdate(upd)
  }

  return (
    <div style={{ border: '1px solid #E0D9CE', borderRadius: 8, background: '#fff', overflow: 'hidden' }}>
      {/* 题目头部 */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '8px 12px', background: '#f9f7f3', borderBottom: collapsed ? 'none' : '1px solid #f0ece4' }}>
        <span style={{ fontWeight: 700, color: '#1E6B50', fontSize: 13, minWidth: 28 }}>Q{i + 1}</span>

        {/* 题型选择 */}
        <select value={q.type} onChange={e => handleTypeChange(e.target.value)}
          style={{ border: '1px solid #ddd', borderRadius: 4, padding: '3px 6px', fontSize: 12, background: '#fff' }}>
          {Object.entries(Q_TYPE_LABELS).map(([k, v]) => (
            <option key={k} value={k}>{Q_TYPE_ICONS[k]} {v}</option>
          ))}
        </select>

        {/* 题目文字（折叠时预览） */}
        {collapsed ? (
          <span style={{ flex: 1, fontSize: 13, color: '#4A6558', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {q.text || <span style={{ color: '#ccc' }}>（未填写题目）</span>}
          </span>
        ) : (
          <label style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 4, marginLeft: 'auto' }}>
            <input type="checkbox" checked={q.required !== false}
              onChange={e => onUpdate({ required: e.target.checked })} />
            必填
          </label>
        )}

        {/* 操作按钮 */}
        <div style={{ display: 'flex', gap: 2, marginLeft: collapsed ? 0 : undefined, flexShrink: 0 }}>
          <button title="折叠/展开" onClick={() => setCollapsed(v => !v)}
            style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#aaa', fontSize: 14, padding: '2px 4px' }}>
            {collapsed ? '▶' : '▼'}
          </button>
          <button onClick={() => onMove(-1)} disabled={i === 0}
            style={{ border: 'none', background: 'none', cursor: i === 0 ? 'default' : 'pointer', color: i === 0 ? '#ddd' : '#aaa', fontSize: 14, padding: '2px 4px' }}>↑</button>
          <button onClick={() => onMove(1)} disabled={i === total - 1}
            style={{ border: 'none', background: 'none', cursor: i === total - 1 ? 'default' : 'pointer', color: i === total - 1 ? '#ddd' : '#aaa', fontSize: 14, padding: '2px 4px' }}>↓</button>
          <button onClick={onRemove}
            style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#f87171', fontSize: 16, padding: '2px 4px' }}>🗑</button>
        </div>
      </div>

      {/* 题目内容（展开时） */}
      {!collapsed && (
        <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
            <input className="form-input" placeholder="请输入题目内容 *" value={q.text}
              onChange={e => onUpdate({ text: e.target.value })} style={{ flex: 1 }} />
            <label style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap', paddingTop: 8 }}>
              <input type="checkbox" checked={q.required !== false}
                onChange={e => onUpdate({ required: e.target.checked })} />
              必填
            </label>
          </div>

          {/* 单选 / 多选 / 下拉 */}
          {(q.type === 'radio' || q.type === 'multi' || q.type === 'dropdown') && (
            <OptionsEditor options={q.options || []} onChange={opts => onUpdate({ options: opts })} />
          )}

          {/* 量表 */}
          {q.type === 'scale' && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <span style={{ fontSize: 12, color: '#666' }}>范围</span>
                <input type="number" className="form-input" style={{ width: 60 }} value={q.min ?? 1}
                  onChange={e => onUpdate({ min: parseInt(e.target.value) || 1 })} />
                <span style={{ fontSize: 12, color: '#aaa' }}>至</span>
                <input type="number" className="form-input" style={{ width: 60 }} value={q.max ?? 10}
                  onChange={e => onUpdate({ max: parseInt(e.target.value) || 10 })} />
              </div>
              <input className="form-input" style={{ flex: 1, minWidth: 120 }} placeholder="左端标签（如：非常差）"
                value={q.minLabel || ''} onChange={e => onUpdate({ minLabel: e.target.value })} />
              <input className="form-input" style={{ flex: 1, minWidth: 120 }} placeholder="右端标签（如：非常好）"
                value={q.maxLabel || ''} onChange={e => onUpdate({ maxLabel: e.target.value })} />
            </div>
          )}

          {/* 矩阵 */}
          {q.type === 'matrix' && (
            <div style={{ display: 'flex', gap: 12 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12, color: '#666', marginBottom: 4 }}>行标签（每行一个）</div>
                <textarea className="form-input" rows={4} value={(q.rows || []).join('\n')}
                  onChange={e => onUpdate({ rows: e.target.value.split('\n') })}
                  placeholder={'焦虑\n抑郁\n失眠'} style={{ fontFamily: 'monospace', fontSize: 13 }} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12, color: '#666', marginBottom: 4 }}>列标签（每行一个）</div>
                <textarea className="form-input" rows={4} value={(q.cols || []).join('\n')}
                  onChange={e => onUpdate({ cols: e.target.value.split('\n') })}
                  placeholder={'无\n轻度\n中度\n重度'} style={{ fontFamily: 'monospace', fontSize: 13 }} />
              </div>
            </div>
          )}

          {/* 数字 */}
          {q.type === 'number' && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <span style={{ fontSize: 12, color: '#666' }}>数值范围（可选）</span>
                <input type="number" className="form-input" style={{ width: 80 }} placeholder="最小"
                  value={q.min ?? ''} onChange={e => onUpdate({ min: e.target.value === '' ? undefined : Number(e.target.value) })} />
                <span style={{ fontSize: 12, color: '#aaa' }}>至</span>
                <input type="number" className="form-input" style={{ width: 80 }} placeholder="最大"
                  value={q.max ?? ''} onChange={e => onUpdate({ max: e.target.value === '' ? undefined : Number(e.target.value) })} />
              </div>
              <input className="form-input" style={{ flex: 1, minWidth: 160 }} placeholder="输入框提示（如：请输入体重 kg）"
                value={q.placeholder || ''} onChange={e => onUpdate({ placeholder: e.target.value })} />
            </div>
          )}

          {/* 文本 / 日期 */}
          {(q.type === 'text' || q.type === 'date') && (
            <input className="form-input" placeholder={q.type === 'date' ? '日期选择框提示（可选）' : '长文本输入框提示（可选）'}
              value={q.placeholder || ''} onChange={e => onUpdate({ placeholder: e.target.value })} />
          )}
        </div>
      )}
    </div>
  )
}

// ── 快捷添加按钮栏 ────────────────────────────────────────────────
function AddQuestionBar({ onAdd }) {
  const QUICK = [
    { type: 'radio',    label: '单选' },
    { type: 'multi',    label: '多选' },
    { type: 'dropdown', label: '下拉' },
    { type: 'scale',    label: '量表' },
    { type: 'matrix',   label: '矩阵' },
    { type: 'text',     label: '文本' },
    { type: 'number',   label: '数字' },
    { type: 'date',     label: '日期' },
  ]
  const newQ = (type) => {
    const base = { id: `q${Date.now()}`, type, text: '', required: true }
    if (type === 'radio' || type === 'multi' || type === 'dropdown') base.options = ['', '']
    if (type === 'scale')  { base.min = 1; base.max = 10; base.minLabel = ''; base.maxLabel = '' }
    if (type === 'matrix') { base.rows = ['项目1']; base.cols = ['无', '轻度', '中度', '重度'] }
    if (type === 'number' || type === 'text' || type === 'date') base.placeholder = ''
    onAdd(base)
  }

  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', padding: '10px 0' }}>
      <span style={{ fontSize: 12, color: '#8AA89C', marginRight: 4 }}>添加题目：</span>
      {QUICK.map(q => (
        <button key={q.type} className="btn btn-sm btn-ghost"
          style={{ fontSize: 12, padding: '4px 10px' }}
          onClick={() => newQ(q.type)}>
          {Q_TYPE_ICONS[q.type]} {q.label}
        </button>
      ))}
    </div>
  )
}

// ── 问卷编辑弹窗 ──────────────────────────────────────────────────
function QuestionnaireModal({ questionnaire, onClose, onSaved }) {
  const toast = useToast()
  const isEdit = !!questionnaire?._id
  const [form, setForm] = useState({
    title:       questionnaire?.title       || '',
    description: questionnaire?.description || '',
    questions:   questionnaire?.questions   || [],
    targetType:  questionnaire?.targetType  || 'all',
    deadline:    questionnaire?.deadline    || '',
  })
  const [loading, setLoading] = useState(false)

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const addQ    = (q) => set('questions', [...form.questions, q])
  const updateQ = (i, upd) => { const qs = [...form.questions]; qs[i] = { ...qs[i], ...upd }; set('questions', qs) }
  const removeQ = (i) => set('questions', form.questions.filter((_, idx) => idx !== i))
  const moveQ   = (i, dir) => {
    const qs = [...form.questions]; const j = i + dir
    if (j < 0 || j >= qs.length) return
    ;[qs[i], qs[j]] = [qs[j], qs[i]]; set('questions', qs)
  }

  const save = async () => {
    if (!form.title.trim()) { toast('❌ 请输入问卷标题'); return }
    if (form.questions.length === 0) { toast('❌ 至少添加一个问题'); return }
    const emptyQ = form.questions.findIndex(q => !q.text?.trim())
    if (emptyQ !== -1) { toast(`❌ Q${emptyQ + 1} 题目内容不能为空`); return }
    setLoading(true)
    try {
      if (isEdit) await adminAPI.updateQuestionnaire(questionnaire._id, form)
      else        await adminAPI.createQuestionnaire(form)
      toast(`✅ 问卷${isEdit ? '更新' : '创建'}成功`)
      onSaved(); onClose()
    } catch (err) {
      toast('❌ ' + (err.message || '操作失败'))
    } finally { setLoading(false) }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 780, width: '96%', maxHeight: '92vh', display: 'flex', flexDirection: 'column' }}
        onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title">{isEdit ? '✏️ 编辑问卷' : '📝 新建问卷'}</div>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <div className="modal-body" style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* 基本信息 */}
          <div style={{ background: '#f9f7f3', borderRadius: 8, padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#8AA89C', marginBottom: 2 }}>基本信息</div>
            <input className="form-input" value={form.title}
              onChange={e => set('title', e.target.value)}
              placeholder="问卷标题 *（如：高血压患者生活质量调查）" />
            <textarea className="form-input" rows={2} value={form.description}
              onChange={e => set('description', e.target.value)}
              placeholder="问卷说明（可选）" />
            <div style={{ display: 'flex', gap: 10 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12, color: '#666', marginBottom: 4 }}>推送对象</div>
                <select className="form-input" value={form.targetType} onChange={e => set('targetType', e.target.value)}>
                  <option value="all">全体用户</option>
                  <option value="specific">指定用户（医护端推送时选人）</option>
                </select>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12, color: '#666', marginBottom: 4 }}>截止日期（可选）</div>
                <input type="date" className="form-input" value={form.deadline}
                  onChange={e => set('deadline', e.target.value)} />
              </div>
            </div>
          </div>

          {/* 题目列表 */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: '#4A6558' }}>
                题目列表
                {form.questions.length > 0 && (
                  <span style={{ fontWeight: 400, color: '#aaa', marginLeft: 6 }}>（共 {form.questions.length} 题）</span>
                )}
              </span>
            </div>

            {form.questions.length === 0 ? (
              <div style={{ border: '2px dashed #E0D9CE', borderRadius: 8, padding: 32, textAlign: 'center', color: '#aaa', fontSize: 13 }}>
                还没有题目，从下方按题型添加
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {form.questions.map((q, i) => (
                  <QuestionCard
                    key={q.id}
                    q={q} i={i} total={form.questions.length}
                    onUpdate={upd => updateQ(i, upd)}
                    onRemove={() => removeQ(i)}
                    onMove={dir => moveQ(i, dir)}
                  />
                ))}
              </div>
            )}

            <AddQuestionBar onAdd={addQ} />
          </div>
        </div>

        <div className="modal-footer" style={{ borderTop: '1px solid #f0ece4' }}>
          <button className="btn btn-ghost" onClick={onClose}>取消</button>
          <button className="btn btn-primary" onClick={save} disabled={loading}>
            {loading ? '保存中...' : (isEdit ? '更新问卷' : '创建问卷')}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── 答卷查看弹窗 ──────────────────────────────────────────────────
function ResponsesModal({ questionnaire, onClose }) {
  const toast = useToast()
  const [responses, setResponses] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    adminAPI.questionnaireResponses(questionnaire._id)
      .then(r => setResponses(r.data || []))
      .catch(err => toast('❌ ' + err.message))
      .finally(() => setLoading(false))
  }, [questionnaire._id])

  const fmtAnswer = (a) => {
    if (!a && a !== 0) return '未填写'
    if (Array.isArray(a)) return a.join('、')
    if (typeof a === 'object') return Object.entries(a).map(([k, v]) => `${k}: ${v}`).join('；')
    return String(a)
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 800, width: '96%', maxHeight: '90vh', overflow: 'auto' }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title">📊 答卷详情 · {questionnaire.title}</div>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          {loading && <div style={{ textAlign: 'center', padding: 32 }}>加载中...</div>}
          {!loading && responses.length === 0 && (
            <div style={{ textAlign: 'center', color: '#888', padding: 32 }}>暂无答卷</div>
          )}
          {responses.map((resp) => (
            <div key={resp._id} style={{ marginBottom: 20, border: '1px solid #E0D9CE', borderRadius: 8, overflow: 'hidden' }}>
              <div style={{ background: '#f5f0e8', padding: '8px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontWeight: 600 }}>{resp.user?.name || '匿名'} · {resp.user?.phone}</span>
                <span style={{ fontSize: 12, color: '#888' }}>{new Date(resp.submittedAt).toLocaleString('zh-CN')}</span>
              </div>
              <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
                {questionnaire.questions?.map((q, qi) => (
                  <div key={q.id} style={{ fontSize: 13 }}>
                    <span style={{ color: '#1E6B50', fontWeight: 600 }}>Q{qi + 1}. {q.text}</span>
                    <div style={{ color: '#444', marginTop: 2, paddingLeft: 12 }}>{fmtAnswer(resp.answers?.[q.id])}</div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose}>关闭</button>
        </div>
      </div>
    </div>
  )
}

// ── 主页面 ────────────────────────────────────────────────────────
export default function QuestionnairePage() {
  const toast = useToast()
  const [list, setList] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState(null)
  const [viewingResponses, setViewingResponses] = useState(null)

  const load = async () => {
    setLoading(true)
    try { setList((await adminAPI.questionnaires()).data || []) }
    catch (err) { toast('❌ 加载失败：' + err.message) }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  const setStatus = async (q, status) => {
    try { await adminAPI.setQuestionnaireStatus(q._id, status); toast('✅ 状态已更新'); load() }
    catch (err) { toast('❌ ' + err.message) }
  }

  const del = async (q) => {
    if (!window.confirm(`确定删除「${q.title}」及所有答卷？此操作不可恢复。`)) return
    try { await adminAPI.deleteQuestionnaire(q._id); toast('✅ 已删除'); load() }
    catch (err) { toast('❌ ' + err.message) }
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="page-title">📝 问卷管理</div>
          <div className="page-subtitle">创建并管理向用户推送的健康问卷</div>
        </div>
        <button className="btn btn-primary" onClick={() => { setEditing(null); setShowModal(true) }}>＋ 新建问卷</button>
      </div>

      {loading ? <div className="loading">加载中...</div> : (
        <div className="card" style={{ padding: 0 }}>
          <table className="table">
            <thead>
              <tr>
                <th>问卷标题</th>
                <th>题数</th>
                <th>推送对象</th>
                <th>截止日期</th>
                <th>回答数</th>
                <th>状态</th>
                <th>创建时间</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {list.length === 0 && (
                <tr><td colSpan={8} style={{ textAlign: 'center', color: '#888', padding: 32 }}>暂无问卷，点击「新建问卷」开始创建</td></tr>
              )}
              {list.map(q => {
                const meta = STATUS_META[q.status] || STATUS_META.draft
                return (
                  <tr key={q._id}>
                    <td>
                      <div style={{ fontWeight: 600 }}>{q.title}</div>
                      {q.description && <div style={{ fontSize: 12, color: '#888' }}>{q.description.slice(0, 40)}{q.description.length > 40 ? '...' : ''}</div>}
                    </td>
                    <td>{q.questions?.length || 0} 题</td>
                    <td>{q.targetType === 'all' ? '全体' : `指定 ${q.targetUsers?.length || 0} 人`}</td>
                    <td style={{ fontSize: 13 }}>{q.deadline || '—'}</td>
                    <td>
                      <span style={{ cursor: 'pointer', color: '#1E6B50', textDecoration: 'underline' }}
                        onClick={() => setViewingResponses(q)}>
                        {q.responseCount || 0} 份
                      </span>
                    </td>
                    <td><span className={`badge ${meta.cls}`}>{meta.label}</span></td>
                    <td style={{ fontSize: 12, color: '#888' }}>{new Date(q.createdAt).toLocaleDateString('zh-CN')}</td>
                    <td>
                      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                        <button className="btn btn-sm btn-ghost" onClick={() => { setEditing(q); setShowModal(true) }}>编辑</button>
                        {q.status === 'draft'  && <button className="btn btn-sm btn-ghost" style={{ color: '#1E6B50' }} onClick={() => setStatus(q, 'active')}>发布</button>}
                        {q.status === 'active' && <button className="btn btn-sm btn-ghost" onClick={() => setStatus(q, 'closed')}>关闭</button>}
                        {q.status === 'closed' && <button className="btn btn-sm btn-ghost" style={{ color: '#1E6B50' }} onClick={() => setStatus(q, 'active')}>重开</button>}
                        <button className="btn btn-sm" style={{ background: '#fee', color: '#c00', border: '1px solid #fcc' }} onClick={() => del(q)}>删除</button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {showModal && (
        <QuestionnaireModal
          questionnaire={editing}
          onClose={() => setShowModal(false)}
          onSaved={load}
        />
      )}
      {viewingResponses && (
        <ResponsesModal
          questionnaire={viewingResponses}
          onClose={() => setViewingResponses(null)}
        />
      )}
    </div>
  )
}
