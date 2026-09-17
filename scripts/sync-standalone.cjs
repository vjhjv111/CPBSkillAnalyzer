const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
let html = fs.readFileSync(path.join(root, 'public/index.html'), 'utf8');
for (const file of ['ocr-core.js', 'ocr-images.js', 'clova-parser.js']) {
  const script = fs.readFileSync(path.join(root, 'public', file), 'utf8');
  html = html.replace(`<script src="${file}"></script>`, () => `<script>\n${script}\n</script>`);
}
// OCR credentials stay on the server. The bundled page also uses /analyze.
fs.writeFileSync(path.join(root, 'skill_analyzer.html'), html);
