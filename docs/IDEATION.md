# 최종 아이디어 선정: First Move

> 팀 후보 3개를 [SCORING.md](SCORING.md) 기준으로 비교해 mata의 **First Move**를 최종 아이디어로 선정한다.

## 1. 최종 아이디어 한 줄 요약

아침에 `하루 시작` 버튼 하나를 누르면, 밤사이 바뀐 것을 수집하고 오늘의 우선 행동 3개를 제안하며, 승인한 준비 작업을 대신 실행하고 결과를 검증해 **증거 영수증**을 발급하는 개인 업무 시동 에이전트.

- 해결하는 문제: 매일 아침 업무 시동에 소모되는 **평균 30분**의 반복 작업
- 목표: 버튼 1개 → 승인 1회 → 영수증 확인의 3단계로 시동 시간을 **90초 이하**로 단축
- 핵심 흐름: `Scout(병렬 수집) → Compiler(실행 계약) → Policy(안전 검사) → 사용자 승인 → Executor(실행) → Verifier(결정적 검증)`

## 2. 후보 비교

| 영역 (배점) | mata: First Move | kh: CareerCompass | hodu: LifeBooking |
| --- | --- | --- | --- |
| AGENT1 SDK·Framework (25) | 5개 에이전트 + 승인 게이트, 필수 경로에서 실행 | 5개 에이전트 + 반환 분기 (범위 축소 후) | 5개 에이전트, 구조 동등 |
| AGENT2 생산성 (18) | **매일 반복** 문제 → 팀원 4명 일일 실사용으로 20회+ 실측 자동 축적 | 일회성 작업이라 별도 A/B 실험 필요 (10회 목표) | 동일 루틴 10회 표본을 해커톤 기간 내 확보 불가 |
| AGENT3 Azure (18) | 5개 서비스, 실행 증거 명확 | 6개 서비스, 핵심 가치 기여 | 8개 서비스이나 핵심이 외부 예약 API에 의존 |
| AGENT4 완성도 (16) | **필수 연동 GitHub 1개** → 완성 위험 최소, Judge Mode로 재현성 입증 | 축소 후 완주 위험 낮음, 합성 데이터로 통제 가능 | **공식 예약 API 확보가 전제** — 실패 시 핵심 흐름 붕괴 |
| AGENT5 UX (12) | 버튼 1개→승인 1회→영수증, 가장 단순 | 3단계 고정, 동등 | 워치 승인은 참신하나 폴백 변수 많음 |
| AGENT6 책임·보안 (6) | 충족 | 충족 (가장 상세) | 결제·예약이라 리스크 표면적 최대 |
| AGENT7 혁신성 (5) | Judge Mode + 결정적 영수증 | Evidence Lock + No-Fiction Verifier | Slot Watch + Watch Approval |

## 3. 선정 근거

1. **AGENT2 (18점)에서 유일하게 실측 데이터가 자연 축적된다.** "매일 아침"이라는 반복 문제라서 팀원 4명이 개발 기간 동안 쓰기만 해도 심사 시점에 20회 이상의 일별 실측이 대시보드에 쌓인다. CareerCompass는 별도 A/B 실험을 수행해야 하고, LifeBooking은 표본 확보가 기간 내 불가능해 "설명만 있으면 배점의 40% 상한" 규정에 노출된다.

2. **AGENT4 완성 위험이 가장 낮다.** 필수 외부 연동이 GitHub 하나뿐이며, LifeBooking의 최대 리스크(공식 예약 API 확보)는 팀이 통제할 수 없는 외부 변수다. 핵심 흐름 미실행 시 기능 완성도가 최대 4점으로 제한되는 규정에 정면으로 노출된다.

3. **Judge Mode가 AI 심사에 최적화되어 있다.** 심사위원이 임의 공개 GitHub 저장소 URL로 전체 흐름을 즉석 재현할 수 있어, "저장소나 데모에서 확인할 수 없는 기능은 인정하지 않는다"는 심사 원칙을 정면으로 충족한다.

### 다른 후보의 판단

- **CareerCompass** — 문서 완성도와 책임 있는 AI 설계가 가장 좋다. 범위 축소(DI·AI Search·PDF 제거, 6→5 에이전트) 후 완주 위험은 First Move 수준까지 내려갔으나, AGENT2 증거를 위해 별도 A/B 실험 10회를 확실히 수행할 수 있을 때만 우위가 있다.
- **LifeBooking Agent** — 혁신성과 일상적 가치는 가장 높지만 공식 예약 API, 실제 재고·가격, 결제·취소, 워치 동작, 반복 표본 수가 모두 외부 조건에 의존한다. API 미확보 시 AGENT3·AGENT4에서 큰 감점이 예상된다.

## 4. 최종 아이디어 핵심 설계

### 4.1 에이전트 구성 (Copilot SDK + Microsoft Agent Framework)

| 에이전트 | 역할 |
| --- | --- |
| Scout Agent | 밤사이 GitHub 변경과 ICS 일정 병렬 수집 |
| Compiler Agent | 실행 계약과 우선 행동 3개 컴파일 (근거 링크 필수) |
| Policy Agent | 금지 범위·권한·프롬프트 인젝션 검사 |
| Executor Agent | 승인 토큰이 있는 노드만 실행 |
| Verifier Agent | 결정적 규칙으로 성공 조건 검증, 증거 영수증 발급 |

### 4.2 100점을 만드는 4개 장치

1. **증거 자동 생성** — 팀원 4명의 일일 실사용으로 심사 시점에 20회+ 실측 데이터 축적
2. **Judge Mode** — 임의 공개 저장소 URL로 즉석 재현, 하드코딩 의심 원천 차단
3. **결정적 검증** — LLM 판단이 아닌 규칙 기반 Verifier (URL 실존, 생성물 API 재조회, 금지 행동 부재, 승인 해시 일치, 90초 타이머)
4. **단일 필수 연동** — GitHub 하나, 캘린더는 읽기 전용 ICS로 대체

### 4.3 Azure 아키텍처

App Service (Next.js) · Microsoft Foundry 모델 배포 · Cosmos DB · Key Vault · Application Insights — 모든 단계는 하나의 `executionId` trace로 연결한다.

## 5. 후속 문서

| 문서 | 내용 |
| --- | --- |
| [PRD.md](PRD.md) | 기능 요구사항 FR-01~24, 비범위, 마일스톤 M1~M6 |
| [TRD.md](TRD.md) | 아키텍처, 에이전트 파이프라인, API·데이터 모델, Verifier 규칙, 구현 게이트 |
| [mata/IDEATION_FINAL.md](mata/IDEATION_FINAL.md) | First Move 아이디어 원문 |
| [kh/IDEATION_FINAL.md](kh/IDEATION_FINAL.md) | CareerCompass (범위 축소 반영) |
| [hodu/IDEATION_FINAL.md](hodu/IDEATION_FINAL.md) | LifeBooking Agent |
| [SCORING.md](SCORING.md) | 채점 규정 |
