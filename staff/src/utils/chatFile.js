const types = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
}

export function readChatFile(file) {
  const extension = file?.name?.split('.').pop()?.toLowerCase()
  const mimeType = types[extension]
  if (!mimeType || (file.type && file.type !== 'application/octet-stream' && file.type !== mimeType)) return Promise.reject(new Error('仅支持 PDF、Word、Excel、PPT 文件'))
  if (file.size > 10 * 1024 * 1024) return Promise.reject(new Error('文件不能超过 10 MB'))
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('读取文件失败'))
    reader.onload = () => resolve({ name: file.name, mimeType, data: String(reader.result).replace(/^data:[^;]*;base64,/, `data:${mimeType};base64,`) })
    reader.readAsDataURL(file)
  })
}
