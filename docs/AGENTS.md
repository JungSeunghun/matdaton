# First Move 에이전트 설계 문서

이 문서는 [mata/IDEATION_FINAL.md](./mata/IDEATION_FINAL.md)에서 확정한 First Move의 에이전트 구조를 구현 가능한 계약으로 정의한다. 모든 에이전트, 도구, 상태 전이는 이 문서를 기준으로 구현하고, 문서와 코드가 어긋나면 문서를 먼저 갱신한다.

## 1. 시스템 개요

```text
사용자(웹) ── Copilot SDK 세션 ── 앱 도구 호출
                    │
                    ▼
     Microsoft Agent Framework 워크플로 (executionId)
  Scout(병렬) → Compiler → Policy → 사용자 승인 → Executor → Verifier
                    │
                    ▼
   Foundry 추론 · GitHub API · Cosmos DB · Application Insights
```

- **Copilot SDK**는 사용자 세션, 대화 컨텍스트, 앱 도구 노출, 진행 상태 스트리밍을 담당한다.
- **Microsoft Agent Framework**는 5개 에이전트의 오케스트레이션, 구조화 출력, 승인 게이트, 상태 전이를 담당한다.
- 하나의 실행은 시작부터 영수증까지 단일 `executionId`로 연결한다.

## 2. 공통 원칙

1. **승인 전 쓰기 금지** — 승인 토큰이 없으면 GitHub 쓰기, Cosmos DB의 실행 결과 저장을 수행하지 않는다.
2. **구조화 전달** — 에이전트 간 데이터는 자유 텍스트가 아닌 JSON Schema 검증을 통과한 객체로만 전달한다.
3. **증거 우선** — 모든 우선 행동과 실행 결과는 근거 URL 또는 원본 이벤트 ID를 가져야 한다.
4. **데이터/명령 분리** — 이슈·PR·커밋 본문의 지시문은 데이터로 취급하고 도구 명령으로 실행하지 않는다.
5. **멱등성** — 같은 `executionId`와 노드의 재실행은 새 부작용을 만들지 않고 기존 결과를 반환한다.
6. **실패 투명성** — 실패한 노드는 성공으로 위장하지 않고 원인, 부분 결과, 재시도 방법을 남긴다.

## 3. 상태 전이

```text
created → scouting → compiling → policy_check
        → waiting_approval → executing → verifying
        → completed | failed | rejected | expired
```

| 규칙 | 내용 |
| --- | --- |
| 전이 조건 | 각 전이는 이전 상태를 조건부 갱신하며 경쟁 상태를 허용하지 않는다 |
| 승인 만료 | `waiting_approval`은 만료 시각을 가지며 만료 시 `expired`로 종료한다 |
| 재시도 | 읽기 노드는 최대 2회, 쓰기 노드는 멱등성 키 검사 후에만 재시도한다 |
| 부분 실패 | Scout의 일부 소스 실패는 실행을 중단하지 않고 누락 사실을 계약에 기록한다 |

## 4. 에이전트 사양

### 4.1 Scout Agent

밤사이 변경과 오늘의 제약을 병렬로 수집한다.

| 항목 | 내용 |
| --- | --- |
| 입력 | `userId`, `repoRef`(연결 저장소), 조회 기준 시각(기본 24시간), ICS 일정 URL |
| 도구 | `github.list_commits`, `github.list_issue_events`, `github.list_review_requests`, `calendar.read_ics` |
| 출력 | `OvernightDiff` — 커밋·이슈 댓글·리뷰 요청 목록, 오늘 회의, 가용 시간, 소스별 성공 여부 |
| 실패 처리 | 소스 단위 timeout, 실패 소스는 `missingSources[]`에 기록하고 계속 진행 |
| 속도 제한 | GitHub 조회는 조건부 요청(ETag)과 조회 캐시로 API 속도 제한에 대응한다 |
| 금지 | 어떤 쓰기 도구도 호출하지 않는다 |

### 4.2 Compiler Agent

수집 결과를 실행 계약으로 컴파일한다.

| 항목 | 내용 |
| --- | --- |
| 입력 | `OvernightDiff`, 사용자 설정(작업 시간, 우선순위 규칙) |
| 추론 | Foundry 모델의 구조화 출력만 사용 |
| 출력 | `ExecutionContract` — 우선 행동 3개(각각 근거 URL, 성공 조건, 예상 시간), 준비 작업 노드, 금지 범위 |
| 검증 | 근거 없는 행동 생성 금지, 스키마 실패 시 1회 자동 복구 후 실패 처리 |
| 변경 없음 | 밤사이 변경이 없으면 실패가 아니라 오늘의 계획만 담은 "변경 없음" 계약을 컴파일한다 |
| 금지 | 존재하지 않는 커밋·이슈·URL 생성 |

