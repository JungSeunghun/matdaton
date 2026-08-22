# API 설계 — 프론트(B) ↔ 백엔드(A) 계약

> mock 라우트(`app/api/**`)와 실제 구현이 공유하는 얇은 API 계약 문서. 응답 형태는 mock → 실제 교체 후에도 유지된다 ([PLAN.md](PLAN.md) 2.1).

| 항목 | 내용 |
| --- | --- |
| 기준 문서 | [TRD.md](TRD.md) 4장, [AGENTS.md](AGENTS.md) |
| 타입 원본 | `lib/contracts/schemas.ts` (zod) — 이 문서와 충돌 시 schemas.ts가 우선 |

## 1. 공통 규칙

- 모든 응답은 JSON (SSE 제외). 시각은 ISO 8601 UTC 문자열.
- 인증: GitHub OAuth 세션 쿠키(서명됨, HttpOnly). Judge Mode(`/api/judge`)와 `/api/health`만 무인증.
- 오류 응답 형태:

```json
{ "error": { "code": "not_found", "message": "사람이 읽을 설명" } }
```

| 상태 코드 | 사용처 |
| --- | --- |
| `400` | body 검증 실패 (zod 오류) |
| `401` | 세션 없음·만료 |
| `403` | 승인 토큰 위반(만료·해시 불일치·미승인 노드·차단 노드 승인 시도) — 감사 로그 기록 |
| `404` | 실행/영수증 없음 (다른 사용자의 실행 포함) |
| `409` | 상태 기계상 불가능한 요청 (예: `waiting_approval`이 아닌데 approve) |

## 2. 엔드포인트

### 2.1 인증

| 메서드·경로 | 요청 | 응답 |
| --- | --- | --- |
| `GET /api/auth/login` | — | GitHub OAuth authorize로 302 |
| `GET /api/auth/callback` | `?code=` | 세션 쿠키 설정 후 `/`로 302 |
| `POST /api/auth/logout` | — | `204`, 쿠키 삭제 |
| `GET /api/auth/me` | — | `200` `{ userId, login }` / `401` |

### 2.2 실행 파이프라인

| 메서드·경로 | 요청 body | 성공 응답 | 오류 |
| --- | --- | --- | --- |
| `POST /api/executions` | `{ repoRef?, icsUrl? }` (미지정 시 서버 기본값) | `201` `Execution` (status `created`) — 이후 파이프라인은 백그라운드 진행, 진행 상황은 SSE로 수신 | `401` |
| `GET /api/executions/:id` | — | `200` `Execution` (새로고침 복원용 전체 스냅샷) | `401` `404` |
| `GET /api/executions/:id/stream` | — | SSE (아래 3장) | `401` `404` |
| `POST /api/executions/:id/approve` | `{ approvedNodeIds: string[] }` | `200` `Execution` (`approval` 포함, 실행·검증 완료 후 status `completed`) | `401` `403` `404` `409` |
| `POST /api/executions/:id/retry/:nodeId` | — | `200` `{ executionId, nodeId, status: NodeResult["status"] }` | `401` `403`(토큰 만료) `404` `409` |
| `GET /api/executions/:id/receipt` | — | `200` `EvidenceReceipt` | `401` `404`(영수증 미발급) |

### 2.3 기타

| 메서드·경로 | 요청 | 성공 응답 |
| --- | --- | --- |
| `GET /api/metrics/daily?days=7` | — | `200` `DailyMetrics[]` — `{ date, startupSeconds, savedMinutes, screensViewed, firstActionMinutes }[]` (미측정 값은 `null`) |
| `POST /api/judge` | `{ repoUrl }` | `200` `Execution` (`mode: "judge"`, `userId: "judge"`, 읽기 전용으로 검증까지 완주한 최종 상태) |
| `GET /api/health` | — | `200` `{ status: "ok" }` |

## 3. SSE 계약 (`GET /api/executions/:id/stream`)

- `Content-Type: text/event-stream`, 각 메시지는 `data: <JSON>\n\n`.
- 이벤트 스키마는 `ExecutionProgressEventSchema` discriminated union 그대로:

