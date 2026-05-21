// metro.config.js
// Expo SDK 54 / Metro bundler 配置
//
// 关键修复：Railway 生产构建中 Terser 的 compress 优化（inline / sequences /
// collapse_vars 等）会将 const 声明重排到使用点之后，产生 TDZ：
//   "Cannot access 'X' before initialization"
// 完全关闭 compress（只保留 mangle 重命名）可彻底消除此问题。
// bundle 体积略有增加，但运行正确性得到保证。

const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

config.transformer.minifierConfig = {
  // 完全禁用所有压缩优化，彻底消除 Terser 引发的 TDZ 错误
  compress: false,
  // 仍然保留变量名混淆（缩短变量名，减小体积）
  mangle: true,
};

module.exports = config;
