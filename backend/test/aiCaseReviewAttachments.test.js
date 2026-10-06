const test = require('node:test');
const assert = require('node:assert/strict');
const { uploadFilename, imageMime } = require('../src/utils/aiCaseReviewAttachments');

test('case review reads only local uploaded images and verifies image bytes', () => {
  assert.equal(uploadFilename({ url: '/api/uploads/123_abc.png' }), '123_abc.png');
  assert.throws(() => uploadFilename({ url: 'https://other.example/private.png' }), /地址无效/);
  assert.throws(() => uploadFilename({ url: '/api/uploads/../private.png' }), /地址无效/);
  assert.equal(imageMime(Buffer.from([0xff, 0xd8, 0xff, 0x00])), 'image/jpeg');
  assert.throws(() => imageMime(Buffer.from('not an image')), /不是可识别的图片/);
});
