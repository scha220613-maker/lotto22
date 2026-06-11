# 로또 번호 추첨기

1~45 중 중복 없이 6개 번호를 무작위로 추첨하는 웹 앱입니다.  
생년월일 기반 **운세 챗봇**이 Gemini AI로 번호 추천 이유를 설명합니다.

## 기능

- 한국 로또 규칙 (1~45, 6개 번호)
- 1 / 3 / 5 / 10세트 한 번에 추첨
- 번호 구간별 색상 표시
- 추첨 기록 저장 및 복사
- 생년월일 입력 + Gemini 운세 챗봇 번호 추천
- 가입 팝업 (이름, 전화번호, 이메일 → Supabase 저장)

## Supabase 설정

1. [Supabase](https://supabase.com)에서 프로젝트를 생성합니다.
2. **SQL Editor**에서 `supabase/schema.sql` 내용을 실행해 `signups` 테이블을 만듭니다.
3. **Project Settings → API**에서 아래 값을 확인합니다.
   - Project URL → `SUPABASE_URL`
   - `service_role` secret → `SUPABASE_SERVICE_ROLE_KEY`

## Vercel 배포

1. [Vercel](https://vercel.com)에 이 저장소를 연결합니다.
2. **Settings → Environment Variables**에서 아래 변수를 추가합니다.

| 이름 | 값 |
|------|-----|
| `GEMINI_API_KEY` | Google AI Studio에서 발급한 API 키 |
| `SUPABASE_URL` | Supabase Project URL만 입력 (예: `https://xxxx.supabase.co`, `/rest/v1` 붙이지 않음) |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase **service_role** secret (anon key 아님) |

3. Deploy 후 사이트에서 생년월일을 저장하고 **운세 번호 추천**을 사용합니다.

> `SUPABASE_SERVICE_ROLE_KEY`는 **Project Settings → API → service_role secret** 값입니다. `anon public` 키를 넣으면 저장이 실패합니다.

> 챗봇 API(`/api/chat`)는 Vercel 서버리스 함수로 동작합니다. 로컬에서 `index.html`만 열면 챗봇은 작동하지 않습니다.

## 로컬 개발

```bash
npm i -g vercel
vercel dev
```

Vercel CLI 실행 시 `GEMINI_API_KEY` 환경변수를 설정하거나 `.env.local`에 추가하세요.

```
GEMINI_API_KEY=your_api_key_here
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here
```

## AI 모델

- `gemini-2.5-flash-lite`

## 실행 (정적 추첨만)

`index.html` 파일을 브라우저에서 열면 번호 추첨 기능만 사용할 수 있습니다.

```bash
python -m http.server 8765
```

브라우저에서 `http://localhost:8765` 로 접속하세요.
