function appendCertificateFiles(current, files, category) {
  const next = [...current];
  for (const file of files) {
    if (!next.some(item => item.category === category && item.file.name === file.name && item.file.size === file.size && item.file.lastModified === file.lastModified)) {
      next.push({ file, category });
    }
  }
  return next;
}
module.exports = { appendCertificateFiles };
