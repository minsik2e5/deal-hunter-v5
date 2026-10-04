# Deal Hunter V5 — AI 공통 작업 규칙 (Codex · Claude Code 공용)

기존 앱을 이어서 작업한다. 새 프로젝트로 다시 만들지 않는다.
운영: https://deal-hunter-v5.wwzb-64.chatgpt.site (ChatGPT Sites, Cloudflare Worker + D1 원장 + R2 사진)

## 시작할 때
1. HANDOFF.md를 읽는다. 작업을 마치면 HANDOFF.md 맨 위에 날짜·작업자(Codex/Claude)·변경 내용을 적고 커밋한다.
2. `npm ci` → `npm run typecheck` → `npm test` → `npm run build` 가 통과하는지 확인한다.

## 절대 규칙
- 운영 원장(D1)과 사진(R2)을 덮어쓰거나 초기화하지 않는다. 시드·리셋 금지.
- 운영 쓰기는 사용자가 변경 목록을 보고 승인한 뒤에만 한다. 쓰기 전에 GET `/api/cloud?route=state`로 재조회하고 백업하며, PUT에는 `expectedRevision`을 넣는다. 충돌(409) 시 덮어쓰지 말고 재조회·재대조한다.
- 접속 코드·해시·API 키·원장 JSON·백업·사진을 저장소에 넣지 않는다. 접속 코드는 사용자에게 비공개로 받는다.
- 가격 인하·가격 변경 기능은 꺼둔다 (`VITE_ENABLE_PRICE_CHANGES=false`).
- 누락된 판매일·원가·수수료는 추정하지 않는다 (unknown 유지). 불명확한 상품은 사용자에게 묻는다.
- 같은 상품이 여러 재고 행에 있으면 확실한 근거 없이 자동 연결하지 않는다. 사이즈가 다르면 연결하지 않는다.
- 공동판매 상품은 개인 매출에 합산하지 않는다.
- `.openai/hosting.json`을 유지한다.
- 채팅 메시지 자동 발송, 숨은 API·쿠키·세션 파일 읽기는 하지 않는다.

## 배포
- 코드 변경은 이 저장소에 커밋한다. 운영 배포는 기존 Sites 프로젝트(Codex 쪽)에서 한다.
- Render 등 다른 호스팅으로 옮기려면 D1/R2 → 다른 DB·스토리지 이전이 필요하다. 별도 계획 없이 시도하지 않는다.

## 파일 지도
`app/page.tsx` 화면 · `lib/state.ts` 상태·검증 · `lib/finance.ts` 정산 · `lib/marketplace.ts` 번장 링크 · `lib/Pricing.tsx` 가격·장기재고 · `worker/index.ts` API
