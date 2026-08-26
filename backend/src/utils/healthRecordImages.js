function isEmbeddedImage(value) {
  return typeof value === 'string' && /^data:image\/[a-z0-9.+-]+;base64,/i.test(value);
}

function withoutLegacyImageExtra(extra) {
  if (!extra || typeof extra !== 'object' || Array.isArray(extra)) return extra || {};
  const sanitized = { ...extra };
  delete sanitized.imageUrl;
  return sanitized;
}

function incomingImagePayloads({ imageUrl = '', images = [], extra = {} } = {}) {
  const candidates = [imageUrl, ...(Array.isArray(images) ? images.map(item => item?.data) : []), extra?.imageUrl]
    .filter(isEmbeddedImage);
  return [...new Set(candidates)];
}

function withSafeHealthRecordImages(record, signStoredUrl) {
  const obj = record.toObject ? record.toObject() : { ...record };
  const legacyExtraImage = obj.extra?.imageUrl;
  const storedUrls = obj.imageUrls?.length
    ? obj.imageUrls
    : (obj.imageUrl ? [obj.imageUrl] : (!isEmbeddedImage(legacyExtraImage) && legacyExtraImage ? [legacyExtraImage] : []));
  obj.imageUrls = storedUrls.map(url => signStoredUrl(url));
  obj.imageUrl = obj.imageUrls[0] || '';
  obj.extra = withoutLegacyImageExtra(obj.extra);
  return obj;
}

module.exports = {
  incomingImagePayloads,
  isEmbeddedImage,
  withSafeHealthRecordImages,
  withoutLegacyImageExtra,
};
