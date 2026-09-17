// 스킬 변경 판독기용 프록시 (Render Web Service).
// Anthropic API 키는 여기(서버 환경변수)에만 있고, 브라우저에는 절대 전달되지 않습니다.

const express = require('express');

const app = express();
app.use(express.json({ limit: '30mb' }));

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || '*'; // 배포 후 본인 도메인으로 좁히는 걸 권장

if (!ANTHROPIC_API_KEY) {
  console.warn('[경고] ANTHROPIC_API_KEY 환경변수가 설정되지 않았어요. Render 대시보드 > Environment에서 추가하세요.');
}

app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGIN);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'content-type');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

app.get('/health', (req, res) => {
  res.send('skill-analyzer-proxy: ok');
});

// public/index.html (스킬 변경 판독기 페이지)을 이 서비스가 그대로 서빙해요.
// 같은 오리진이라 CORS 설정도 신경 쓸 필요가 없어요.
app.use(express.static('public'));

app.post('/analyze', async (req, res) => {
  if (!ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: 'server_missing_api_key' });
  }

  const { mediaType, base64, images, prompt, maxTokens, model = 'claude-sonnet-5' } = req.body || {};
  const allowedModels = ['claude-sonnet-5', 'claude-haiku-4-5-20251001'];
  if (!allowedModels.includes(model)) {
    return res.status(400).json({ error: { message: '지원하지 않는 모델입니다.' } });
  }
  const inputs = images ?? [{ mediaType, base64 }];
  if (typeof prompt !== 'string' || !prompt.trim() || !Array.isArray(inputs) || inputs.length < 1 || inputs.length > 19 ||
      inputs.some(image => !image || !['image/png','image/jpeg','image/webp','image/gif'].includes(image.mediaType) ||
        typeof image.base64 !== 'string' || !image.base64.length || image.base64.length > 9*1024*1024 ||
        !/^[A-Za-z0-9+/]+={0,2}$/.test(image.base64) || (image.label !== undefined && typeof image.label !== 'string'))) {
    return res.status(400).json({ error: { message: '이미지와 프롬프트 형식을 확인해주세요.' } });
  }
  const tokens = Math.min(8192, Math.max(256, parseInt(maxTokens, 10) || 2048));

  try {
    const anthropicResp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens: tokens,
        messages: [
          {
            role: 'user',
            content: [
              ...inputs.flatMap(image => [
                { type: 'text', text: image.label || '스크린샷' },
                { type: 'image', source: { type: 'base64', media_type: image.mediaType, data: image.base64 } },
              ]),
              { type: 'text', text: prompt },
            ],
          },
        ],
      }),
    });

    const data = await anthropicResp.json();
    res.status(anthropicResp.status).json(data);
  } catch (e) {
    console.error(e);
    res.status(502).json({ error: 'upstream_fetch_failed' });
  }
});

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => console.log(`skill-analyzer-proxy listening on port ${PORT}`));
}
module.exports = app;
