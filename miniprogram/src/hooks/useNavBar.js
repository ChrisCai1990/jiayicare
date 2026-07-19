import { useState, useEffect } from 'react';
import Taro from '@tarojs/taro';

// 自定义导航栏适配（navigationStyle: custom 后系统胶囊按钮无法隐藏，页面需要自己计算安全区）。
// 返回统一的顶部安全区尺寸，页面自绘的标题栏用这些值做 paddingTop/height，
// 确保内容不被胶囊遮挡，且与胶囊按钮保持水平对齐。
let cached = null;

export default function useNavBar() {
  const [rect, setRect] = useState(cached);

  useEffect(() => {
    if (cached) return;
    try {
      const menuRect = Taro.getMenuButtonBoundingClientRect();
      const sys = Taro.getWindowInfo ? Taro.getWindowInfo() : Taro.getSystemInfoSync();
      const statusBarHeight = sys.statusBarHeight || 20;
      // 导航栏高度 = 胶囊底部与状态栏顶部的距离，胶囊上下留白对称，取胶囊高度上下各加一份间距
      const navBarHeight = (menuRect.bottom - statusBarHeight) + (menuRect.top - statusBarHeight);
      cached = {
        statusBarHeight,
        navBarHeight,
        totalHeight: statusBarHeight + navBarHeight,
        menuRect,
      };
    } catch {
      // 非小程序环境或接口不可用时兜底一个常见值
      cached = { statusBarHeight: 20, navBarHeight: 44, totalHeight: 64, menuRect: null };
    }
    setRect(cached);
  }, []);

  return rect || { statusBarHeight: 20, navBarHeight: 44, totalHeight: 64, menuRect: null };
}
