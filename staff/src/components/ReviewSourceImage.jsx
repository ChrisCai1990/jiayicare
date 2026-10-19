import React, { useEffect, useRef, useState } from 'react'

// Keep the rotated image's layout box aligned with its visible bounds so every
// edge remains reachable in the scrollable review pane.
export default function ReviewSourceImage({ src, alt, zoom, rotation, onClick }) {
  const containerRef = useRef(null)
  const [containerWidth, setContainerWidth] = useState(0)
  const [imageSize, setImageSize] = useState(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const updateWidth = () => setContainerWidth(container.clientWidth)
    updateWidth()
    const observer = new ResizeObserver(updateWidth)
    observer.observe(container)
    return () => observer.disconnect()
  }, [])

  const width = containerWidth * zoom / 100
  const height = imageSize ? width * imageSize.height / imageSize.width : 0
  const sideways = rotation % 180 !== 0
  const frameWidth = sideways ? height : width
  const frameHeight = sideways ? width : height
  const offset = rotation === 90 ? { left: height, top: 0 }
    : rotation === 180 ? { left: width, top: height }
      : rotation === 270 ? { left: 0, top: width }
        : { left: 0, top: 0 }

  return (
    <div ref={containerRef} style={{ width: '100%' }}>
      <div style={{ position: 'relative', width: frameWidth, height: frameHeight }}>
        <img
          src={src}
          alt={alt}
          onLoad={event => setImageSize({ width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight })}
          onClick={onClick}
          style={{ position: 'absolute', ...offset, width, height, maxWidth: 'none', borderRadius: 6, cursor: 'zoom-in', transformOrigin: 'top left', transform: `rotate(${rotation}deg)`, visibility: imageSize && containerWidth ? 'visible' : 'hidden' }}
        />
      </div>
    </div>
  )
}