| type | 추가 필드 |
| --- | --- |
| `stage_changed` | `stage: ExecutionStatus` |
| `agent_started` / `agent_completed` | `agent: "scout"\|"compiler"\|"policy"\|"executor"\|"verifier"` |
| `tool_called` | `tool: string`, `agent?` |
| `node_completed` | `nodeId` |
| `node_failed` | `nodeId`, `reason` |

- 접속 직후 서버는 현재 상태를 담은 `stage_changed` 1건을 먼저 보낸다 (늦게 접속해도 상태 동기화).
- 터미널 상태(`completed`·`failed`·`rejected`·`expired`) 도달 시 서버가 스트림을 닫는다. `waiting_approval`에서는 유지.
- 15초 간격 keep-alive 주석(`: ping`) 전송.

## 4. 프론트 표준 플로우

```text
POST /api/executions ──201──▶ GET :id/stream 구독
        │                        │ stage_changed … waiting_approval
        ▼                        ▼
GET :id (계약·정책 렌더) ──▶ 노드 선택 ──▶ POST :id/approve
        │                        │ (스트림으로 executing/verifying/completed 수신)
        ▼                        ▼
GET :id/receipt ◀── completed    실패 노드만 POST :id/retry/:nodeId
```

- Judge Mode: `POST /api/judge` 단건 호출로 완료 (승인·SSE 불필요, 응답에 receipt 포함).
- 대시보드: `GET /api/metrics/daily`.

## 5. 핵심 타입 참조 (schemas.ts)

| 타입 | 요약 |
| --- | --- |
| `Execution` | `{ id, userId, repoRef, mode, status, startedAt, overnightDiff?, contract?, contractHash?, policyReport?, approval?, excludedNodeIds?, executionResult?, toolCallLog?, receipt?, failure?, traceId }` |
| `ExecutionContract` | `actions[3]` (근거 URL 포함) + `prepNodes[]` (쓰기 도구 미리보기) + `forbiddenScope[]` + `noChanges` |
| `PolicyReport` | `nodeFindings[]: { nodeId, verdict: allowed\|blocked\|needs_review, reasons[] }` — `blocked` 노드는 승인 불가 |
| `ApprovalToken` | `{ executionId, approvedNodeIds, approvedHash, allowedTools, issuedAt, expiresAt, signature }` (TTL 10분) |
| `EvidenceReceipt` | `{ executionId, mode, ruleResults[], checkedScope[], startupSeconds, savedMinutes, issuedAt }` |
| `NodeResult.status` | `succeeded \| failed \| skipped` — `failed`만 재시도 버튼 노출 |

## 6. 현행 mock의 알려진 편차 (실제 구현 시 이 문서·schemas.ts 기준으로 수정)

프론트는 아래 항목에 한해 **mock이 아니라 이 문서를 기준**으로 구현할 것. mock 교체 시 함께 정정된다.

| 위치 | 편차 → 정본 |
| --- | --- |
| `mockPolicyReport` | `findings`·`blockedNodes` → `nodeFindings[]` (blocked는 `verdict`로 판별) |
| `mockContract` | action의 `forbidden[]` 제거, `estimatedMinutes` 필수, 계약 레벨 `prepNodes`·`forbiddenScope`·`noChanges` 필수, `contractHash`는 `Execution` 레벨 |
| `mockReceipt` | `rules` → `ruleResults`, `checkedScope[]` 필수 |
| `mockExecution` | `startedAt` 필수 |
| approve 응답 | `approval: { token, approvedNodeIds }` 중첩 → `approval: ApprovalToken` 직접 |
| retry 응답 | `status: "completed"` → `NodeResult["status"]` (`succeeded\|failed\|skipped`) |
| metrics 응답 | `screensViewed`·`firstActionMinutes` 필드 추가 |
| judge 응답 | `waiting_approval` 중단 → 검증 완주 상태 + `receipt` 포함 |
| stream | `waiting_approval`에서 즉시 close → 유지 + 15초 `: ping` |
