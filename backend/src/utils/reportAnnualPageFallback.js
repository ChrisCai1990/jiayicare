// A repeated whole-page request cannot fix a dense page that already timed out
// or hit the output limit. Retry once in four overlapping horizontal bands.
async function parseAnnualPageBands({ renderBands, parseImage, parseJSON, mergeItems, prompt, pageNum, model }) {
  const images = await renderBands();
  if (!Array.isArray(images) || images.length !== 4 || images.some(image => !image)) {
    throw new Error(`第${pageNum}页分段渲染不完整`);
  }
  const result = { items: [] };
  for (let index = 0; index < images.length; index++) {
    const text = await parseImage(images[index], `${prompt}\n\n【分段重试】这是第${pageNum}页自上而下的第${index + 1}/4段，与相邻段有重叠。只提取本图实际可见的检查结果；每个栏目先读左栏再读右栏，不补造缺失文字。`, {
      sourcePage: pageNum, isUrl: false, model, maxTokens: 5000, timeoutMs: 180000,
    });
    const parsed = parseJSON(text);
    if (!parsed || !Array.isArray(parsed.items)) throw new Error(`第${pageNum}页第${index + 1}段未返回有效项目列表`);
    result.items = mergeItems(result.items, parsed.items);
    if (!result.institution && parsed.institution) result.institution = parsed.institution;
    if (!result.checkDate && parsed.checkDate) result.checkDate = parsed.checkDate;
  }
  if (!result.items.length) throw new Error(`第${pageNum}页分段重试仍无可核对项目`);
  return result;
}

module.exports = { parseAnnualPageBands };
