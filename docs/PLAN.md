# PLAN — 3인 병렬 작업 계획

> 남은 구현 범위를 3명이 병렬로 진행하기 위한 분담·브랜치 전략 문서

| 항목 | 내용 |
| --- | --- |
| 문서 버전 | 1.1 |
| 기준 문서 | [PRD.md](PRD.md), [TRD.md](TRD.md), [DESIGN.md](DESIGN.md), [AGENTS.md](AGENTS.md) |

## 1. 현재 상태

### 완료

- `lib/` 코어 로직 전체 — 5개 에이전트 파이프라인, 승인 토큰·계약 해시, ICS 파서, GitHub 클라이언트, Verifier·메트릭 (단위 테스트 포함)
- 워크플로 엔진(`run-execution`) — 수집→계획→검사→승인→실행→검증 오케스트레이션, SSE 이벤트 버스, Judge Mode 읽기 전용 경로
- **선행 합의 ①** SSE 이벤트 스키마 — `ExecutionProgressEventSchema` zod discriminated union (`lib/contracts/schemas.ts`)
- **선행 합의 ②** mock API 라우트 10개 — TRD 4장 전체 경로를 fixture 기반 mock 응답으로 스캐폴딩 (`app/api/**`, 가짜 SSE 시퀀스 포함)
- **선행 합의 ③** 스토어 계층 — `ExecutionStore` 인터페이스 + memory·Cosmos DB 구현, `store-factory`
- Foundry 추론 클라이언트 (`lib/foundry/`) — 구조화 출력, `untrusted_content` 격리, 서버 설정(`lib/config.ts`)
- GitHub Actions 배포 워크플로 (`.github/workflows/azure-webapp.yml`)

### 남은 범위

- **A:** mock 라우트를 실제 파이프라인으로 교체(`run-execution` 연결), GitHub OAuth 로그인 + 세션 쿠키, 승인 토큰 검증 미들웨어(403)
- **B:** UI 전체 — `app/page.tsx`는 아직 템플릿 상태 (mock 라우트가 준비되어 즉시 착수 가능)
- **C:** `infra/` Bicep + azd 프로비저닝, Key Vault 연동, App Insights trace 전파

## 2. 담당 분담

| 담당 | 범위 | 주요 산출물 |
| --- | --- | --- |
| **A — API·백엔드** | `app/api/**` + 워크플로 연결 | `POST /api/executions`, SSE 스트림, `approve`/`retry`/`receipt`/`judge`/`health` 라우트, `run-execution` 연결, GitHub OAuth 로그인 + 세션 쿠키, 승인 토큰 검증 미들웨어(403) |
| **B — 프론트엔드** | `app/` UI 전체 | 하루 시작 버튼 → SSE 진행 스트리밍 뷰 → 드라이런 미리보기·노드 제외 승인 UI → 영수증 화면 → 실패 노드 재시도 버튼, 메트릭 대시보드, Judge Mode 페이지 |
| **C — 인프라·연동** | `infra/` + 스토어·관측 | Bicep + azd 프로비저닝(App Service, Cosmos DB, Key Vault, Foundry, App Insights), `execution-store` Cosmos DB 구현체, Foundry 모델 호출 어댑터, GitHub Actions 배포, App Insights trace 전파 |

### 2.1 병렬화 원칙

1. ~~**선행 합의 (첫 30분):** SSE 이벤트 스키마를 zod로 확정~~ ✅ 완료 — `ExecutionProgressEventSchema`가 A↔B 계약이다. 변경 시 팀 전체 공지.
2. ~~**B는 A를 기다리지 않는다:** mock 라우트 선행 커밋~~ ✅ 완료 — B는 mock 라우트(`app/api/**`)를 상대로 UI를 개발한다. A는 mock을 실제 구현으로 교체할 때 응답 형태를 유지한다.
3. ~~**C는 인터페이스가 이미 있다**~~ ✅ 완료 — memory·Cosmos 구현이 모두 존재하며 `store-factory`로 전환한다. A·B는 Azure 없이 memory-store로 작업한다.

### 2.2 통합 지점

| 단계 | 내용 |
| --- | --- |
| 1차 통합 | A의 실제 파이프라인 + B의 UI를 memory-store로 연결, 로컬 E2E(시작→영수증) 통과 |
| 2차 통합 | C의 Cosmos DB·Foundry·배포를 연결, Azure에서 동일 시나리오 재현 |
| 버퍼 작업 | Judge Mode는 인증이 없어 의존성이 가장 적으므로 먼저 끝난 사람이 담당 |

## 3. 브랜치 전략

모든 작업은 브랜치를 만들어 작업하고 `main`으로 merge하는 방식으로 진행한다. `main` 직접 커밋을 금지한다.

### 3.1 브랜치 규칙

| 브랜치 | 용도 | 예시 |
| --- | --- | --- |
| `main` | 항상 배포 가능한 상태 유지 | — |
| `feat/api-*` | A 담당 기능 | `feat/api-executions`, `feat/api-sse-stream`, `feat/api-oauth` |
| `feat/ui-*` | B 담당 기능 | `feat/ui-start-flow`, `feat/ui-approval`, `feat/ui-receipt` |
| `feat/infra-*` | C 담당 기능 | `feat/infra-bicep`, `feat/infra-cosmos-store`, `feat/infra-foundry` |
| `docs/*` | 문서 변경 | `docs/plan` |
| `fix/*` | 버그 수정 | `fix/approval-token-expiry` |

### 3.2 merge 규칙

- 브랜치는 **작게, 하루 이상 유지하지 않는다.** 기능 단위로 쪼개 자주 merge한다.
- merge 전 `npx vitest run` 통과를 필수로 한다.
- 공유 접점(`lib/contracts/schemas.ts`, `lib/store/execution-store.ts`) 변경은 merge 전에 팀 전체에 공지한다.
- 충돌 예방: 각자 자기 영역 디렉터리만 수정하고, 공유 파일 수정이 필요하면 별도 브랜치로 분리해 우선 merge한다.
- merge 후 브랜치는 삭제한다.

### 3.3 작업 흐름

```bash
git switch main && git pull
git switch -c feat/api-executions   # 브랜치 생성
# ... 작업 + 커밋 ...
npx vitest run                      # 테스트 통과 확인
git switch main && git pull
git merge feat/api-executions       # (또는 PR 생성 후 merge)
git branch -d feat/api-executions
```

## 4. 커밋 컨벤션

기존 이력을 따라 `타입: 한국어 요약` 형식을 사용한다.

| 타입 | 용도 |
| --- | --- |
| `feat` | 기능 추가 |
| `fix` | 버그 수정 |
| `docs` | 문서 변경 |
| `test` | 테스트 추가·수정 |
| `chore` | 빌드·설정 변경 |
