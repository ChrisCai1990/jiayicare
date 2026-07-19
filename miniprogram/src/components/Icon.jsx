import React, { useMemo } from 'react';
import { Image } from '@tarojs/components';
import iconSvgs from './iconSvgs';
import emojiIconMap from './iconMap';

// 通用矢量图标组件：对齐app端Ionicons图标（小程序生态不支持字体图标库）。
// 用 Lucide 开源图标集（风格与Ionicons接近），SVG源码内嵌为JS字符串常量，
// 运行时替换 stroke=currentColor 为实际颜色，编码成 data URI 传给 <image>。
// name 可以传 lucide 图标名（如 "heart"），也可以直接传原 emoji 字符做迁移期兼容。
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
  const iconName = iconSvgs[name] ? name : emojiIconMap[name];
  const dataUri = useMemo(() => {
    const svg = iconSvgs[iconName];
    if (!svg) return '';
    const colored = svg.replace(/currentColor/g, color);
    return `data:image/svg+xml;base64,${toBase64(colored)}`;
  }, [iconName, color]);

  if (!dataUri) return null;

  return (
    <Image
      src={dataUri}
      mode="aspectFit"
      style={{ width: `${size}px`, height: `${size}px`, flexShrink: 0, ...style }}
    />
  );
}
