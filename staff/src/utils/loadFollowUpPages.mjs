// Orders are merged with live supervisor/executor progress before display.
// Retrieve every server page first; a failed later page must not look complete.
export async function loadFollowUpPages(fetchPage, params) {
  const rows = new Map()
  for (let page = 1; ; page++) {
    const response = await fetchPage({ ...params, page, limit: 100 })
    const data = response?.data
    if (!Array.isArray(data?.followUps) || !Number.isFinite(data.total)) throw new Error('预约列表返回异常，请重试')
    for (const row of data.followUps) rows.set(String(row._id), row)
    const actualPage = data.page || page, pageSize = data.limit || 100
    if (actualPage < page || actualPage * pageSize >= data.total) return [...rows.values()]
    if (!data.followUps.length) throw new Error('预约列表未完整加载，请重试')
  }
}
