const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const Jimp = require('jimp-compact');

async function encodeAvatar(content) {
  if (typeof content !== 'string' || content.length > 7 * 1024 * 1024 ||
      !/^data:image\/(jpeg|png);base64,[A-Za-z0-9+/=]+$/.test(content)) {
    throw Object.assign(new Error('请选择5MB以内的 JPG 或 PNG 图片'), { status: 400 });
  }
  const input = Buffer.from(content.split(',')[1], 'base64');
  if (input.length > 5 * 1024 * 1024) throw Object.assign(new Error('头像不能超过5MB'), { status: 400 });
  try {
    const image = await Jimp.read(input);
    if (image.bitmap.width * image.bitmap.height > 25000000) throw new Error('图片过大');
    return await image.cover(512, 512).quality(85).getBufferAsync(Jimp.MIME_JPEG);
  } catch { throw Object.assign(new Error('图片无法读取，请换一张图片'), { status: 400 }); }
}

function avatarHandler(Model, actorKey) {
  return async (req, res) => {
    let file;
    try {
      const data = await encodeAvatar(req.body?.content);
      const directory = path.join(process.env.UPLOADS_DIR || path.join(__dirname, '../../../uploads'), 'avatars');
      await fs.mkdir(directory, { recursive: true });
      const name = crypto.randomUUID() + '.jpg';
      file = path.join(directory, name);
      await fs.writeFile(file, data, { flag: 'wx' });
      const avatar = '/api/uploads/avatars/' + name;
      const result = await Model.updateOne({ _id: req[actorKey]._id }, { $set: { avatar } });
      if (!result.matchedCount) throw new Error('账号不可用');
      res.json({ success: true, data: { avatar } });
    } catch (error) {
      if (file) await fs.unlink(file).catch(() => {});
      res.status(error.status || 500).json({ success: false, message: error.status ? error.message : '头像保存失败，请重试' });
    }
  };
}
module.exports = { encodeAvatar, avatarHandler };
