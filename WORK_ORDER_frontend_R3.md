# [Codex 작업 지시 R3] 섹터 구성종목 표시

> 기존 구현(docs/index.html, style.css, app.js) 위에 얹는 증분 작업.
> R1/R2 스펙은 WORK_ORDER_frontend.md / WORK_ORDER_frontend_R2.md 참조.
> data.json 수정 금지, git commit 금지.

## 배경

data.json에 새 필드가 추가됐다:

```
moneyflow.sector_members = {
  "섹터명": [ {"t": "티커", "n": "회사명"}, ... ],
  ...
}
```

- 76개 섹터 전부 포함, 섹터당 2~10여 종목.
- 회사명은 영문 (예: "Samsung Electronics Co., Ltd.", "Rainbow Robotics Co.,Ltd.").
- 이름을 못 구한 종목은 n === t (티커 그대로) — 그 경우 티커만 표시.

## 목표

사용자가 "이 섹터에 무슨 종목이 들어있는지"를 두 곳에서 볼 수 있게 한다.

### 1. 섹터 관심도 랭킹 — 행 확장에 구성종목 칩 추가

- 기존: 행 클릭 시 인라인 확장에 점수 히스토리 차트 표시.
- 변경: 같은 확장 영역에서 차트 **아래**에 구성종목 칩 목록 추가.
- 칩 형식: `회사명 (티커)` — n === t면 티커만. 예: `NVIDIA Corporation (NVDA)`, `삼성전자 대신 Samsung Electronics Co., Ltd. (005930.KS)`.
- 칩은 flex-wrap 나열, 기존 배지/칩 스타일 톤 재사용 (작은 pill, 배경 subtle).
- `sector_members`에 해당 섹터가 없으면 칩 영역 자체 생략 (차트만).
- 회사명이 길면 칩 안에서 자연스럽게 — 강제 말줄임 불필요, wrap 허용.

### 2. RRG 순환매 레이더 — 툴팁에 구성종목 요약

- 기존 점 hover 툴팁(섹터명/사분면/수치)에 구성종목 줄 추가.
- 형식: 최대 5개 회사명(짧게, 첫 단어 또는 티커)을 쉼표로, 초과분은 `외 N개`.
  예: `NVDA, AMD, AVGO, TSM, MU 외 3개` — **툴팁에서는 티커만 사용** (공간 절약).
- 데이터 없으면 그 줄 생략.

## 품질 기준

- XSS: 계속 textContent / createElement만. innerHTML에 데이터 삽입 금지.
- 성능: sector_members는 로드 시 한 번 Map으로 변환해 재사용.
- 전역 시장 탭(R2)과 자연 호환 — 랭킹/RRG는 이미 필터된 섹터만 그리므로 추가 filter 불필요.
- 회귀 금지: 행 확장 토글, RRG 툴팁 기존 항목, ETF 섹션, 시장 탭 전환.
- 모바일 380px: 칩 wrap 확인.

## 완료 전 자체 검증

1. `node --check docs/app.js` (없으면 문법 검증 대체 수단).
2. 완료 보고: ①랭킹 확장 칩 표시 ②RRG 툴팁 줄 ③sector_members 누락 섹터 처리 ④회귀 확인 항목.
