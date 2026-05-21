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
  // 完全禁用压缩 + 混淆，用于诊断 TDZ 根因（变量名可读）
  compress: false,
  mangle: false,
};

module.exports = config;
