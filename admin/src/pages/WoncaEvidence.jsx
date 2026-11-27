import React from 'react';

export const cohortLabel = { existing: '既往在管', new: '新进入管理', unknown: '待核实' };
const missing = '无可核实记录';
const date = (value) =>
  value ? new Date(value).toLocaleDateString('zh-CN', { timeZone: 'Asia/Shanghai' }) : missing;
export const day = (value) => new Date(+new Date(value) + 28800000).toISOString().slice(0, 10);
const planTypes = {
  health_reshape: '健康重塑',
  young_state: '年轻态',
  chronic_stable: '慢病稳定',
  health_prevention: '健康预防',
};
function sections(row) {
  const e = row.snapshot.evidence;
  return [
    ...(e.pendingDocuments ? [['顾问待查看资料', ['资料编号','资料类型','待查看原因'],e.pendingDocuments.map(d=>[d.key,d.category,d.reason])]] : []),
    ...(e.screeningRows ? [['年度专项筛查核对', ['资料编号','筛查项目','处理记录','管理方向'],e.screeningRows.map(d=>[d.report,d.item,d.state,d.direction || '—'])]] : []),
    [
      '年度方案',
      [
        '方案',
        '方案类型',
        '审核',
        '推送记录',
        '待沟通议题数',
        '来年体检重点',
        '已确认同次就诊组',
        '有可追溯来源',
      ],
      e.plans.map((p) => [
        p.key,
        planTypes[p.type] || p.type,
        p.state,
        date(p.pushed),
        p.consensus ?? missing,
        p.nextExam,
        p.merged ?? missing,
        p.traceable ? '是' : '未见记录',
      ]),
    ],
    [
      '年度来源与处置',
      ['来源编号', '来源', '处置记录', '决定去向', '实际方案位置'],
      e.items.map((i) => [i.key, i.source, i.state, i.direction, i.position]),
    ],
    [
      '资料与人工处理',
      ['资料编号', '资料类型', '专员审核', '顾问逐份查看', '解读确认', '用药审核通过／已关联', '专病归档'],
      e.docs.map((d) => [
        d.key,
        d.category,
        d.manager,
        date(d.viewed),
        date(d.interpreted),
        d.medication ?? '未见关联',
        d.filed ? '已归档' : missing,
      ]),
    ],
    [
      '报告建议稿',
      ['草稿编号', '资料编号', '用途', '生成状态', '处置状态'],
      e.drafts.map((d) => [d.key, d.report, d.purpose, d.generation, d.state]),
    ],
    [
      '年度关联随访',
      ['事项编号', '方案', '到期日', '执行状态', '跟进记录数', '其中共识沟通记录', '完成日期'],
      e.follow.map((f) => [
        f.key,
        f.plan,
        f.due || missing,
        f.state + (f.overdue ? '（逾期）' : ''),
        f.contacts,
        f.communications,
        date(f.completedAt),
      ]),
    ],
  ];
}

export function EvidenceDetails({ row, canGroup, onGroup }) {
  const e = row.snapshot.evidence;
  return (
    <div className="wonca-evidence">
      <p>
        系统建档 {date(e.registered)}　研究纳入 {date(row.enrolledAt)}　分组{' '}
        {cohortLabel[row.cohort] || '待核实'}
      </p>
      {canGroup && row.status === 'enrolled' && (
        <label>
          核实研究分组　
          <select
            defaultValue=""
            onChange={(event) => {
              const value = event.target.value;
              event.target.value = '';
              if (
                value &&
                value !== row.cohort &&
                window.confirm('确认将该参与者登记为“' + cohortLabel[value] + '”？')
              )
                onGroup(row._id, value, row.cohort);
            }}
          >
            <option value="">请选择</option>
            <option value="new">新进入管理</option>
            <option value="existing">既往在管</option>
          </select>
        </label>
      )}
      <p>
        筛查核对确认 {date(e.screening)}　顾问资料就绪确认 {date(e.ready)}
      </p>
      <p>
        五年分析提示{e.promptEvidence ? '已按相应年度已审核来源核对' : '缺少可还原的已审核来源'}
        。共识计数只代表待沟通议题。推送记录无法反推出曾被拦截的次数。
      </p>
      {sections(row).map(([title, headers, rows]) => (
        <details key={title} open={title === '年度方案' || undefined}>
          <summary>
            {title}（{rows.length}）
          </summary>
          {rows.length ? (
            <div className="wonca-scroll">
              <table>
                <thead>
                  <tr>
                    {headers.map((h) => (
                      <th key={h}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={i}>
                      {r.map((v, j) => (
                        <td key={j}>{v}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p>未找到对应记录</p>
          )}
        </details>
      ))}
    </div>
  );
}

export function exportEvidence(rows, year, observedAt) {
  const csv = [['研究编号', '参与者编码', '年度', '统计时点', '分组', '记录类别', '记录编号', '字段', '值']];
  for (const row of rows) {
    const base = [
      row.researchNumber,
      row.participantCode,
      year,
      observedAt,
      cohortLabel[row.cohort] || '待核实',
    ];
    const e = row.snapshot.evidence;
    for (const [field, value] of [
      ['系统建档', date(e.registered)],
      ['研究纳入', date(row.enrolledAt)],
      ['研究状态', { enrolled: '进行中', locked: '已锁定', withdrawn: '已撤回' }[row.status]],
      ['筛查核对确认', date(e.screening)],
      ['资料就绪确认', date(e.ready)],
      ['方案数', e.plans.length],
      ['顾问资料待查看', e.pendingViews ?? missing],
      ['五年分析来源可核对', e.promptEvidence ? '是' : '缺少可还原来源'],
    ])
      csv.push([...base, '参与者', '', field, value]);
    for (const [title, headers, records] of sections(row))
      for (const record of records)
        headers.slice(1).forEach((field, i) => csv.push([...base, title, record[0], field, record[i + 1]]));
  }
  const escape = (value) =>
    '"' +
    String(value ?? '')
      .replace(/^[=+@-]/, "'$&")
      .replaceAll('"', '""') +
    '"';
  const url = URL.createObjectURL(
    new Blob(['\uFEFF' + csv.map((r) => r.map(escape).join(',')).join('\r\n')], {
      type: 'text/csv;charset=utf-8',
    })
  );
  const a = document.createElement('a');
  a.href = url;
  a.download = 'WONCA-' + year + '-截至' + day(observedAt) + '.csv';
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
