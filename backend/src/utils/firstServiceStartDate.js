function firstServiceStartDateUpdate(existing, incoming) {
  if (incoming === undefined) return { write: false };
  const current = String(existing || '');
  if (current) {
    if (incoming !== current) throw Object.assign(new Error('首次服务开始日期已记录，后续只能修改服务到期日期'), { statusCode: 409 });
    return { write: false };
  }
  if (incoming === '' || incoming === null) return { write: false };
  if (typeof incoming !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(incoming)
    || Number.isNaN(new Date(`${incoming}T00:00:00Z`).getTime())
    || new Date(`${incoming}T00:00:00Z`).toISOString().slice(0, 10) !== incoming) {
    throw Object.assign(new Error('首次服务开始日期格式无效'), { statusCode: 400 });
  }
  return { write: true, value: incoming };
}

module.exports = { firstServiceStartDateUpdate };
