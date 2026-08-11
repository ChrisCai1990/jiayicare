// Some Android WeChat runtimes expose neither TextEncoder nor TextDecoder,
// while the base library uses TextEncoder during page/storage reporting.
const root = typeof globalThis !== 'undefined'
  ? globalThis
  : (typeof global !== 'undefined' ? global : {});

if (typeof root.TextEncoder === 'undefined') {
  root.TextEncoder = class TextEncoder {
    encode(input = '') {
      const text = String(input);
      const bytes = [];
      for (let i = 0; i < text.length; i += 1) {
        let code = text.charCodeAt(i);
        if (code >= 0xD800 && code <= 0xDBFF && i + 1 < text.length) {
          const next = text.charCodeAt(i + 1);
          if (next >= 0xDC00 && next <= 0xDFFF) {
            code = 0x10000 + ((code - 0xD800) << 10) + (next - 0xDC00);
            i += 1;
          }
        }
        if (code <= 0x7F) bytes.push(code);
        else if (code <= 0x7FF) bytes.push(0xC0 | (code >> 6), 0x80 | (code & 0x3F));
        else if (code <= 0xFFFF) bytes.push(0xE0 | (code >> 12), 0x80 | ((code >> 6) & 0x3F), 0x80 | (code & 0x3F));
        else bytes.push(0xF0 | (code >> 18), 0x80 | ((code >> 12) & 0x3F), 0x80 | ((code >> 6) & 0x3F), 0x80 | (code & 0x3F));
      }
      return new Uint8Array(bytes);
    }
  };
}
