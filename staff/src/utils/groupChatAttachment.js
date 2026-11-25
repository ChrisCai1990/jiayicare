import { readChatFile } from './chatFile'

const IMAGE_EXTENSIONS = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' }

export function readGroupChatAttachment(file) {
  const supplied = file?.type
  const suffix = file?.name?.split('.').pop()?.toLowerCase()
  const mimeType = !supplied || supplied === 'application/octet-stream'
    ? Object.keys(IMAGE_EXTENSIONS).find(type=>IMAGE_EXTENSIONS[type] === (suffix === 'jpeg' ? 'jpg' : suffix))
    : supplied
  if (!mimeType?.startsWith('image/')) return readChatFile(file)
  const extension = IMAGE_EXTENSIONS[mimeType]
  if (!extension) return Promise.reject(new Error('图片仅支持 JPG、PNG、WebP、GIF'))
  if (file.size > 5 * 1024 * 1024) return Promise.reject(new Error('图片不能超过 5 MB'))
  const name = file.name && file.name.toLowerCase().endsWith(`.${extension}`)
    ? file.name : `粘贴图片.${extension}`
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('读取图片失败'))
    reader.onload = () => resolve({ name, mimeType, data: String(reader.result).replace(/^data:[^;]*;base64,/, `data:${mimeType};base64,`) })
    reader.readAsDataURL(file)
  })
}
