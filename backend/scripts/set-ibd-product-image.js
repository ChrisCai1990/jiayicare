// Attach the approved IBD product cover after copying it to the uploads directory.
// Read-only by default; pass --apply to update the existing Jiayihui product.
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const Tenant = require('../src/models/Tenant');
const Product = require('../src/models/Product');

const filename = 'ibd-annual-v1.png';
const url = `/api/uploads/${filename}`;

async function main() {
  if (!process.env.MONGODB_URI) throw new Error('缺少 MONGODB_URI');
  const uploadsDir = process.env.UPLOADS_DIR || path.join(__dirname, '../../uploads');
  const imagePath = path.join(uploadsDir, filename);
  const image = fs.readFileSync(imagePath);
  if (image.length < 100000 || image.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a')
    throw new Error('IBD 商品图片不存在或不是有效 PNG');
  await mongoose.connect(process.env.MONGODB_URI);
  const tenant = await Tenant.findOne({ code: 'jiayihui' }).lean();
  if (!tenant) throw new Error('未找到嘉医汇机构');
  const product = await Product.findOne({ tenantId: tenant._id, name: 'IBD 年度专病管理服务' });
  if (!product) throw new Error('未找到 IBD 年度商品');
  const current = product.images || [];
  if (!process.argv.includes('--apply')) {
    console.log(JSON.stringify({ productId: String(product._id), current, proposed: [url], bytes: image.length }));
    return;
  }
  if (current.length && !current.every(item => item === url))
    throw new Error('商品已有其他图片，请先人工核对，未覆盖');
  product.images = [url];
  await product.save();
  console.log(JSON.stringify({ productId: String(product._id), images: product.images }));
}

main().catch(error => { console.error(error.message); process.exitCode = 1; })
  .finally(() => mongoose.disconnect().catch(() => {}));
