import { readChatFile } from './chatFile'

const IMAGE_EXTENSIONS = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' }

export function readGroupChatAttachment(file) {
  if (!file?.type?.startsWith('image/')) return readChatFile(file)
  const extension = IMAGE_EXTENSIONS[file.type]
  if (!extension) return Promise.reject(new Error('图片仅支持 JPG、PNG、WebP、GIF'))
  if (file.size > 5 * 1024 * 1024) return Promise.reject(new Error('图片不能超过 5 MB'))
  const name = file.name && file.name.toLowerCase().endsWith(`.${extension}`)
    ? file.name : `粘贴图片.${extension}`
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('读取图片失败'))
    reader.onload = () => resolve({ name, mimeType: file.type, data: reader.result })
    reader.readAsDataURL(file)
  })
}
