const pad2 = (value) => String(value).padStart(2, '0');

const parseDate = (value) => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

export const formatChineseDate = (value, includeYear = true) => {
  const date = parseDate(value);
  if (!date) return '';
  const prefix = includeYear ? `${date.getFullYear()}年` : '';
  return `${prefix}${date.getMonth() + 1}月${date.getDate()}日`;
};

export const formatChineseDateTime = (value, includeYear = true) => {
  const date = parseDate(value);
  if (!date) return '';
  return `${formatChineseDate(date, includeYear)} ${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
};
