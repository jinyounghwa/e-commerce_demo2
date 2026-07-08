const fs = require('fs');
const path = require('path');

// 1. 빌드 결과물 경로 설정
const distDir = path.join(__dirname, '..', 'apps', 'web', 'dist');
const redirectsPath = path.join(distDir, '_redirects');

// 2. 환경변수 확인 (API_URL 또는 VITE_API_BASE)
let apiUrl = process.env.API_URL || process.env.VITE_API_BASE || '';

// URL 포맷 정규화
if (apiUrl) {
  apiUrl = apiUrl.replace(/\/+$/, ''); // 끝 슬래시 제거
  
  // 사용자가 백엔드 베이스 도메인만 넣었을 경우를 위해 /api 보완
  if (!apiUrl.endsWith('/api') && !apiUrl.includes('/api/')) {
    apiUrl = apiUrl + '/api';
  }
}

console.log('>> [Netlify Redirects] 설정 시작');
console.log(`>> 백엔드 API URL: ${apiUrl || '(미지정 - 로컬 프록시 혹은 하드코딩된 API 주소 사용 권장)'}`);

let redirectContent = '';

if (apiUrl) {
  // /api/* 요청을 백엔드 API 서버로 프록시 (200! 강제 프록시)
  redirectContent += `/api/*  ${apiUrl}/:splat  200!\n`;
  console.log(`>> 프록시 규칙 추가: /api/* -> ${apiUrl}/:splat (200!)`);
}

// React Router SPA 라우팅을 위한 폴백 추가
redirectContent += `/*  /index.html  200\n`;
console.log('>> SPA 라우팅 규칙 추가: /* -> /index.html (200)');

try {
  // dist 디렉토리 확보
  if (!fs.existsSync(distDir)) {
    fs.mkdirSync(distDir, { recursive: true });
  }
  
  fs.writeFileSync(redirectsPath, redirectContent, 'utf8');
  console.log(`>> _redirects 파일 작성 완료: ${redirectsPath}`);
} catch (err) {
  console.error('❌ _redirects 생성 실패:', err);
  process.exit(1);
}
