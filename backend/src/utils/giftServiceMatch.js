// Product names are snapshots in GiftRecord. Keep the legacy broad gift readable,
// while new catalog gifts can only fund their corresponding service workflow.
function giftCoversMedicalService(giftName, serviceName) {
  const gift = String(giftName || '').trim();
  const service = String(serviceName || '').trim();
  if (!gift || !service) return false;
  if (gift === '就医协助服务' || gift === service) return true;
  if (/医疗代诊|代诊/.test(gift)) return service === '医疗代诊服务';
  if (/专家约诊|约诊/.test(gift)) return service === '专家约诊服务';
  if (/代配营养素/.test(gift)) return service === '代配营养素服务';
  if (/代配药|代取药/.test(gift)) return service === '代配药服务';
  if (/医务代办|代办/.test(gift)) return ['代配药服务', '代配营养素服务'].includes(service);
  if (/陪同检查|陪检/.test(gift)) return service === '陪同检查服务';
  if (/陪同治疗/.test(gift)) return service === '陪同治疗服务';
  if (/就医陪同|陪同就医|陪诊/.test(gift)) return ['陪同就医服务', '陪同看诊服务'].includes(service);
  return false;
}

module.exports = { giftCoversMedicalService };
