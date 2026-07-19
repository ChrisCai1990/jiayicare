import React, { useMemo } from 'react';
import { Image } from '@tarojs/components';
import ioniconsSvgs from './ionicons';
import iconSvgs from './iconSvgs';
import emojiIconMap from './iconMap';

// 通用矢量图标组件：小程序生态不支持字体图标库，用 SVG 源码内嵌为JS字符串常量代替。
// 2026-07-19起：优先用 ionicons.js（从官方 ionicons 包提取，与 app 端 @expo/vector-icons
// 的 Ionicons 是同一套设计，同名同形，做到与 app 端完全同款）；iconSvgs.js（Lucide开源图标集）
// 作为 ionicons.js 未覆盖到的图标名的补充兜底；emoji 字符做最后的迁移期兼容。
// 运行时替换 stroke=currentColor 为实际颜色，编码成 data URI 传给 <image>。
// name 优先传 Ionicons 图标名（如 "medical-outline"，与app端 <Ionicons name="..."/> 完全一致）。
// 小程序部分基础库对 data:image/svg+xml,<url-encoded> 支持不稳定，改用 base64 编码更可靠。
// 不依赖运行时 btoa（小程序JSCore环境不保证提供），手写UTF-8安全的base64编码。
function toBase64(str) {
  const utf8 = unescape(encodeURIComponent(str));
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let out = '';
  let i = 0;
  while (i < utf8.length) {
    const b1 = utf8.charCodeAt(i++);
    const b2 = i < utf8.length ? utf8.charCodeAt(i++) : NaN;
    const b3 = i < utf8.length ? utf8.charCodeAt(i++) : NaN;
    const t1 = b1 >> 2;
    const t2 = ((b1 & 3) << 4) | (isNaN(b2) ? 0 : b2 >> 4);
    const t3 = isNaN(b2) ? 64 : (((b2 & 15) << 2) | (isNaN(b3) ? 0 : b3 >> 6));
    const t4 = isNaN(b3) ? 64 : (b3 & 63);
    out += chars[t1] + chars[t2] + (t3 === 64 ? '=' : chars[t3]) + (t4 === 64 ? '=' : chars[t4]);
  }
  return out;
}

export default function Icon({ name, size = 20, color = '#1A2B24', style }) {
  const dataUri = useMemo(() => {
    // 优先级：Ionicons（app端同款）> Lucide（旧图标库兜底）> emoji映射表（迁移期兼容）
    let svg = ioniconsSvgs[name];
    if (!svg) {
      const lucideName = iconSvgs[name] ? name : emojiIconMap[name];
      svg = iconSvgs[lucideName];
    }
    if (!svg) return '';
    const colored = svg.replace(/currentColor/g, color);
    return `data:image/svg+xml;base64,${toBase64(colored)}`;
  }, [name, color]);

  if (!dataUri) return null;

  return (
    <Image
      src={dataUri}
      mode="aspectFit"
      style={{ width: `${size}px`, height: `${size}px`, flexShrink: 0, ...style }}
    />
  );
}
