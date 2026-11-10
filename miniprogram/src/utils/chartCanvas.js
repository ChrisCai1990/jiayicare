import Taro from '@tarojs/taro';

// Taro H5 looks up canvas through its current page, which can still point at
// another tab during a switch. Locate the mounted canvas directly on the web.
function nativeAdapter(ctx) {
  return {
    setLineWidth: value => { ctx.lineWidth = value; },
    setStrokeStyle: value => { ctx.strokeStyle = value; },
    setFillStyle: value => { ctx.fillStyle = value; },
    setLineCap: value => { ctx.lineCap = value; },
    setLineJoin: value => { ctx.lineJoin = value; },
    setFontSize: value => { ctx.font = `${value}px sans-serif`; },
    setTextAlign: value => { ctx.textAlign = value; },
    beginPath: () => ctx.beginPath(),
    moveTo: (x, y) => ctx.moveTo(x, y),
    lineTo: (x, y) => ctx.lineTo(x, y),
    stroke: () => ctx.stroke(),
    fill: () => ctx.fill(),
    arc: (x, y, radius, start, end) => ctx.arc(x, y, radius, start, end),
    fillText: (text, x, y) => ctx.fillText(text, x, y),
    draw: () => {},
  };
}

export function drawChart(canvasId, height, paint, miniWidth = 300) {
  if (process.env.TARO_ENV !== 'h5') {
    paint(Taro.createCanvasContext(canvasId), miniWidth, height);
    return () => {};
  }

  let active = true;
  let frame = 0;
  let observer;
  let lastWidth = 0;
  const render = () => {
    if (!active) return;
    const canvas = document.querySelector(`canvas[canvas-id="${canvasId}"]`);
    const width = canvas?.getBoundingClientRect().width || 0;
    if (width < 1) return;
    if (width === lastWidth && observer) return;
    lastWidth = width;
    const scale = Math.min(window.devicePixelRatio || 1, 3);
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    paint(nativeAdapter(ctx), width, height);
    if (!observer && typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(() => {
        if (active) frame = requestAnimationFrame(render);
      });
      observer.observe(canvas.parentElement);
    }
  };
  frame = requestAnimationFrame(render);
  return () => {
    active = false;
    cancelAnimationFrame(frame);
    observer?.disconnect();
  };
}
