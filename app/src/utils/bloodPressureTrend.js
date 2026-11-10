export function bloodPressureArm(record) {
  const text = String(record?.extra?.arm || record?.note || '');
  if (/左[臂手]/.test(text)) return '左臂';
  if (/右[臂手]/.test(text)) return '右臂';
  return '未标注';
}
