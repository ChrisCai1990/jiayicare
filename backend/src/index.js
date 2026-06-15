require('dotenv').config();
require('express-async-errors'); // 让 Express 4 自动捕获 async 路由里的异常
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const path = require('path');
const fs = require('fs');
const connectDB = require('./config/db');

const app = express();

// 连接数据库
connectDB();

// 静态文件（上传图片）
const UPLOADS_DIR = process.env.UPLOADS_DIR || path.join(__dirname, '../../uploads');
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });
app.use('/api/uploads', express.static(UPLOADS_DIR));

// 中间件 — CORS 白名单（生产域名 + 本地开发端口）
const ALLOWED_ORIGINS = [
  'https://jiaycare.com',
  'https://admin.jiaycare.com',
  'https://staff.jiaycare.com',
  // 本地开发
  'http://localhost:3000',
  'http://localhost:5173',
  'http://localhost:5174',
  'http://localhost:5175',
  'http://localhost:8081',
  'http://localhost:8082',
  'http://localhost:19006', // Expo web
];
app.use(cors({
  origin: (origin, callback) => {
    // origin 为空表示非浏览器请求（curl、移动端原生、服务器间调用）
    if (!origin || ALLOWED_ORIGINS.includes(origin)) return callback(null, true);
    callback(new Error(`CORS: origin ${origin} not allowed`));
  },
  credentials: true,
}));
app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ limit: '25mb', extended: true }));
app.use(morgan('dev'));

// 健康检查
app.get('/', (req, res) => {
  res.json({ success: true, message: '嘉医汇 API 服务运行中 🏥', version: '1.0.2' });
});

// 路由
app.use('/api/auth',    require('./routes/auth'));
app.use('/api/user',    require('./routes/user'));
app.use('/api/records', require('./routes/healthRecords'));
app.use('/api/medications', require('./routes/medications'));
app.use('/api/supplements', require('./routes/supplements'));
app.use('/api/tasks',   require('./routes/tasks'));
const messagesRouter = require('./routes/messages');
app.use('/api/messages', messagesRouter);
app.locals.ssePublish = messagesRouter.ssePublish;
app.use('/api/reminders', require('./routes/reminders'));
app.use('/api/reports',       require('./routes/reports'));
app.use('/api/chat',          require('./routes/chat'));
app.use('/api/questionnaire', require('./routes/questionnaire'));
app.use('/api/services',      require('./routes/services'));
app.use('/api/orders',        require('./routes/orders'));
app.use('/api/feedback',      require('./routes/feedback'));
app.use('/api/system',        require('./routes/system'));
app.use('/api/share',         require('./routes/share'));
app.use('/api/admin',         require('./routes/admin'));
app.use('/api/admin',         require('./routes/settings'));
app.use('/api/staff',         require('./routes/staff'));
app.use('/api/screening',     require('./routes/screening'));

// 404
app.use((req, res) => {
  res.status(404).json({ success: false, message: '接口不存在' });
});

// 全局错误处理
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ success: false, message: '服务器内部错误', error: process.env.NODE_ENV === 'development' ? err.message : undefined });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 服务启动成功，端口：${PORT}`);
});