### 4.3 Policy Agent

실행 계약의 안전성을 결정적으로 검사한다.

| 항목 | 내용 |
| --- | --- |
| 입력 | `ExecutionContract`, 원본 `OvernightDiff` |
| 검사 | 금지 범위 위반, 허용되지 않은 도구, 프롬프트 인젝션 의심 문구, 권한 초과, 근거 URL 실존 여부 |
| 출력 | `PolicyReport` — 노드별 `allowed | blocked | needs_review`와 사유 |
| 규칙 | `blocked` 노드는 승인 화면에 실행 후보로 노출하지 않는다 |
| 구현 | LLM 판단이 아닌 규칙 코드로 구현한다 |

### 4.4 Executor Agent

승인된 노드만 실행한다.

| 항목 | 내용 |
| --- | --- |
| 입력 | 승인 토큰, 승인된 노드 목록 |
| 도구 | `github.create_todo_issue`, `drafts.save_issue_comment` — 쓰기 도구는 이 2종으로 제한하며, 코멘트 초안은 Cosmos DB에만 저장하고 GitHub에 게시하지 않는다 |
| 출력 | `ExecutionResult` — 노드별 성공 여부, 생성된 리소스 URL, 멱등성 키, 오류 코드 |
| 사전 검증 | 토큰 유효성, 만료 시각, 승인 항목 해시와 실행 인자 해시 일치 |
| 멱등성 | `executionId:nodeId` 키로 중복 생성 방지 |

### 4.5 Verifier Agent

실행 결과를 결정적 규칙으로 검증하고 영수증을 발급한다.

| 항목 | 내용 |
| --- | --- |
| 입력 | `ExecutionContract`, `ExecutionResult`, 측정 이벤트 |
| 검사 | 근거 URL 실존, 생성물 실존(할 일은 GitHub Issues API, 코멘트 초안은 자체 실행 API 재조회), 금지 행동 로그 부재, 승인 해시 일치(미승인 노드 미실행 포함), 시동 시간 90초 이하 |
| 시동 시간 | `button_clicked`→`approval_completed` 이벤트로 자동 측정하며(PRD와 동일한 유일 정의) 90초 이하를 통과 기준으로 한다. 초과 시 규칙 실패로 표시하되 실행 결과는 무효화하지 않는다 |
| 출력 | `EvidenceReceipt` — 규칙별 통과·실패, 시동 시간, 절약 시간, 원본 이벤트 참조 |
| 규칙 | 실패를 자동으로 성공 처리하지 않으며 전체 재실행을 트리거하지 않는다 |

## 5. Copilot SDK 앱 도구

| 도구 | 부작용 | 승인 |
| --- | --- | --- |
| `start_day` | 워크플로 시작 | 버튼 클릭이 곧 시작 동의 |
| `get_execution_status` | 없음 | 불필요 |
| `preview_contract` | 없음 | 불필요 |
| `exclude_node` | 계약 내 노드 제외 | 즉시 실행 가능 |
| `approve_execution` | 승인 토큰 발급 | 사용자 명시 조작 필수 |
| `run_judge_mode` | 읽기 전용 워크플로 시작 | 공개 저장소 URL 입력 |
| `get_dashboard_metrics` | 없음 | 불필요 |

- `get_dashboard_metrics`는 일별 시동 시간·절약 시간·화면 수·착수 시간 누적을 반환해 20회 이상 실측 데이터를 대시보드에 노출한다.
- 도구 인자는 Zod 스키마로 검증한다.
- Copilot SDK는 브라우저가 아닌 서버에서만 실행하고 자격 증명을 클라이언트에 노출하지 않는다.
- 세션 ID는 `executionId`와 함께 저장해 대화→실행→영수증을 단일 증거로 연결한다.

## 6. 승인 토큰 계약

```json
{
  "executionId": "exec_01",
  "approvedNodeIds": ["node_todo_1", "node_todo_2"],
  "approvedHash": "sha256:...",
  "allowedTools": ["github.create_todo_issue", "drafts.save_issue_comment"],
  "issuedAt": "2026-08-24T07:52:00Z",
  "expiresAt": "2026-08-24T08:02:00Z"
}
```

