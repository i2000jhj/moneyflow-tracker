# [Codex 작업 지시 R2] 전역 시장 탭 — 전체/미국/한국/일본 분리 뷰

> 기존 구현(docs/index.html, style.css, app.js) 위에 얹는 증분 작업.
> 기존 스키마/제약은 WORK_ORDER_frontend.md 참조. data.json 수정 금지, git commit 금지.

## 목표

페이지 상단에 전역 시장 탭 **[전체 | 미국 | 한국 | 일본]** (기본 전체)을 추가하고,
탭 선택 시 머니플로우 섹션들이 해당 시장만 보여준다. **ETF 자금흐름 섹션은 탭과 무관하게 항상 그대로.**

데이터의 market 필드: `attention[].market`, `rrg[].market`, `timing_signals[].market` ∈ {US, KR, JP}.
현재 분포: US 61 / KR 7 / JP 8 섹터.

## 상태

`state.globalMarket ∈ {"ALL","US","KR","JP"}` (기본 "ALL"). URL hash 저장 불필요.

## 탭 UI

- 위치: `<header>` 바로 아래, sticky 아님. 기존 `.segmented` 스타일 재사용하되 크게(전역 내비 느낌).
- 라벨: 전체 / 🇺🇸 미국 / 🇰🇷 한국 / 🇯🇵 일본 (이모지 없이 텍스트만도 허용 — 기존 톤 유지 판단에 맡김).
- `data-action="global-market" data-market="ALL|US|KR|JP"`, 이벤트 위임은 기존 handleClick에 분기 추가.

## 섹션별 동작 (globalMarket ≠ ALL일 때)

### 1. 시장 온도계
해당 시장 카드 1장만 표시 (전체 = 3장 그대로). 카드 1장일 때 그리드가 어색하지 않게 max-width 처리.

### 2. RRG 순환매 레이더
- 전역 탭이 US/KR/JP면: RRG 로컬 시장 필터 버튼 그룹 **숨기고**, rrgMarket을 전역 값으로 강제.
- 전역 탭이 ALL이면: 로컬 필터 다시 표시, 기존 동작 그대로 (로컬 필터 독립 동작).
- 전역 탭 전환 시 rrgMarket 리셋(ALL 탭 복귀 시 로컬도 ALL로).
- KR(7개)/JP(8개)는 점이 적으므로 라벨을 전부 표시해도 됨 (기존 상위 12개 제한은 필터 후 개수 기준으로 적용하면 자연 해결).

### 3. 순환매 페어
`rotation_pairs`의 from_sector/to_sector 중 **한쪽이라도** 해당 시장 섹터면 표시.
섹터→시장 매핑은 attention 배열로 Map 구성 (`sectorMarket.get(name)`).
필터 후 0건이면 기존 빈 상태 문구 재사용.

### 4. 타이밍 시그널
- 테이블: `signal.market === globalMarket` 필터. "더보기" 페이징은 필터된 목록 기준.
- 적중률 카드 3장: data.json의 전역 hit_rates 대신 **필터된 timing_signals에서 클라이언트 재계산**
  (evaluated = hit !== null 인 건수, hits = hit === 1 건수, hit_rate = hits/evaluated, evaluated 0이면 "—").
  ALL 탭에서는 기존처럼 data.json hit_rates 사용 (숫자 어긋남 방지).
- 필터 후 0건이면 "해당 시장 시그널 없음" 빈 상태.

### 5. 섹터 관심도 랭킹
- 해당 시장 섹터만, score_mid 내림차순 상위 20 (KR/JP는 7~8개 전부).
- 표시 순위는 필터 후 재번호 (1부터). rank_mid 원본 숫자는 쓰지 않는다.
- 행 클릭 인라인 히스토리 확장 기존 동작 유지.

### 6. ETF 자금흐름 + 푸터
변경 없음. 항상 표시.

## 품질 기준 (기존 + 추가)

- 탭 전환은 전체 리렌더 아닌 섹션별 render 함수 재호출 (renderTemperatures/renderRrg/renderRotationPairs/renderSignals/renderRanking).
- 탭 전환 시 signalsVisible=20, expandedSector=null 리셋 (혼선 방지).
- 기존 기능 회귀 금지: ETF 정렬/모달/기간·그룹 토글, RRG 툴팁, ESC 닫기.
- XSS: 계속 textContent만. 모바일 380px에서 탭 4개가 한 줄에 들어가게 (넘치면 가로 스크롤 허용).

## 완료 전 자체 검증

1. `node --check docs/app.js` 또는 deno check 통과 (환경에 node 없으면 문법 검증만).
2. 완료 보고: 섹션별 필터 동작 체크리스트 + 회귀 확인 항목.
