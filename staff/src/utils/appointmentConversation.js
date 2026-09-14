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
  const customerText = customerMessages.map(message => message.content || message.text || '').filter(Boolean).join('；')
  const aiText = messages.filter(message => message.isAI && !message.recalled)
    .map(message => message.content || message.text || '').filter(Boolean).join('；')
  const text = [customerText, aiText].filter(Boolean).join('；')
  let start = ''
  let end = ''
  let timeStart = ''
  let timeEnd = ''
  const explicitRange = text.match(/(?:(\d{4})[年/-])?(\d{1,2})[月/-](\d{1,2})日?\s*[-到至~—－]\s*(?:(\d{4})[年/-])?(?:(\d{1,2})[月/-])?(\d{1,2})日?/)
  const explicitDate = text.match(/(?:(\d{4})[年/-])?(\d{1,2})[月/-](\d{1,2})日?/)
  const weekRange = text.match(/(?:周|星期)([一二三四五六日天])\s*[-到至~—－]\s*(?:周|星期)?([一二三四五六日天])/)
  const weekday = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 日: 7, 天: 7 }
  const calendarDate = (year, month, day) => dateInput(new Date(Number(year), Number(month) - 1, Number(day)))
  if (explicitRange) {
    const startYear = explicitRange[1] || now.getFullYear()
    const endYear = explicitRange[4] || startYear
    const endMonth = explicitRange[5] || explicitRange[2]
    start = calendarDate(startYear, explicitRange[2], explicitRange[3])
    end = calendarDate(endYear, endMonth, explicitRange[6])
  } else if (explicitDate) {
    start = calendarDate(explicitDate[1] || now.getFullYear(), explicitDate[2], explicitDate[3])
    end = start
  } else if (weekRange) {
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
  } else if (/明天|后天/.test(text)) {
    const date = new Date(now)
    date.setDate(date.getDate() + (/后天/.test(text) ? 2 : 1))
    start = dateInput(date); end = start
  }
  const normalizedTimeText = text.replace(/(\d{1,2})点(?!\d)/g, '$1:00')
  const timeRange = normalizedTimeText.match(/(?:(上午|下午|晚上|中午)\s*)?(\d{1,2})(?:[:：点时](\d{1,2})分?)?\s*[-到至~—－]\s*(?:(上午|下午|晚上|中午)\s*)?(\d{1,2})(?:[:：点时](\d{1,2})分?)?/)
  if (timeRange) {
    const normalizeHour = (period, hour) => {
      let value = Number(hour)
      if ((period === '下午' || period === '晚上') && value < 12) value += 12
      if (period === '中午' && value < 11) value += 12
      return String(value).padStart(2, '0')
    }
    const endPeriod = timeRange[4] || timeRange[1]
    timeStart = `${normalizeHour(timeRange[1], timeRange[2])}:${String(timeRange[3] || 0).padStart(2, '0')}`
    timeEnd = `${normalizeHour(endPeriod, timeRange[5])}:${String(timeRange[6] || 0).padStart(2, '0')}`
  }
  const meaningfulCustomerText = customerText.split('；')
    .map(value => value.replace(/^(你好|您好)[，,。\s]*/g, '').trim())
    .filter(value => value && !/^(好的|是的|对|可以|谢谢)[，,。！!\s]*$/.test(value))
    .join('；')
  const field = labels => aiText.match(new RegExp(`(?:${labels})[：:]\\s*([^；\\n]+)`))?.[1]?.trim() || ''
  const aiServiceContent = field('服务内容|约诊需求|就医安排')
  const aiCustomerNeed = field('客户诉求|客户需求|就医诉求|主诉')
  const request = meaningfulCustomerText || aiCustomerNeed || aiServiceContent
  return {
    preferredDateStart: start,
    preferredDateEnd: end,
    preferredTimeStart: timeStart,
    preferredTimeEnd: timeEnd,
    serviceContent: aiServiceContent || request,
    customerNeed: aiCustomerNeed || request,
  }
}
