const test = require('node:test');
const assert = require('node:assert/strict');
const Jimp = require('jimp-compact');
const { encodeAvatar } = require('../src/utils/profileAvatar');
test('头像重编码成512方形JPEG，拒绝无效或超大输入', async () => {
  const source = await new Jimp(30, 60, 0x209fa3ff).getBufferAsync(Jimp.MIME_PNG);
  const result = await encodeAvatar('data:image/png;base64,' + source.toString('base64'));
  const image = await Jimp.read(result);
  assert.equal(image.bitmap.width, 512); assert.equal(image.bitmap.height, 512);
  assert.equal(result[0], 0xff); assert.equal(result[1], 0xd8);
  for (const input of ['https://example.com/pic.png', 'data:image/svg+xml;base64,AAAA', 'data:image/png;base64,AAAA', 'x'.repeat(7 * 1024 * 1024 + 1)]) {
    await assert.rejects(() => encodeAvatar(input), error => error.status === 400);
  }
});

test('头像接口仅更新已登录账号，保存失败清除新文件', async () => {
  const fs = require('fs/promises');
  const os = require('os');
  const path = require('path');
  const express = require('express');
  const { avatarHandler } = require('../src/utils/profileAvatar');
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'jiayicare-avatar-test-'));
  const previous = process.env.UPLOADS_DIR; process.env.UPLOADS_DIR = directory;
  let query; let shouldFail = false;
  const model = { updateOne: async filter => { query = filter; if (shouldFail) throw new Error('db unavailable'); return { matchedCount: 1 }; } };
  const app = express(); app.use(express.json());
  app.post('/avatar', (req, res, next) => { req.user = { _id: 'signed-in-user' }; next(); }, avatarHandler(model, 'user'));
  const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  try {
    const content = 'data:image/png;base64,' + (await new Jimp(8, 8, 0xffffffff).getBufferAsync(Jimp.MIME_PNG)).toString('base64');
    const send = () => fetch(`http://127.0.0.1:${server.address().port}/avatar`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content, userId: 'someone-else' }) });
    const response = await send(); const data = await response.json();
    assert.equal(response.status, 200); assert.deepEqual(query, { _id: 'signed-in-user' });
    assert.match(data.data.avatar, /^\/api\/uploads\/avatars\/[a-f0-9-]+\.jpg$/);
    shouldFail = true; assert.equal((await send()).status, 500);
    assert.equal((await fs.readdir(path.join(directory, 'avatars'))).length, 1);
  } finally {
    await new Promise(resolve => server.close(resolve));
    if (previous === undefined) delete process.env.UPLOADS_DIR; else process.env.UPLOADS_DIR = previous;
    await fs.rm(directory, { recursive: true, force: true });
  }
});
