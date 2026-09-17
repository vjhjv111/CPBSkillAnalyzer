const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
let html = fs.readFileSync(path.join(root, 'public/index.html'), 'utf8');
for (const file of ['ocr-core.js', 'ocr-images.js']) {
  const script = fs.readFileSync(path.join(root, 'public', file), 'utf8');
  html = html.replace(`<script src="${file}"></script>`, () => `<script>\n${script}\n</script>`);
}
// The downloadable page retains the original direct-API mode.
html = html.replace("const PROXY_URL = '/analyze';", "const PROXY_URL = '';");
fs.writeFileSync(path.join(root, 'skill_analyzer.html'), html);
