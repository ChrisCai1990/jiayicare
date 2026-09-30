// Shared with the mini program. Display only; the server owns quotes and payment.
const nonnegative = value => Number.isFinite(Number(value)) ? Math.max(0, Number(value)) : 0;
const cents = value => Math.round(nonnegative(value) * 100);
function policyLimit(type, value, amount) {
  if (type === 'percentage') return amount * Math.min(100, nonnegative(value)) / 100;
  if (type === 'fixedAmount') return nonnegative(value);
  return amount;
}
function corporateProductEligible(policy, product, rule) {
  const mode = rule?.mode || 'inherit';
  if (mode === 'disabled') return false;
  if (mode !== 'inherit') return true;
  if (policy?.eligibleCategories?.length && !policy.eligibleCategories.includes(product?.category || '')) return false;
  return !policy?.eligibleProductIds?.length || policy.eligibleProductIds.map(String).includes(String(product?.id || product?._id || product?.productId || ''));
}
function productCap(rule, amount) {
  if (rule?.mode === 'disabled') return 0;
  if (!rule?.mode || ['inherit', 'unlimited'].includes(rule.mode)) return amount * .2;
  return Math.min(amount, policyLimit(rule.mode, rule.value, amount));
}
function enterpriseEligible(healthFund, amount, product) {
  const enterprise = healthFund?.enterprise;
  if (!enterprise?.bound) return true;
  if (!enterprise.active) return false;
  const rule = enterprise.rule;
  return !rule?.enabled || (amount >= nonnegative(rule.minOrderAmount)
    && (!rule.eligibleCategories?.length || rule.eligibleCategories.includes(product?.category || '')));
}
function usable(healthFund, amount) {
  // Older/cached responses without a verified eligibility flag cannot authorize an estimate.
  return healthFund?.eligible === true && amount >= nonnegative(healthFund?.policy?.minOrderAmount);
}
function maxFundDeduction(healthFund, amount, product) {
  const total = cents(amount) / 100;
  if (!usable(healthFund, total)) return 0;
  const cap = Math.floor(productCap(product?.healthFundDeduction, total) * 100 + 1e-7);
  const personal = Math.min(cents(healthFund.personal), cap);
  const eligible = corporateProductEligible(healthFund.policy, product, product?.healthFundDeduction) && enterpriseEligible(healthFund, total, product);
  const corporate = eligible ? Math.min(cents(healthFund.corporate), cap-personal) : 0;
  return Math.min(cents(healthFund.total ?? (nonnegative(healthFund.personal)+nonnegative(healthFund.corporate))), personal+corporate) / 100;
}
function maxGroupFundDeduction(healthFund, amount, products) {
  const total = cents(amount), prices = products.map(p=>cents(p.price)), gross=prices.reduce((a,b)=>a+b,0);
  if (!usable(healthFund,total/100)||!gross||total>gross||!products.length) return 0;
  // Split the coupon in cents with the same largest-remainder tie order as checkout.
  const discount=gross-total;
  const portions=prices.map(price=>Math.floor(discount*price/gross));
  let left=discount-portions.reduce((a,b)=>a+b,0);
  const ranks=prices.map((price,index)=>({index,remainder:discount*price%gross})).sort((a,b)=>b.remainder-a.remainder||a.index-b.index);
  for(const {index} of ranks) if(left&&portions[index]<prices[index]){portions[index]++;left--;}
  const cap=products.reduce((sum,p,index)=>{
    const current=p.fundProduct;
    // Push snapshots do not contain current product limits; wait for verified metadata.
    if(!current || !corporateProductEligible(healthFund.policy,current,current.healthFundDeduction)||!enterpriseEligible(healthFund,total/100,current))return sum;
    return sum+Math.floor(productCap(current.healthFundDeduction,(prices[index]-portions[index])/100)*100+1e-7);
  },0);
  return Math.min(cap,cents(healthFund.personal)+cents(healthFund.corporate),cents(healthFund.total??(nonnegative(healthFund.personal)+nonnegative(healthFund.corporate))))/100;
}
module.exports={policyLimit,corporateProductEligible,maxFundDeduction,maxGroupFundDeduction};
