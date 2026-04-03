/**
 * Anthropic API Proxy Server
 * 
 * 사용법:
 *   1. npm init -y
 *   2. npm install express cors
 *   3. ANTHROPIC_API_KEY=sk-ant-xxxxx node proxy-server.js
 *   4. 브라우저에서 http://localhost:3000 열기
 * 
 * 또는 .env 파일에 ANTHROPIC_API_KEY=sk-ant-xxxxx 저장 후
 *   npm install dotenv 하고 아래 주석 해제
 */

// require('dotenv').config(); // .env 파일 사용 시 주석 해제

const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = 3000;

// API Key — 환경변수에서 읽기
const API_KEY = process.env.ANTHROPIC_API_KEY;

if (!API_KEY) {
  console.error('❌ ANTHROPIC_API_KEY 환경변수를 설정하세요!');
  console.error('   예: ANTHROPIC_API_KEY=sk-ant-xxxxx node proxy-server.js');
  process.exit(1);
}

app.use(cors());
app.use(express.json({ limit: '10mb' }));

// 정적 파일 서빙 (HTML을 같은 폴더에 두세요)
app.use(express.static(path.join(__dirname, 'public')));

// Anthropic API 프록시 엔드포인트
app.post('/api/claude', async (req, res) => {
  console.log(`[${new Date().toISOString()}] 🔄 API 요청 수신`);
  
  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify(req.body)
    });

    const data = await response.json();

    if (!response.ok) {
      console.error(`[${new Date().toISOString()}] ❌ API 에러:`, response.status, data);
      return res.status(response.status).json({
        error: true,
        status: response.status,
        detail: data
      });
    }

    // 응답에서 텍스트 추출하여 로그
    const textBlocks = (data.content || [])
      .filter(c => c.type === 'text')
      .map(c => c.text.substring(0, 200));
    console.log(`[${new Date().toISOString()}] ✅ 응답 수신 (${data.content?.length || 0}개 블록)`);
    if (textBlocks.length) console.log('   텍스트 미리보기:', textBlocks[0] + '...');

    res.json(data);

  } catch (err) {
    console.error(`[${new Date().toISOString()}] 💥 프록시 에러:`, err.message);
    res.status(500).json({
      error: true,
      message: err.message,
      hint: 'Anthropic API 연결 실패. API 키와 네트워크를 확인하세요.'
    });
  }
});

// 상태 확인 엔드포인트
app.get('/api/status', (req, res) => {
  res.json({
    ok: true,
    hasKey: !!API_KEY,
    keyPrefix: API_KEY ? API_KEY.substring(0, 10) + '...' : null,
    timestamp: new Date().toISOString()
  });
});

app.listen(PORT, () => {
  console.log(`
  ╔══════════════════════════════════════════╗
  ║  🚀 Store Dashboard Proxy Server         ║
  ║  http://localhost:${PORT}                   ║
  ║  API Key: ${API_KEY.substring(0, 10)}...              ║
  ╚══════════════════════════════════════════╝
  
  📁 public/ 폴더에 dashboard.html을 넣으세요
  🔗 http://localhost:${PORT}/dashboard.html 에서 열기
  `);
});