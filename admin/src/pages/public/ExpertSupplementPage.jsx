import React, { useState } from 'react'
import { useParams } from 'react-router-dom'
import ExpertQualificationsEditor from '../../components/ExpertQualificationsEditor'
export default function ExpertSupplementPage() {
  const { token } = useParams()
  const [message, setMessage] = useState('')
  return <main style={{ padding: '28px 12px', background: '#F5F8F6', minHeight: '100vh' }}><div style={{ maxWidth: 760, margin: 'auto', padding: 24, background: 'white', borderRadius: 14 }}>
    <h1>专家资料补充</h1>
    <p>可分次补充学历、服务语言和资质证书。资料仅用于合作评估和资质核验，不公开展示证件。</p>
    <p>请保存此个人链接，30天内可再次进入。仅供本人使用，请勿转发到群内；失效后可联系专科合伙人重新获取。</p>
    <button onClick={async () => { try { await navigator.clipboard.writeText(window.location.href); setMessage('个人补充链接已复制') } catch { setMessage('请复制浏览器地址栏中的个人链接') } }}>复制个人补充链接</button>
    <p role="status">{message}</p>
    <ExpertQualificationsEditor token={token}/>
  </div></main>
}
