# AI 블로그 에디터

사진과 장소를 입력하면 AI(Claude)가 사진을 분석해 한국어 블로그 글을 자동으로 작성해 주는 웹 앱입니다.

## 주요 기능

- 📷 사진 여러 장 업로드 (드래그 앤 드롭 지원, 최대 8장)
- 📍 장소 이름 + 추가 정보 입력
- ✍️ 글 스타일 선택 (정보/리뷰 · 여행 감성 · 친근한 구어체)
- ⚡ Claude Vision으로 사진을 실제 분석해 구체적으로 서술
- 🔴 결과 실시간 스트리밍 + 인라인 편집 + 복사

## 기술 스택

- [Next.js](https://nextjs.org/) (App Router) + React + TypeScript
- [Anthropic Claude API](https://docs.claude.com/) — 모델: `claude-opus-5` (Vision)

## 시작하기

1. 의존성 설치

   ```bash
   npm install
   ```

2. 환경 변수 설정 — `.env.example`을 복사한 뒤 API 키를 입력하세요.

   ```bash
   cp .env.example .env.local
   # .env.local 파일을 열어 ANTHROPIC_API_KEY 값을 채웁니다
   ```

   API 키는 [Anthropic Console](https://console.anthropic.com)에서 발급받을 수 있습니다.

3. 개발 서버 실행

   ```bash
   npm run dev
   ```

   브라우저에서 http://localhost:3000 접속.

## 동작 방식

1. 브라우저에서 선택한 사진을 base64로 인코딩해 `/api/generate`로 전송합니다.
2. 서버 라우트가 Anthropic SDK로 사진(Vision) + 장소/추가 정보를 Claude에 전달합니다.
3. Claude가 생성한 글이 스트리밍으로 화면에 표시되고, 그대로 수정·복사할 수 있습니다.

## 참고

- 사진에 없는 사실(정확한 가격·주소·영업시간 등)은 지어내지 않도록 프롬프트에 명시되어 있습니다.
- 사진 없이 장소 이름만으로도 글을 생성할 수 있습니다.
