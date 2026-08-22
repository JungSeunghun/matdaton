# DESIGN.md — First Move

> 매일 아침 하루의 첫 30분을 90초로 컴파일하는 개인 업무 시동 에이전트의 디자인 계약.
> 참조: [getdesign.md ElevenLabs 분석](https://getdesign.md/elevenlabs/design-md)의 에디토리얼 오프화이트 언어 + `design-guide-agent` 스킬의 디자인 계약 불변식.

## 0. 디자인 원칙

가이드는 정답지가 아니라 반복되는 결정을 줄이는 기준이다.

1. **화면당 주요 액션 1개** — 아침 화면의 주인공은 `하루 시작` 버튼 하나다. 나머지는 전부 보조.
2. **잉크 단일 CTA** — 채도 높은 브랜드 액션 컬러를 쓰지 않는다. 잉크 필 버튼이 유일한 강조.
3. **장식 금지** — 요청되지 않은 그림자, 그라디언트, 장식 색을 추가하지 않는다. 깊이는 헤어라인과 단일 소프트 섀도 1단계로만 표현한다.
4. **증거가 곧 장식** — 화려한 효과 대신 근거 링크, 타이머, 규칙 통과 배지 같은 증거 요소가 화면의 밀도를 만든다.
5. **시맨틱 컬러 독립** — Error·Warning·Success·Info는 브랜드 잉크와 독립적으로 유지한다.

## 1. 컬러 팔레트

### 브랜드 (잉크 필)

| 토큰 | 값 | 용도 |
| --- | --- | --- |
| `brand-primary` | `#292524` | 잉크 필 — `하루 시작`·`승인` 주요 CTA |
| `brand-hover` | `#1C1917` | 호버 |
| `brand-pressed` | `#0C0A09` | 프레스 |
| `brand-subtle` | `#F0EFED` | 선택된 노드 배경, 배지 플레이트 |

### 서피스

| 토큰 | 값 | 용도 |
| --- | --- | --- |
| `canvas` | `#F5F5F5` | 오프화이트 페이지 바닥 |
| `canvas-soft` | `#FAFAFA` | 교차 밴드 |
| `surface-card` | `#FFFFFF` | 카드 (Diff 카드, 영수증) |
| `surface-strong` | `#F0EFED` | 아이콘 플레이트, 비활성 노드 |
| `surface-dark` | `#0C0A09` | 증거 영수증 헤더, 강조 밴드 |

### 텍스트·헤어라인

| 토큰 | 값 | 용도 |
| --- | --- | --- |
| `ink` | `#0C0A09` | 디스플레이·본문 제목 |
| `body` | `#4E4E4E` | 기본 본문 |
| `muted` | `#6B655D` | 캡션, 보조 설명 — canvas 위 4.5:1 이상 확보 |
| `muted-soft` | `#A8A29E` | 비활성 텍스트 |
| `hairline` | `#E7E5E4` | 1px 구분선 |
| `hairline-strong` | `#D6D3D1` | 패널 외곽선 |
| `text-inverse` | `#FFFFFF` | 다크 서피스 위 텍스트 |

### 시맨틱 (브랜드와 독립)

| 토큰 | 값 | 용도 |
| --- | --- | --- |
| `success` | `#16A34A` | Verifier 규칙 통과, 절약 시간 |
| `error` | `#DC2626` | 규칙 실패, 차단된 노드 |
| `warning` | `#D97706` | 승인 대기, 부분 실패 |
| `info` | `#4785FF` | 진행 중 상태, trace 링크 |

### 파스텔 오브 (분위기 전용)

새벽→아침 전환을 암시하는 장식. **버튼 채움, 텍스트 색, 컴포넌트 배경으로 절대 사용 금지.** 히어로와 빈 상태 배경에서만 소프트 래디얼 블룸으로 사용한다.

| 토큰 | 값 |
| --- | --- |
| `orb-dawn-lavender` | `#C8B8E0` |
| `orb-dawn-sky` | `#A8C8E8` |
| `orb-morning-peach` | `#F4C5A8` |

## 2. 타이포그래피

서체: **Pretendard** (한글 최적화). 디스플레이는 Light 300으로 에디토리얼 톤을 유지하고, UI 레이블은 Medium 이상으로 판독성을 확보한다.

| 스타일 | 크기/두께/행간/자간 | 용도 |
| --- | --- | --- |
| `display-xl` | 48px / 300 / 1.08 / -0.96px | 히어로 "오늘의 첫 수를 두세요" (데스크톱) |
| `display-lg` | 36px / 300 / 1.17 / -0.36px | 섹션 제목 |
| `section-title` | 28px / 700 / 1.25 / -0.5px | 대시보드·영수증 섹션 (모바일 공용) |
| `title-md` | 20px / 500 / 1.35 | 카드 제목, 우선 행동 이름 |
| `body-emphasis` | 20px / 600 / 1.25 / -0.5px | 시동 시간 84초 같은 핵심 수치 |
| `body` | 16px / 400 / 1.5 / 0.16px | 기본 본문 |
| `helper` | 15px / 400 / 1.47 / 0.15px | 근거 설명, 폼 도움말 |
| `caption` | 14px / 500 / 1.4 | 메타데이터, 타임스탬프 |
| `caption-upper` | 12px / 600 / 1.4 / 0.96px | `OVERNIGHT DIFF` 섹션 라벨 (대문자) |
| `fixed-minimum` | 12px / 400 / 20px | 데스크톱 최소 크기 — 이보다 작게 금지 |
| `mobile-minimum` | 11px / 400 / 16px | 모바일 최소 크기 — 이보다 작게 금지 |

## 3. 버튼

잉크 필 primary + 투명 아웃라인 secondary. 채도 있는 CTA 컬러 없음.

| 버튼 | 스펙 | 예시 |
| --- | --- | --- |
| `button-primary` | 잉크 필 / radius 9999px / 높이 48px(데스크톱 CTA)·52px(모바일 전체폭) | `하루 시작`, `승인하고 실행` |
| `button-primary-active` | `#0C0A09` 프레스 상태 | — |
| `button-outline` | 투명 + 1px `hairline-strong` / radius 9999px / 높이 40px | `드라이런 다시 보기`, `Judge Mode` |
| `button-tertiary-text` | 인라인 잉크 텍스트 + `→` | `근거 열기 →`, `trace 보기 →` |
| `button-danger-outline` | 투명 + 1px `error` 보더, `error` 텍스트 | `이 노드 제외` |

- 한 화면에 `button-primary`는 1개만 존재한다.
- 파괴·제외 행동은 filled danger가 아닌 outline danger로 한 단계 낮춰 표현한다.
- 최소 터치 타깃 44px (패딩 포함).

## 4. 핵심 컴포넌트

### 4.1 하루 시작 히어로

- `canvas` 바닥 + 파스텔 오브 1~2개 (좌상단 lavender, 우하단 sky)
- `display-xl` 인사말 + 마지막 실행 요약 캡션
- 중앙에 `button-primary` `하루 시작` 단독 배치
- 실행 중에는 버튼이 진행 타이머(경과 초)로 전환

### 4.2 Overnight Diff 카드

수집 결과를 소스별 흰색 카드로 나열. ElevenLabs voice-row 패턴 차용.

```text
[아이콘 플레이트 32px] 커밋 3건 · feat: verifier 규칙 추가 외 2
                       근거 열기 →                    [02:14 KST]
────────────────────────────────────────── hairline
[아이콘 플레이트 32px] 리뷰 요청 1건 · #128 영수증 스키마
```

- 행 높이 최소 56px, 헤어라인 구분, radius 16px 카드
- 모든 행에 `button-tertiary-text` 근거 링크 필수 (근거 없는 행 렌더링 금지)

### 4.3 실행 계약 캔버스 (드라이런)

- 우선 행동 3개를 세로 카드 스택으로 표시. 카드당: 제목(`title-md`) + 성공 조건 목록 + 예상 도구 호출
- 각 카드 우상단에 토글 — 끄면 `surface-strong` 배경 + `muted-soft` 텍스트로 비활성화 (삭제가 아닌 제외)
- 금지 범위는 카드 하단에 `caption` + `error` 아이콘으로 항상 노출
- 하단 고정 바: 좌측 `n개 노드 실행 예정` 요약, 우측 `button-primary` `승인하고 실행`

### 4.4 승인 게이트 상태 배지

| 상태 | 색 | 표시 |
| --- | --- | --- |
| 수집 중 / 실행 중 | `info` | 펄스 도트 + 진행 텍스트 |
| 승인 대기 | `warning` | 배지 + 하단 고정 바 활성화 |
| 통과 / 완료 | `success` | 체크 배지 |
| 차단 / 실패 | `error` | 배지 + 원인 요약 + `재시도` outline 버튼 |

상태는 색만으로 구분하지 않고 항상 아이콘 + 텍스트 라벨을 병기한다 (접근성).

### 4.5 증거 영수증

- `surface-dark` 헤더: 시동 시간 84초(`body-emphasis`, `text-inverse`) + 절약 28분
- 본문: Verifier 규칙별 행 — 규칙 이름 / `success`·`error` 배지 / 근거 링크
- 푸터: `executionId`, trace 링크(`info`), 타임스탬프 (`caption`)
- 영수증은 프린트 스타일의 단일 컬럼, radius 16px, 소프트 섀도 1단계

### 4.6 누적 대시보드

- 일별 시동 시간 막대: `ink` 단색 막대 + `success` 절약 누적선. 장식 그라디언트 금지
- 표본 수·중앙값·관찰 기간을 차트와 같은 위계로 병기 (수치만 크게 띄우지 않음)
- 10회 미만이면 `warning` 배지 `데이터 수집 중` 표시

### 4.7 Judge Mode 입력

- 아웃라인 입력 필드 1개 (공개 저장소 URL) + `button-outline` `즉석 실행`
- 실행 중 각 에이전트 단계를 세로 타임라인으로 스트리밍 (Scout→Compiler→Policy→승인→Executor→Verifier)
- 실패 시 실패 단계만 `error`로 표시하고 부분 결과를 숨기지 않는다

### 4.8 섹션 탭 내비게이션 (스크롤 스파이)

긴 단일 페이지에서 현재 위치를 알려주는 상단 고정 탭 바.

- `position: sticky; top: 0` — 반투명 흰 배경(92%) + blur 8px + 하단 `hairline`
- 탭: pill(`radius-pill`) 텍스트 버튼, `caption` 크기 / `muted` 색. 최소 터치 타깃 44px
- 활성 탭: `brand-subtle` 배경 + `ink` 텍스트 + weight 600 — **잉크 필 금지** (primary CTA와 경쟁하지 않음)
- 활성 판정: IntersectionObserver로 뷰포트 상단 기준 가장 많이 보이는 섹션 1개만 활성. `aria-current`로 표기 (색만으로 구분 금지)
- 앵커 이동: `scroll-behavior: smooth` + 섹션에 `scroll-margin-top`(탭 바 높이 이상). `prefers-reduced-motion`이면 즉시 이동
- 좁은 화면: 탭 바는 가로 스크롤(스크롤바 숨김)로 유지하고 줄바꿈하지 않는다
- 탭 바에는 primary CTA를 두지 않는다 — 화면당 primary 1개 규칙 유지

## 5. 폼·입력

- 입력 필드: `surface-card` 배경 + 1px `hairline-strong`, radius 8px, 높이 44px
- 포커스: 1px → 2px `ink` 보더 (컬러 글로우 금지)
- 오류: `error` 보더 + 필드 아래 `helper` 크기 오류 메시지 (색+텍스트 병기)
- 플레이스홀더: `muted-soft`

## 6. 간격 스케일

4px 기반. 계약 스케일을 따른다.

```text
4 · 8 · 12 · 16 · 20 · 24 · 32 · 40 · 48 · 64 · 80
```

| 기본값 | 값 |
| --- | --- |
| 모바일 좌우 패딩 | 20px |
| 카드 내부 패딩 | 20px |
| 섹션 간격 | 32px |
| 데스크톱 섹션 리듬 (히어로·대시보드) | 96px |

## 7. 라운드

| 토큰 | 값 | 용도 |
| --- | --- | --- |
| `radius-xs` | 4px | 인라인 코드 배지 |
| `radius-sm` | 8px | 입력 필드, 일반 버튼 |
| `radius-lg` | 12px | 상태 배지 플레이트 |
| `radius-xl` | 16px | 카드, 영수증 |
| `radius-pill` | 9999px | CTA 필, 아이콘 원형 플레이트 |

## 8. 엘리베이션

| 단계 | 스펙 | 용도 |
| --- | --- | --- |
| Flat | 없음 | canvas 밴드 |
| Card | 1px `hairline` 보더 | 기본 카드 |
| Soft drop | `0 4px 16px rgba(0,0,0,0.04)` — 유일한 섀도 | 하단 고정 바, 영수증 |
| Orb | 파스텔 래디얼 블룸 | 분위기 전용, 서피스 금지 |

## 9. 프레임·반응형

| 프레임 | 값 |
| --- | --- |
| 데스크톱 프레임 | 1920px / 콘텐츠 1280px 중앙 정렬 |
| 모바일 기본 | 390px |
| 모바일 최소 | 320px |
| 모바일 좌우 패딩 | 20px |

| 구간 | 동작 |
| --- | --- |
| < 640px | 히어로 48→32px, Diff 카드 1열, 실행 계약 카드 전체폭, 하단 고정 CTA 바 |
| 640–1024px | 히어로 40px, 카드 2열 |
| 1024–1280px | 전체 레이아웃, 카드 3열 |
| > 1280px | 콘텐츠 1280px 고정 |

- 모바일에서 승인 CTA는 하단 고정 바(높이 52px 버튼 + safe-area 패딩)로 항상 도달 가능
- 오브는 브레이크포인트마다 축소하되 사라지지 않는다

### 컨테이너 쿼리 (cqw)

컴포넌트는 뷰포트가 아닌 **자기 컨테이너 폭 기준**으로 스케일해 어떤 배치(전체폭·2열·사이드 패널)에서도 깨지지 않는다.

- 섹션·카드·영수증 루트에 `container-type: inline-size` 선언
- 유동 크기는 `clamp(최소, Ncqw, 최대)` 형식만 사용 — 최소값은 §2의 12px(데스크톱)·11px(모바일) 하한을 위반할 수 없다
- 열 전환은 미디어 쿼리 대신 `@container (min-width: …)` 사용 — 페이지 전체 레이아웃(GNB·푸터)만 미디어 쿼리 허용
- 순수 `cqw` 단일 값 사용 금지 — 반드시 clamp로 상·하한을 고정한다

| 토큰 | 값 | 용도 |
| --- | --- | --- |
| `fluid-display` | `clamp(32px, 6cqw, 48px)` | 히어로 디스플레이 |
| `fluid-section-title` | `clamp(22px, 3.5cqw, 28px)` | 섹션 제목 |
| `fluid-card-title` | `clamp(17px, 5cqw, 20px)` | 카드 제목 (카드 컨테이너 기준) |
| `fluid-emphasis` | `clamp(17px, 4cqw, 20px)` | 핵심 수치 |
| `fluid-section-pad` | `clamp(48px, 6cqw, 96px)` | 섹션 상하 패딩 |
| 컨테이너 브레이크 | `640px` / `1024px` | 카드 그리드 1→2→3열 |
| 행 접힘 브레이크 | `560px` 이하 | Diff 행 줄바꿈 전환 |

## 10. 접근성·상태 규칙

- 본문 대비 4.5:1 이상, 대형 텍스트 3:1 이상 (잉크/오프화이트 조합은 충족)
- 모든 상태는 색 + 아이콘 + 텍스트 3중 표기
- 진행 중 상태는 반드시 현재 단계 이름을 텍스트로 노출 ("Scout 수집 중 · 2/6")
- 키보드 포커스 링: 2px `ink` 오프셋 2px
- 애니메이션은 `prefers-reduced-motion` 존중, 펄스·타이머 외 장식 모션 금지

## 11. 금지 목록

- 화면당 2개 이상의 primary CTA
- 채도 높은 브랜드 액션 컬러, 그라디언트 버튼
- 파스텔 오브의 컴포넌트 배경·텍스트 색 사용
- 요청되지 않은 그림자·장식 색 추가
- 12px(데스크톱)·11px(모바일) 미만 텍스트
- 색상만으로 상태를 구분하는 표시
- 근거 링크 없는 수치·주장 렌더링

## 12. 참고

- 제품 정의: [mata/IDEATION_FINAL.md](./mata/IDEATION_FINAL.md)
- 채점 규정: [SCORING.md](./SCORING.md)
- 시각 언어 출처: [getdesign.md — ElevenLabs DESIGN.md](https://getdesign.md/elevenlabs/design-md)
- 계약 불변식 출처: `~/.codex/skills/design-guide-agent` (frames·spacing·radii·semantic 독립·최소 텍스트 크기)
