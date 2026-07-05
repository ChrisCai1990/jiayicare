// ── 中国大陆18位身份证号解析 ────────────────────────────────────────
// 第7-14位：出生日期(YYYYMMDD)；第17位：奇数男/偶数女；第18位：校验码(0-9或X)

const CHECK_WEIGHTS = [7, 9, 10, 5, 8, 4, 2, 1, 6, 3, 7, 9, 10, 5, 8, 4, 2];
const CHECK_CODES = ['1', '0', 'X', '9', '8', '7', '6', '5', '4', '3', '2'];

function isValidIdCard(id) {
  if (typeof id !== 'string' || !/^\d{17}[\dXx]$/.test(id)) return false;
  const digits = id.slice(0, 17).split('').map(Number);
  const sum = digits.reduce((acc, d, i) => acc + d * CHECK_WEIGHTS[i], 0);
  const expected = CHECK_CODES[sum % 11];
  return id[17].toUpperCase() === expected;
}

// 返回 { gender: '男'|'女', birthDate: 'YYYY-MM-DD', age: number } 或 null（无效身份证号）
function parseIdCard(id) {
  if (!isValidIdCard(id)) return null;
  const year = id.slice(6, 10);
  const month = id.slice(10, 12);
  const day = id.slice(12, 14);
  const birthDate = `${year}-${month}-${day}`;
  const genderDigit = Number(id[16]);
  const gender = genderDigit % 2 === 1 ? '男' : '女';

  const today = new Date();
  const birth = new Date(Number(year), Number(month) - 1, Number(day));
  let age = today.getFullYear() - birth.getFullYear();
  const hasHadBirthdayThisYear = (today.getMonth() > birth.getMonth())
    || (today.getMonth() === birth.getMonth() && today.getDate() >= birth.getDate());
  if (!hasHadBirthdayThisYear) age -= 1;

  return { gender, birthDate, age };
}

module.exports = { isValidIdCard, parseIdCard };
