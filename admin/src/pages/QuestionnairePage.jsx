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

// ── 选项格式规范化（兼容旧版字符串数组）────────────────────────────
const normalizeOptions = (opts) => {
  if (!opts) return []
  return opts.map(o =>
    typeof o === 'string'
      ? { label: o, allowInput: false, exclusive: false, score: 0 }
      : { label: o.label || '', allowInput: !!o.allowInput, exclusive: !!o.exclusive, score: o.score || 0 }
  )
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

// ── 增强版选项编辑区 ────────────────────────────────────────────
// options: [{label, allowInput, exclusive, score}]
function OptionsEditor({ options = [], onChange, isMulti = false, scoringEnabled = false }) {
  const [showBatch, setShowBatch] = useState(false)
  const [showPresets, setShowPresets] = useState(false)
  const [presetPos, setPresetPos] = useState({ top: 0, left: 0 })
  const [batchText, setBatchText] = useState('')
  const presetsRef = useRef(null)
  const presetBtnRef = useRef(null)

  useEffect(() => {
    if (!showPresets) return
    const handler = (e) => { if (presetsRef.current && !presetsRef.current.contains(e.target)) setShowPresets(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showPresets])

  const openPresets = () => {
    if (presetBtnRef.current) {
      const rect = presetBtnRef.current.getBoundingClientRect()
      setPresetPos({ top: rect.bottom + 4, left: rect.left })
    }
    setShowPresets(v => !v)
    setShowBatch(false)
  }

  const applyBatch = () => {
    const lines = batchText.split('\n').map(l => l.trim()).filter(Boolean)
    if (lines.length) onChange(lines.map(l => ({ label: l, allowInput: false, exclusive: false, score: 0 })))
    setShowBatch(false)
    setBatchText('')
  }

  const updateOpt = (idx, patch) => {
    const o = options.map((opt, i) => i === idx ? { ...opt, ...patch } : opt)
    onChange(o)
  }

  return (
    <div>
      {/* 工具栏 */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ fontSize: 12, color: '#8AA89C' }}>选项</span>
        <div style={{ position: 'relative' }}>
          <button ref={presetBtnRef} className="btn btn-sm btn-ghost" style={{ fontSize: 11 }}
            onClick={openPresets}>
            📋 插入预设 ▾
          </button>
          {showPresets && (
            <div ref={presetsRef} style={{
              position: 'fixed', top: presetPos.top, left: presetPos.left, zIndex: 9999,
              background: '#fff', border: '1px solid #E0D9CE', borderRadius: 8,
              padding: 8, boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
              display: 'flex', flexDirection: 'column', gap: 2, minWidth: 160,
              maxHeight: 320, overflowY: 'auto',
            }}>
              {PRESETS.map(p => (
                <button key={p.label}
                  className="btn btn-sm btn-ghost"
                  style={{ justifyContent: 'flex-start', fontSize: 12, padding: '5px 10px' }}
                  onClick={() => {
                    onChange(p.options.map(l => ({ label: l, allowInput: false, exclusive: false, score: 0 })))
                    setShowPresets(false)
                  }}>
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

      {/* 列表头 */}
      <div style={{ display: 'flex', gap: 4, alignItems: 'center', marginBottom: 4, paddingLeft: 22, fontSize: 11, color: '#aaa' }}>
        <span style={{ flex: 1 }}>选项文字</span>
        <span style={{ width: 72, textAlign: 'center' }}>可附加输入</span>
        {isMulti && <span style={{ width: 48, textAlign: 'center' }}>互斥</span>}
        {scoringEnabled && <span style={{ width: 52, textAlign: 'center' }}>分值</span>}
        <span style={{ width: 20 }} />
      </div>

      {/* 逐条选项 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {options.map((opt, oi) => (
          <div key={oi} style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
            <span style={{ fontSize: 11, color: '#aaa', minWidth: 18, textAlign: 'right' }}>{oi + 1}.</span>
            <input className="form-input" value={opt.label} placeholder={`选项 ${oi + 1}`} style={{ flex: 1 }}
              onChange={e => updateOpt(oi, { label: e.target.value })}
              onKeyDown={e => {
                if (e.key === 'Enter') { e.preventDefault(); onChange([...options, { label: '', allowInput: false, exclusive: false, score: 0 }]) }
              }}
            />
            {/* 可附加输入 */}
            <div style={{ width: 72, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 3 }}>
              <input type="checkbox" checked={!!opt.allowInput}
                onChange={e => updateOpt(oi, { allowInput: e.target.checked })}
                title="选中此选项后可附加文字输入" />
              <span style={{ fontSize: 11, color: '#888' }}>可填</span>
            </div>
            {/* 互斥（仅多选） */}
            {isMulti && (
              <div style={{ width: 48, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 3 }}>
                <input type="checkbox" checked={!!opt.exclusive}
                  onChange={e => updateOpt(oi, { exclusive: e.target.checked })}
                  title="选此选项时取消其他已选项" />
                <span style={{ fontSize: 11, color: '#888' }}>互斥</span>
              </div>
            )}
            {/* 分值（仅评分启用时） */}
            {scoringEnabled && (
              <input type="number" className="form-input" style={{ width: 52, textAlign: 'center' }}
                value={opt.score || 0}
                onChange={e => updateOpt(oi, { score: parseFloat(e.target.value) || 0 })}
                title="该选项得分" />
            )}
            <button style={{ border: 'none', background: 'none', color: '#ccc', cursor: 'pointer', fontSize: 16, padding: '0 4px', lineHeight: 1, width: 20 }}
              onClick={() => onChange(options.filter((_, idx) => idx !== oi))}>×</button>
          </div>
        ))}
      </div>

      <button className="btn btn-sm btn-ghost" style={{ alignSelf: 'flex-start', marginTop: 6, fontSize: 12 }}
        onClick={() => onChange([...options, { label: '', allowInput: false, exclusive: false, score: 0 }])}>
        ＋ 添加选项
      </button>
      <div style={{ fontSize: 11, color: '#aaa', marginTop: 4 }}>提示：在选项框内按 Enter 快速添加下一项</div>
    </div>
  )
}

// ── 跳题逻辑编辑区 ────────────────────────────────────────────────
function JumpLogicEditor({ jumpLogic = [], options = [], allQuestions = [], currentQIndex, onChange }) {
  const availableTargets = allQuestions.filter((_, i) => i !== currentQIndex)
  const optionLabels = options.map(o => (typeof o === 'string' ? o : o.label)).filter(Boolean)

  const addRule = () => onChange([...jumpLogic, { condition: optionLabels[0] || '', jumpTo: availableTargets[0]?.id || '' }])
  const updateRule = (i, patch) => { const r = [...jumpLogic]; r[i] = { ...r[i], ...patch }; onChange(r) }
  const removeRule = (i) => onChange(jumpLogic.filter((_, idx) => idx !== i))

  if (optionLabels.length === 0 || availableTargets.length === 0) return null

  return (
    <div style={{ background: '#f0f9ff', border: '1px solid #bee3f8', borderRadius: 6, padding: 10 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: '#2b6cb0', marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span>🔀 跳题逻辑</span>
        <button className="btn btn-sm btn-ghost" style={{ fontSize: 11, color: '#2b6cb0' }} onClick={addRule}>＋ 添加规则</button>
      </div>
      {jumpLogic.length === 0 && (
        <div style={{ fontSize: 12, color: '#aaa' }}>暂无规则。添加规则可让选择某选项后跳转到指定题目。</div>
      )}
      {jumpLogic.map((rule, i) => (
        <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 6, fontSize: 12 }}>
          <span style={{ color: '#666', whiteSpace: 'nowrap' }}>如果回答</span>
          <select value={rule.condition}
            onChange={e => updateRule(i, { condition: e.target.value })}
            style={{ border: '1px solid #ddd', borderRadius: 4, padding: '3px 6px', fontSize: 12, background: '#fff', flex: 1 }}>
            {optionLabels.map(l => <option key={l} value={l}>{l}</option>)}
          </select>
          <span style={{ color: '#666', whiteSpace: 'nowrap' }}>则跳转到</span>
          <select value={rule.jumpTo}
            onChange={e => updateRule(i, { jumpTo: e.target.value })}
            style={{ border: '1px solid #ddd', borderRadius: 4, padding: '3px 6px', fontSize: 12, background: '#fff', flex: 1 }}>
            {availableTargets.map((q, qi) => (
              <option key={q.id} value={q.id}>
                Q{allQuestions.findIndex(aq => aq.id === q.id) + 1} {q.text ? `· ${q.text.slice(0, 20)}` : ''}
              </option>
            ))}
          </select>
          <button style={{ border: 'none', background: 'none', color: '#f87171', cursor: 'pointer', fontSize: 14, padding: '0 2px' }}
            onClick={() => removeRule(i)}>×</button>
        </div>
      ))}
    </div>
  )
}

// ── 单题编辑卡 ────────────────────────────────────────────────────
function QuestionCard({ q, i, total, allQuestions, onUpdate, onRemove, onMove, scoringEnabled, archiveFields = [] }) {
  const [collapsed, setCollapsed] = useState(false)

  const handleTypeChange = (type) => {
    const upd = { type }
    if (type === 'radio' || type === 'multi' || type === 'dropdown') {
      upd.options = q.options?.length
        ? normalizeOptions(q.options)
        : [{ label: '', allowInput: false, exclusive: false, score: 0 }, { label: '', allowInput: false, exclusive: false, score: 0 }]
    }
    if (type === 'scale')  { upd.min = 1; upd.max = 10; upd.minLabel = ''; upd.maxLabel = '' }
    if (type === 'matrix') { upd.rows = q.rows?.length ? q.rows : ['项目1']; upd.cols = q.cols?.length ? q.cols : ['无', '轻度', '中度', '重度'] }
    if (type === 'number') { upd.placeholder = q.placeholder || '请输入数字' }
    if (type === 'date')   { upd.placeholder = q.placeholder || '' }
    if (type === 'text')   { upd.placeholder = q.placeholder || '' }
    onUpdate(upd)
  }

  const hasOptions = q.type === 'radio' || q.type === 'multi' || q.type === 'dropdown'

  return (
    <div style={{ border: '1px solid #E0D9CE', borderRadius: 8, background: '#fff', overflow: 'hidden' }}>
      {/* 题目头部 */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '8px 12px', background: '#f9f7f3', borderBottom: collapsed ? 'none' : '1px solid #f0ece4' }}>
        <span style={{ fontWeight: 700, color: '#1E6B50', fontSize: 13, minWidth: 28 }}>Q{i + 1}</span>

        <select value={q.type} onChange={e => handleTypeChange(e.target.value)}
          style={{ border: '1px solid #ddd', borderRadius: 4, padding: '3px 6px', fontSize: 12, background: '#fff' }}>
          {Object.entries(Q_TYPE_LABELS).map(([k, v]) => (
            <option key={k} value={k}>{Q_TYPE_ICONS[k]} {v}</option>
          ))}
        </select>

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
            {scoringEnabled && (
              <label style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap', paddingTop: 8, color: '#2b6cb0' }}>
                <input type="checkbox" checked={!!q.scoreEnabled}
                  onChange={e => onUpdate({ scoreEnabled: e.target.checked })} />
                参与评分
              </label>
            )}
          </div>

          {/* 单选 / 多选 / 下拉 */}
          {hasOptions && (
            <OptionsEditor
              options={normalizeOptions(q.options)}
              onChange={opts => onUpdate({ options: opts })}
              isMulti={q.type === 'multi'}
              scoringEnabled={scoringEnabled && !!q.scoreEnabled}
            />
          )}

          {/* 跳题逻辑（单选/下拉/多选题可设置） */}
          {hasOptions && (
            <JumpLogicEditor
              jumpLogic={q.jumpLogic || []}
              options={normalizeOptions(q.options)}
              allQuestions={allQuestions}
              currentQIndex={i}
              onChange={rules => onUpdate({ jumpLogic: rules })}
            />
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

          {/* 对应健康档案字段（答卷自动导入档案用，一次配置长期生效） */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, borderTop: '1px dashed #E0D9CE', paddingTop: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 12, color: '#2b6cb0', whiteSpace: 'nowrap' }}>🔗 对应健康档案字段</span>
            <select className="form-input" style={{ flex: 1, minWidth: 180, maxWidth: 300 }}
              value={q.archiveField || ''} onChange={e => onUpdate({ archiveField: e.target.value })}>
              <option value="">— 不导入档案 —</option>
              {archiveFields.map(g => (
                <optgroup key={g.group} label={g.group}>
                  {g.fields.map(f => <option key={f.path} value={f.path}>{f.label}</option>)}
                </optgroup>
              ))}
            </select>
            {q.archiveField && <span style={{ fontSize: 11, color: '#22A06B' }}>✓ 答卷将自动写入此字段</span>}
          </div>
        </div>
      )}
    </div>
  )
}

// ── 公共：创建新题目对象 ──────────────────────────────────────────
const QUICK_TYPES = [
  { type: 'radio',    label: '单选' },
  { type: 'multi',    label: '多选' },
  { type: 'dropdown', label: '下拉' },
  { type: 'scale',    label: '量表' },
  { type: 'matrix',   label: '矩阵' },
  { type: 'text',     label: '文本' },
  { type: 'number',   label: '数字' },
  { type: 'date',     label: '日期' },
]

const makeNewQ = (type) => {
  const base = { id: `q${Date.now()}`, type, text: '', required: true, scoreEnabled: false, jumpLogic: [] }
  if (type === 'radio' || type === 'multi' || type === 'dropdown')
    base.options = [{ label: '', allowInput: false, exclusive: false, score: 0 }, { label: '', allowInput: false, exclusive: false, score: 0 }]
  if (type === 'scale')  { base.min = 1; base.max = 10; base.minLabel = ''; base.maxLabel = '' }
  if (type === 'matrix') { base.rows = ['项目1']; base.cols = ['无', '轻度', '中度', '重度'] }
  if (type === 'number' || type === 'text' || type === 'date') base.placeholder = ''
  return base
}

// ── 快捷添加按钮栏（底部） ────────────────────────────────────────
function AddQuestionBar({ onAdd }) {
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', padding: '10px 0' }}>
      <span style={{ fontSize: 12, color: '#8AA89C', marginRight: 4 }}>添加题目：</span>
      {QUICK_TYPES.map(q => (
        <button key={q.type} className="btn btn-sm btn-ghost"
          style={{ fontSize: 12, padding: '4px 10px' }}
          onClick={() => onAdd(makeNewQ(q.type))}>
          {Q_TYPE_ICONS[q.type]} {q.label}
        </button>
      ))}
    </div>
  )
}

// ── 题目间插入条 ──────────────────────────────────────────────────
function InsertBar({ onInsert }) {
  const [expanded, setExpanded] = useState(false)

  if (!expanded) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '2px 0', opacity: 0.6 }}
        onMouseEnter={e => e.currentTarget.style.opacity = 1}
        onMouseLeave={e => e.currentTarget.style.opacity = 0.6}>
        <div style={{ flex: 1, height: 1, background: '#E0D9CE' }} />
        <button
          onClick={() => setExpanded(true)}
          style={{ border: '1px dashed #C5BDB0', background: '#fff', borderRadius: 12, padding: '2px 12px', fontSize: 11, color: '#8AA89C', cursor: 'pointer', whiteSpace: 'nowrap', lineHeight: '18px' }}>
          ＋ 在此插入题目
        </button>
        <div style={{ flex: 1, height: 1, background: '#E0D9CE' }} />
      </div>
    )
  }

  return (
    <div style={{ border: '1px dashed #1E6B50', borderRadius: 8, padding: '8px 12px', background: '#f4faf7' }}>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ fontSize: 12, color: '#1E6B50', marginRight: 4 }}>插入题型：</span>
        {QUICK_TYPES.map(q => (
          <button key={q.type} className="btn btn-sm btn-ghost"
            style={{ fontSize: 12, padding: '4px 10px' }}
            onClick={() => { onInsert(makeNewQ(q.type)); setExpanded(false) }}>
            {Q_TYPE_ICONS[q.type]} {q.label}
          </button>
        ))}
        <button
          style={{ marginLeft: 'auto', border: 'none', background: 'none', color: '#aaa', cursor: 'pointer', fontSize: 16, padding: '0 4px' }}
          onClick={() => setExpanded(false)}>✕</button>
      </div>
    </div>
  )
}

