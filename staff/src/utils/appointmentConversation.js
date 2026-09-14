const dateInput = date => {
  const shifted = new Date(date.getTime() - date.getTimezoneOffset() * 60000)
  return shifted.toISOString().slice(0, 10)
}

const startOfWeek = date => {
  const result = new Date(date)
  const day = result.getDay() || 7
  result.setDate(result.getDate() - day + 1)
  return result
}

export function inferAppointmentConversation(messages = [], now = new Date()) {
  const customerMessages = messages.filter(message => message.type === 'user' && !message.recalled)
  const text = customerMessages.map(message => message.content || message.text || '').filter(Boolean).join('；')
  let start = ''
  let end = ''
  const weekRange = text.match(/(?:周|星期)([一二三四五六日天])\s*[-到至~—－]\s*(?:周|星期)?([一二三四五六日天])/)
  const weekday = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 日: 7, 天: 7 }
  if (weekRange) {
    const base = startOfWeek(now)
    const first = new Date(base); first.setDate(base.getDate() + weekday[weekRange[1]] - 1)
    const last = new Date(base); last.setDate(base.getDate() + weekday[weekRange[2]] - 1)
    start = dateInput(first); end = dateInput(last)
  } else if (/下周/.test(text)) {
    const first = startOfWeek(now); first.setDate(first.getDate() + 7)
    const last = new Date(first); last.setDate(last.getDate() + 6)
    start = dateInput(first); end = dateInput(last)
  } else if (/本周|这周/.test(text)) {
    const first = new Date(now); const last = startOfWeek(now); last.setDate(last.getDate() + 6)
    start = dateInput(first); end = dateInput(last)
  }
  const request = text.replace(/^(你好|您好|好的|是的)[，,。\s]*/g, '').trim()
  return { preferredDateStart: start, preferredDateEnd: end, serviceContent: request, customerNeed: request }
}