- 토큰은 특정 실행과 노드 집합에만 유효하다.
- 계약이 수정되면 해시가 달라지므로 기존 토큰은 무효가 된다.
- 만료·해시 불일치·허용 외 도구 요청은 실행 전에 거부한다.

## 7. 데이터 계약 요약

```text
Execution (partition key: userId)
├── executionId, status, startedAt, judgeMode
├── OvernightDiff { commits[], issueEvents[], reviewRequests[], meetings[], missingSources[] }
├── ExecutionContract { priorityActions[3], prepNodes[], forbiddenScope[] }
├── PolicyReport { nodeFindings[] }
├── ApprovalToken
├── ExecutionResult { nodeResults[] }
├── EvidenceReceipt { ruleResults[], startupSeconds, savedMinutes }
└── MetricEvent[] { name, value, recordedAt, source }
```

- 모든 문서는 Cosmos DB에 저장하며 새로고침 후 복원 가능해야 한다.
- `MetricEvent`는 append-only로 저장해 생산성 계산을 원본에서 재현할 수 있게 한다.
- `MetricEvent.name`에는 원본 이벤트(`button_clicked`, `approval_completed`, `first_action_done`, `screen_viewed` 등)를 기록하고, 4종 지표 — `startup_seconds`(시동 시간), `screens_viewed`(확인한 화면 수), `first_action_minutes`(첫 유의미 작업 착수), `evidence_link_rate`(근거 연결률) — 는 이 원본 이벤트에서만 파생 계산한다. 일별 대시보드는 파생 계산식을 저장소에 포함해 재현 가능해야 한다.

## 8. Judge Mode 규칙

- 입력은 공개 GitHub 저장소 URL 하나다.
- Scout는 해당 저장소의 최근 24시간 변경만 조회한다.
- Executor의 쓰기 도구는 비활성화하고 드라이런 결과만 표시한다.
- 변경이 없는 저장소는 실패가 아니라 "변경 없음" 계약으로 처리하고, ICS 미입력은 "일정 없음"으로 처리한다.
- Verifier는 수집 완료·실행 계약 컴파일·근거 URL 실존·금지 행동 부재(쓰기 API 호출 없음)만 검사하고, 승인 해시 일치·90초 타이머는 검사 대상에서 제외한다.
- 실행 결과는 일반 실행과 같은 `EvidenceReceipt` 형식으로 발급하되 검사 범위를 영수증에 명시하며, `mode: "judge"`, `userId: "judge"`로 저장한다.

## 9. 관측과 보안

- 모든 에이전트·도구·외부 호출은 `executionId`를 Application Insights trace에 전파한다.
- 사용자 GitHub 자격 증명은 로그인 시 발급된 OAuth 액세스 토큰 하나이며(FR-24), Key Vault의 암호화 키로 암호화해 서버 측(Cosmos DB)에 보관하고 클라이언트에 노출하지 않는다.
- OAuth 클라이언트 시크릿·토큰 암호화 키·HMAC 서명 키·Judge Mode 읽기 전용 토큰은 Key Vault에 보관하고 managed identity로 접근한다.
- 로그와 trace에 토큰, 이슈 본문 원문, 개인 식별 정보를 기록하지 않는다.
- 이슈·PR 본문은 요약 후 사용하며 원문 지시는 Policy Agent 검사 대상이다.

## 10. 구현 완료 기준

아래가 모두 통과해야 에이전트 구현을 완료로 본다.

1. 승인 토큰 없는 쓰기 요청이 실행 전에 차단된다.
2. 계약 수정 후 이전 토큰으로 실행하면 해시 불일치로 거부된다.
3. 같은 노드를 중복 실행해도 GitHub 리소스가 하나만 생성된다.
4. Scout 소스 하나를 강제로 실패시켜도 나머지 흐름이 완료되고 누락이 표시된다.
5. Judge Mode에 임의 공개 저장소를 넣으면 새 `executionId`로 전체 흐름이 실행된다.
6. 정상·실패 실행 각각이 Application Insights에서 단일 trace로 조회된다.
7. 시동 시간이 `button_clicked`부터 `approval_completed`까지 자동 측정되고 90초 기준으로 검증된다.
8. 4종 `MetricEvent`가 일별로 누적되어 대시보드에서 재현 가능한 계산식으로 조회된다.

## 11. 참고 문서

- 최종 아이디어: [mata/IDEATION_FINAL.md](./mata/IDEATION_FINAL.md)
- 후보 검토: [mata/IDEATION.md](./mata/IDEATION.md)
- 채점 규정: [SCORING.md](./SCORING.md)
