import React, { useState } from 'react'
import { AI_RULES, AI_COMMON_NOTE } from '../config/aiRules'

// AI 规则说明：放在各 AI 场景界面，展示 AI 的依据/规则/参考价值，让服务团队和客户放心。
// 默认收起为一行提示，点击展开看详细规则。scene 对应 aiRules.js 里的 key。
export default function AiRuleHint({ scene, style }) {
  const [open, setOpen] = useState(false)
  const rule = AI_RULES[scene]
  if (!rule) return null

  return (
    <div style={{
      border: '1px solid #CDE9DC', background: '#F4FBF7', borderRadius: 8,
      fontSize: 12.5, color: '#2C6E52', marginBottom: 12, overflow: 'hidden', ...style,
    }}>
      <div
        onClick={() => setOpen(o => !o)}
        style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px', cursor: 'pointer', userSelect: 'none' }}
      >
        <span>🤖</span>
        <span style={{ fontWeight: 600 }}>{rule.title}是怎么生成的？</span>
        <span style={{ marginLeft: 'auto', fontSize: 11, opacity: 0.7 }}>{open ? '收起 ▲' : '展开了解 ▼'}</span>
      </div>
      {open && (
        <div style={{ padding: '0 12px 12px', lineHeight: 1.75 }}>
          <div><b>依据数据：</b>{rule.basis}</div>
          <div><b>生成规则：</b>{rule.rule}</div>
          <div style={{ color: '#8A6D3B', marginTop: 4 }}><b>参考说明：</b>{rule.note}</div>
          <div style={{ marginTop: 6, paddingTop: 6, borderTop: '1px dashed #CDE9DC', color: '#888', fontSize: 11.5 }}>
            {AI_COMMON_NOTE}
          </div>
        </div>
      )}
    </div>
  )
}
