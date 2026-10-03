const ISSUE_PATTERNS = [
  [/双肺(?:多发|散在)?(?:微小|小)?结节|肺(?:部|内)?(?:磨玻璃)?(?:微小|小)?结节|磨玻璃结节/gi, '肺结节'],
  [/甲状腺(?:多发|单发)?结节/gi, '甲状腺结节'],
  [/乳腺(?:多发|单发)?结节/gi, '乳腺结节'],
  [/颈动脉(?:粥样硬化)?斑块/gi, '颈动脉斑块'],
  [/冠状动脉(?:钙化|斑块)/gi, '冠状动脉异常'],
  [/结肠(?:多发)?息肉|肠息肉/gi, '结肠息肉'],
  [/胃(?:多发)?息肉/gi, '胃息肉'],
  [/子宫内膜息肉/gi, '子宫内膜息肉'],
  [/慢性非萎缩性胃炎(?:伴糜烂)?|慢性萎缩性胃炎(?:伴糜烂)?|慢性胃炎(?:伴糜烂)?|糜烂性胃炎/gi, match => match],
  [/脂肪肝/gi, '脂肪肝'],
  [/高血压/gi, '高血压'],
  [/糖尿病/gi, '糖尿病'],
  [/血糖(?:偏高|升高|异常)/gi, '血糖异常'],
  [/血脂(?:偏高|升高|异常)/gi, '血脂异常'],
  [/肾功能(?:减退|下降|异常)/gi, '肾功能异常'],
  [/骨质疏松|骨量减少/gi, match => match],
]

export function specialtyIssueSuggestions(text) {
  const source = String(text || '').slice(0, 5000)
  const found = []
  for (const [pattern, value] of ISSUE_PATTERNS) {
    for (const match of source.matchAll(pattern)) {
      const sentence = source.slice(Math.max(0, source.lastIndexOf('；', match.index) + 1), match.index)
      if (/(?:未见|未发现|未提示|排除|无明显|没有).{0,12}$/.test(sentence)) continue
      found.push({ index: match.index, title: typeof value === 'function' ? value(match[0]) : value })
    }
  }
  return [...new Map(found.sort((a, b) => a.index - b.index).map(row => [row.title, row.title])).values()].slice(0, 8)
}
