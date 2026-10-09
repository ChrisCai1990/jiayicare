const KEY = 'ibd';
const REGIONS = ['长三角', '珠三角'];
const PRICE = 2980;
const START_DELAY_DAYS = 7;
const INCLUDED_ESCORTS = 2;

function isIbdProduct(product) {
  return product?.specialtyTerms?.key === KEY;
}

function isIbdOrder(order) {
  return order?.specialtyTermsSnapshot?.key === KEY;
}

function productTerms() {
  return { key: KEY, startDelayDays: START_DELAY_DAYS, durationMonths: 12,
    includedEscorts: INCLUDED_ESCORTS, regions: REGIONS };
}

function validatePublishedProduct(product) {
  if (product?.category !== '专病管理' || !/IBD|炎症性肠病/i.test(String(product.name || ''))) return null;
  const terms = product.specialtyTerms || {};
  if (Number(product.originalPrice) !== PRICE || product.servicePrices?.length || product.skus?.length
    || Object.values(product.memberPrices || {}).some(value => Number(value) > 0))
    return 'IBD 年度商品须按已确认的 2980 元单一价格上架';
  if (terms.key !== KEY || Number(terms.startDelayDays) !== START_DELAY_DAYS
    || Number(terms.durationMonths) !== 12 || Number(terms.includedEscorts) !== INCLUDED_ESCORTS
    || REGIONS.some(region => !terms.regions?.includes(region)))
    return '请先配置 IBD 服务期、2 次陪诊及长三角和珠三角范围';
  return null;
}

function periodFromPayment(paidAt, terms) {
  if (!paidAt || !terms || terms.key !== KEY) return null;
  const payment = new Date(paidAt);
  if (Number.isNaN(payment.getTime())) return null;
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Shanghai',
    year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(payment).map(part => [part.type, part.value]));
  const start = new Date(Date.UTC(Number(parts.year), Number(parts.month) - 1,
    Number(parts.day) + Number(terms.startDelayDays || START_DELAY_DAYS), -8));
  const end = new Date(start);
  end.setUTCMonth(end.getUTCMonth() + Number(terms.durationMonths || 12));
  return { start, end };
}

function ensurePeriod(order) {
  if (!isIbdOrder(order) || !order.paidAt || order.specialtyService?.startsAt) return false;
  const period = periodFromPayment(order.paidAt, order.specialtyTermsSnapshot);
  if (!period) return false;
  order.specialtyService = {
    key: KEY, startsAt: period.start, endsAt: period.end,
    includedEscorts: Number(order.specialtyTermsSnapshot.includedEscorts || INCLUDED_ESCORTS),
    usedEscorts: 0, escortRecords: [],
  };
  return true;
}

module.exports = { KEY, REGIONS, PRICE, productTerms, isIbdProduct, isIbdOrder,
  validatePublishedProduct, periodFromPayment, ensurePeriod };