// ── 问卷编辑弹窗 ──────────────────────────────────────────────────
function QuestionnaireModal({ questionnaire, onClose, onSaved }) {
  const toast = useToast()
  const isEdit = !!questionnaire?._id
  const [form, setForm] = useState({
    title:          questionnaire?.title          || '',
    description:    questionnaire?.description    || '',
    questions:      (questionnaire?.questions || []).map(q => ({
      ...q,
      options:   normalizeOptions(q.options),
      jumpLogic: q.jumpLogic || [],
      scoreEnabled: !!q.scoreEnabled,
    })),
    targetType:     questionnaire?.targetType     || 'all',
    deadline:       questionnaire?.deadline       || '',
    scoringEnabled: questionnaire?.scoringEnabled || false,
    scoreRanges:    questionnaire?.scoreRanges    || [],
  })
  const [loading, setLoading] = useState(false)
  const [archiveFields, setArchiveFields] = useState([])
  useEffect(() => { adminAPI.getArchiveFields().then(r => setArchiveFields(r.data || [])).catch(() => {}) }, [])

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const addQ    = (q) => set('questions', [...form.questions, q])
  const insertQ = (afterIndex, q) => {
    const qs = [...form.questions]
    qs.splice(afterIndex, 0, q)
    set('questions', qs)
  }
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
      <div className="modal" style={{ maxWidth: 820, width: '96%', maxHeight: '92vh', display: 'flex', flexDirection: 'column' }}
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
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 160 }}>
                <div style={{ fontSize: 12, color: '#666', marginBottom: 4 }}>推送对象</div>
                <select className="form-input" value={form.targetType} onChange={e => set('targetType', e.target.value)}>
                  <option value="all">全体用户</option>
                  <option value="specific">指定用户（医护端推送时选人）</option>
                </select>
              </div>
              <div style={{ flex: 1, minWidth: 160 }}>
                <div style={{ fontSize: 12, color: '#666', marginBottom: 4 }}>截止日期（可选）</div>
                <input type="date" className="form-input" value={form.deadline}
                  onChange={e => set('deadline', e.target.value)} />
              </div>
              <div style={{ minWidth: 140, display: 'flex', flexDirection: 'column', gap: 4 }}>
                <div style={{ fontSize: 12, color: '#666' }}>评分功能</div>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer', paddingTop: 8 }}>
                  <input type="checkbox" checked={!!form.scoringEnabled}
                    onChange={e => set('scoringEnabled', e.target.checked)} />
                  <span style={{ color: form.scoringEnabled ? '#2b6cb0' : '#666' }}>启用评分自动计算</span>
                </label>
              </div>
            </div>
            {form.scoringEnabled && (
              <div style={{ fontSize: 12, color: '#2b6cb0', background: '#ebf8ff', borderRadius: 6, padding: '6px 10px' }}>
                💡 启用评分后，可在各题目的"可参与评分"选项中设置选项分值，提交时自动汇总总分。
              </div>
            )}
            {form.scoringEnabled && (
              <div style={{ marginTop: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#4A6558' }}>分值段含义配置</span>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() =>
                    set('scoreRanges', [...form.scoreRanges, { minScore: 0, maxScore: 100, label: '', description: '' }])
                  }>＋ 添加分值段</button>
                </div>
                {form.scoreRanges.length === 0 ? (
                  <div style={{ fontSize: 12, color: '#aaa', padding: '8px 0' }}>未配置分值含义，用户提交后只显示分数，不显示解读。</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {form.scoreRanges.map((sr, idx) => (
                      <div key={idx} style={{ display: 'grid', gridTemplateColumns: '80px 80px 1fr 1fr auto', gap: 8, alignItems: 'flex-end', background: '#f9f7f3', padding: 8, borderRadius: 6 }}>
                        <div>
                          {idx === 0 && <div style={{ fontSize: 11, color: '#8AA89C', marginBottom: 4 }}>最低分</div>}
                          <input className="form-input" type="number" value={sr.minScore} placeholder="0"
                            onChange={e => { const r = [...form.scoreRanges]; r[idx] = { ...r[idx], minScore: Number(e.target.value) }; set('scoreRanges', r) }} />
                        </div>
                        <div>
                          {idx === 0 && <div style={{ fontSize: 11, color: '#8AA89C', marginBottom: 4 }}>最高分</div>}
                          <input className="form-input" type="number" value={sr.maxScore} placeholder="100"
                            onChange={e => { const r = [...form.scoreRanges]; r[idx] = { ...r[idx], maxScore: Number(e.target.value) }; set('scoreRanges', r) }} />
                        </div>
                        <div>
                          {idx === 0 && <div style={{ fontSize: 11, color: '#8AA89C', marginBottom: 4 }}>标签（如：健康风险高）</div>}
                          <input className="form-input" value={sr.label} placeholder="标签"
                            onChange={e => { const r = [...form.scoreRanges]; r[idx] = { ...r[idx], label: e.target.value }; set('scoreRanges', r) }} />
                        </div>
                        <div>
                          {idx === 0 && <div style={{ fontSize: 11, color: '#8AA89C', marginBottom: 4 }}>说明（如：建议尽快就医）</div>}
                          <input className="form-input" value={sr.description} placeholder="说明"
                            onChange={e => { const r = [...form.scoreRanges]; r[idx] = { ...r[idx], description: e.target.value }; set('scoreRanges', r) }} />
                        </div>
                        <button type="button" className="btn btn-sm" style={{ background: '#fee', color: '#c00', border: '1px solid #fcc' }}
                          onClick={() => set('scoreRanges', form.scoreRanges.filter((_, i) => i !== idx))}>×</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
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
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {form.questions.map((q, i) => (
                  <React.Fragment key={q.id}>
                    <QuestionCard
                      q={q} i={i} total={form.questions.length}
                      allQuestions={form.questions}
                      onUpdate={upd => updateQ(i, upd)}
                      onRemove={() => removeQ(i)}
                      onMove={dir => moveQ(i, dir)}
                      scoringEnabled={form.scoringEnabled}
                      archiveFields={archiveFields}
                    />
                    <InsertBar onInsert={newQ => insertQ(i + 1, newQ)} />
                  </React.Fragment>
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
    if (typeof a === 'object') {
      if (a.value !== undefined) {
        const inputsStr = Object.entries(a.inputs || {}).map(([k, v]) => `${k}: ${v}`).join('，')
        return a.value + (inputsStr ? `（备注：${inputsStr}）` : '')
      }
      if (a.values !== undefined) {
        const inputsStr = Object.entries(a.inputs || {}).map(([k, v]) => `${k}: ${v}`).join('，')
        return a.values.join('、') + (inputsStr ? `（备注：${inputsStr}）` : '')
      }
      return Object.entries(a).map(([k, v]) => `${k}: ${v}`).join('；')
    }
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
                <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                  {resp.totalScore > 0 && (
                    <span style={{ fontSize: 13, fontWeight: 700, color: '#2b6cb0', background: '#ebf8ff', padding: '2px 8px', borderRadius: 4 }}>
                      得分：{resp.totalScore}
                    </span>
                  )}
                  <span style={{ fontSize: 12, color: '#888' }}>{new Date(resp.submittedAt).toLocaleString('zh-CN')}</span>
                </div>
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
  const [reordering, setReordering] = useState(false)
  const [search, setSearch] = useState('')
  const [pageSize, setPageSize] = useState(10)
  const [page, setPage] = useState(1)

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

  const copy = async (q) => {
    try { await adminAPI.copyQuestionnaire(q._id); toast('✅ 问卷已复制为草稿'); load() }
    catch (err) { toast('❌ ' + err.message) }
  }

  // 上移/下移问卷（调整 sortOrder）
  const moveQuestionnaire = async (idx, dir) => {
    const newList = [...list]
    const j = idx + dir
    if (j < 0 || j >= newList.length) return
    setReordering(true)
    try {
      ;[newList[idx], newList[j]] = [newList[j], newList[idx]]
      setList(newList) // 乐观更新
      const items = newList.map((q, i) => ({ id: q._id, sortOrder: i + 1 }))
      await adminAPI.reorderQuestionnaires(items)
    } catch (err) {
      toast('❌ 排序失败：' + err.message)
      load() // 失败时重新加载
    } finally { setReordering(false) }
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

  {!loading && (
    <div style={{ display: 'flex', gap: 8, marginBottom: 12, alignItems: 'center' }}>
      <input style={{ flex: 1, maxWidth: 280, padding: '6px 12px', borderRadius: 8, border: '1.5px solid var(--border)', fontSize: 13 }}
        placeholder="搜索问卷标题..." value={search}
        onChange={e => { setSearch(e.target.value); setPage(1) }} />
      <select style={{ padding: '6px 10px', borderRadius: 8, border: '1.5px solid var(--border)', fontSize: 13 }}
        value={pageSize} onChange={e => { setPageSize(Number(e.target.value)); setPage(1) }}>
        <option value={10}>10条/页</option>
        <option value={20}>20条/页</option>
        <option value={30}>30条/页</option>
      </select>
      <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>共 {list.filter(q => !search || q.title?.includes(search)).length} 条</span>
    </div>
  )}
      {loading ? <div className="loading">加载中...</div> : (() => {
        const filteredQ = list.filter(q => !search || q.title?.includes(search))
        const totalQPages = Math.ceil(filteredQ.length / pageSize)
        const pagedQ = filteredQ.slice((page - 1) * pageSize, page * pageSize)
        return (<>
        <div className="card" style={{ padding: 0 }}>
          <table className="table">
            <thead>
              <tr>
                {!search && <th style={{ width: 56 }}>排序</th>}
                <th>问卷标题</th>
                <th>题数</th>
                <th>评分</th>
                <th>推送对象</th>
                <th>截止日期</th>
                <th>回答数</th>
                <th>状态</th>
                <th>创建时间</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {pagedQ.length === 0 && (
                <tr><td colSpan={!search ? 10 : 9} style={{ textAlign: 'center', color: '#888', padding: 32 }}>暂无问卷，点击「新建问卷」开始创建</td></tr>
              )}
              {pagedQ.map((q) => {
                const idx = list.findIndex(item => item._id === q._id)
                const meta = STATUS_META[q.status] || STATUS_META.draft
                return (
                  <tr key={q._id}>
                    {!search && <td>
                      <div style={{ display: 'flex', gap: 2, justifyContent: 'center' }}>
                        <button onClick={() => moveQuestionnaire(idx, -1)} disabled={idx === 0 || reordering}
                          style={{ border: 'none', background: 'none', cursor: idx === 0 ? 'default' : 'pointer', color: idx === 0 ? '#ddd' : '#888', fontSize: 13, padding: '2px 3px' }}>↑</button>
                        <button onClick={() => moveQuestionnaire(idx, 1)} disabled={idx === list.length - 1 || reordering}
                          style={{ border: 'none', background: 'none', cursor: idx === list.length - 1 ? 'default' : 'pointer', color: idx === list.length - 1 ? '#ddd' : '#888', fontSize: 13, padding: '2px 3px' }}>↓</button>
                      </div>
                    </td>}
                    <td>
                      <div style={{ fontWeight: 600 }}>{q.title}</div>
                      {q.description && <div style={{ fontSize: 12, color: '#888' }}>{q.description.slice(0, 40)}{q.description.length > 40 ? '...' : ''}</div>}
                    </td>
                    <td>{q.questions?.length || 0} 题</td>
                    <td>{q.scoringEnabled ? <span style={{ color: '#2b6cb0', fontSize: 12 }}>✓ 启用</span> : <span style={{ color: '#ccc', fontSize: 12 }}>—</span>}</td>
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
                        <button className="btn btn-sm btn-ghost" style={{ color: '#666' }} onClick={() => copy(q)}>复制</button>
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
        {totalQPages > 1 && (
          <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 12 }}>
            <button className="btn btn-secondary btn-sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>上一页</button>
            <span style={{ lineHeight: '32px', fontSize: 13, color: 'var(--text-muted)' }}>第 {page} / {totalQPages} 页</span>
            <button className="btn btn-secondary btn-sm" disabled={page >= totalQPages} onClick={() => setPage(p => p + 1)}>下一页</button>
          </div>
        )}
        </>)
      })()}

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
