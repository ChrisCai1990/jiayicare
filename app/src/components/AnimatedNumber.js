import React, { useEffect, useRef, useState } from 'react';
import { Animated, Text } from 'react-native';

// 数字滚动动画组件
export default function AnimatedNumber({ value = 0, duration = 1200, style, suffix = '' }) {
  const anim = useRef(new Animated.Value(0)).current;
  const [displayed, setDisplayed] = useState(0);

  useEffect(() => {
    anim.setValue(0);
    const listener = anim.addListener(({ value: v }) => setDisplayed(Math.round(v)));
    Animated.timing(anim, {
      toValue: value,
      duration,
      useNativeDriver: false,
    }).start();
    return () => anim.removeListener(listener);
  }, [value]);

  return <Text style={style}>{displayed}{suffix}</Text>;
}
