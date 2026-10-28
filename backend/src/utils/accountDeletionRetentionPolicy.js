// User confirmed on 2026-10-28 that Order/Payment/Refund are accounting vouchers.
// This policy defines the minimum period; it is not a review of individual originals
// and never substitutes an administrator identity or authorizes automatic destruction.
const POLICY_VERSION='accounting-voucher-20261028-v1';
const LEGAL_BASIS='会计档案管理办法第十四至十九条及附表1（会计凭证）';
function fail(code){throw Object.assign(new Error(code),{code});}
function voucherRetention(accountingYear) {
 if(!Number.isInteger(accountingYear)||accountingYear<1900||accountingYear>9998-31)fail('ACCOUNTING_YEAR_REQUIRED');
 // Calendar accounting year ends on Dec 31, Asia/Shanghai. Preserve the full
 // thirty years from the following Jan 1, regardless of the deletion-request date.
 const start=new Date(Date.UTC(accountingYear+1,0,1)-8*60*60*1000);
 const minimumRetainUntil=new Date(Date.UTC(accountingYear+31,0,1)-8*60*60*1000);
 return {policyVersion:POLICY_VERSION,category:'accounting_voucher',accountingYear,
  minimumYears:30,retentionStartsAt:start,minimumRetainUntil,legalBasis:LEGAL_BASIS,
  expiryAction:'appraisal_required',automaticDestruction:false};
}
function validateVoucherRetention(classification,now=new Date()) {
 if(!Number.isFinite(new Date(now).getTime()))fail('RETENTION_CLOCK_INVALID');
 const policy=voucherRetention(classification.accountingYear);
 const currentChinaYear=new Date(new Date(now).getTime()+8*60*60*1000).getUTCFullYear();
 if(policy.accountingYear>currentChinaYear)fail('ACCOUNTING_YEAR_IN_FUTURE');
 const until=new Date(classification.retainUntil);
 if(!Number.isFinite(until.getTime())||until<policy.minimumRetainUntil)fail('ACCOUNTING_VOUCHER_RETENTION_TOO_SHORT');
 return policy;
}
module.exports={POLICY_VERSION,LEGAL_BASIS,voucherRetention,validateVoucherRetention};
