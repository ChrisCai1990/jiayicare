// metro.config.js
// Expo SDK 54 / Metro bundler 配置
//
// 根本原因已修复：HomeScreen.js 中 const vitals 在第 448 行声明，
// 但在第 423 行的 BMI 计算中就被使用，造成真实的源码 TDZ 错误。
// 已将 vitals/bpRec/bsSrc 移到 BMI 计算之前。
//
// metro.config.js 恢复默认（不需要特殊 minifier 配置）。

const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

module.exports = config;
