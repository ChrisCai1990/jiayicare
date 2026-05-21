// metro.config.js
// Expo SDK 54 / Metro bundler 配置
//
// 关键修复：Railway 生产构建中 Terser 的 inline:3（aggressive）优化
// 会将函数体内联到调用处，导致 const 声明被提前访问，产生 TDZ：
//   "Cannot access 'ue' before initialization"
// 将 inline 降到 1（safe）可彻底消除此问题，bundle 体积几乎无影响。

const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

config.transformer.minifierConfig = {
  compress: {
    // inline:1 = 只内联简单常量，不内联函数体
    // inline:2/3（默认）会把函数整体内联，破坏 const TDZ 顺序
    inline: 1,
    // 禁止把 const 变量替换成其值（防止引用被提前）
    reduce_vars: false,
    // 保持 passes 为 1，减少多轮压缩引入的意外重排
    passes: 1,
  },
  mangle: true,
};

module.exports = config;
