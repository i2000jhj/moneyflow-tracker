# WORK_ORDER — 머니플로우 페이지 R4: 유령 섹터 제거 + 구성종목 어디서든 보기

작성: Claude (설계/리뷰 담당) · 실행: Codex · 2026-07-06

## 배경

2026-07-06 KR/JP 세분화 확충(76→113섹터)으로 옛 섹터명이 이름만 바뀌어 사라졌는데,
DB 히스토리에는 옛 이름 행이 남아 있다. export가 이걸 그대로 내보내면서 두 가지 문제 발생:

1. **유령 섹터 10개가 US로 위장** — "한국 바이오/제약", "일본 금융", "한국 증권/보험",
   "한국 2차전지/ESS", "한국 화장품", "한국 플랫폼/통신", "한국 미용/의료기기",
   "일본 부품/패키징/광통신", "일본 AI/통신 플랫폼", "일본 내수/소비".
   현재 워치리스트에 없으니 `_sector_market_map()`에 안 잡혀 `market_map.get(sector, "US")`
   폴백으로 **US 탭에 한국/일본 섹터가 섞여 보임** (사용자가 직접 발견한 버그).
2. **구성종목 이름 깨짐** — FMP companyName이 KR 종목 다수에서 실패/깨져
   "093320.KQ" 같은 티커 원문이 그대로 칩에 노출됨.

추가 요구: **섹터 어디를 보든 구성종목을 확인 가능하게** (현재는 랭킹 행 확장 시에만 보임).

## 작업 1 — export 유령 섹터 필터 (repo: /Users/lkh/OJH-moneyflow-pages, 브랜치 feature/moneyflow-pages)

**시작 전 필수**: `git merge origin/automation/change-detection-loop` — sectors.yaml 최신화
(다이킨 6367.T가 "AI 데이터센터 전력/냉각"→"일본 기계" 이동됨. 이 머지 없이 export 돌리면 옛 구성이 나감)

파일: `skills/export_moneyflow_pages.py` → `_collect_moneyflow()` (131행~)

- `market_map = _sector_market_map()` 직후 `valid = set(market_map)` 정의.
- **attention 루프**: `for sector, s in scores.items():`에 `if sector not in valid: continue` 추가.
- **rrg 루프**: `for sector, row in rrg.items():`에도 동일 필터.
- **sectors 변수**(140행 `sorted(scores.keys())`)를 `sorted(k for k in scores if k in valid)`로 —
  이게 `get_rrg_tails`·`get_score_histories` 입력이라 score_history도 자동 정화됨.
- **rotation_pairs / timing_signals는 필터하지 않는다** — 자체 market 컬럼을 DB에서 갖고 있어
  시장 오배정이 없고, 옛 섹터명 시그널은 채점된 역사 기록이므로 보존 (hit_rates 정합성).

검증:
```bash
cd /Users/lkh/OJH-moneyflow-pages && .venv 파이썬으로 moneyflow-export --no-push 후
python - <<'EOF'
import json
mf = json.load(open("/Users/lkh/moneyflow-tracker/docs/data.json"))["moneyflow"]
bad = [a["sector"] for a in mf["attention"]
       if (a["sector"].startswith("한국") and a["market"] != "KR")
       or (a["sector"].startswith("일본") and a["market"] != "JP")]
assert not bad, bad
assert len(mf["attention"]) == 113, len(mf["attention"])
EOF
```

## 작업 2 — 구성종목 이름 yfinance 폴백 (같은 repo)

파일: `skills/export_moneyflow_pages.py` → `_collect_sector_members()._name` (110행~)

현재: FMP 실패/깨짐 → 티커 그대로 반환. 변경: 티커 폴백 직전에 yfinance 시도.

- 깨짐 판정(`name.startswith((ticker + ",", ticker.split(".")[0] + ","))`) 또는 빈 이름일 때:
  `yf.Ticker(ticker).info`의 `shortName` or `longName` 시도 → 성공 시 그 이름, 실패 시 티커.
- yfinance 호출은 **동기 + 느림** → `asyncio.to_thread`로 감싸고, FMP처럼 30일 캐시
  (`save_raw`/`load_raw`, 키 예: `yf_name_{ticker}`) 필수. 대상은 FMP 실패분만이라 수십 건 수준.
- rate_limiter의 `yfinance` 버킷 통과 (`skills/rate_limiter.py` 기존 패턴 참조).
- 실패해도 export가 죽으면 안 됨 — 전부 try/except로 티커 폴백 유지.

검증: data.json에서 `sector_members`의 `n == t`인 항목 수가 확 줄었는지 확인
(현재 093320.KQ, 097520.KQ, 053080.KQ 등 다수).

## 작업 3 — 프론트: 섹터 클릭 → 구성종목 시트 (repo: /Users/lkh/moneyflow-tracker, docs/app.js + style.css)

목표: 섹터명이 보이는 모든 곳에서 탭/클릭하면 구성종목 전체 목록이 뜬다.

- **공용 컴포넌트** `openSectorSheet(sector)`: 하단 시트(모바일) / 중앙 팝오버(데스크톱).
  내용 = 섹터명 + 시장 배지 + `getSectorMembers(sector)` 전체 칩(이름, 이름≠티커면 티커 병기).
  기존 `makeSectorMemberList` 재사용/확장. 닫기 = X 버튼 + 배경 클릭 + ESC.
- **연결 지점**:
  1. RRG 점/라벨 클릭 (현재 `<title>` 툴팁뿐 — 모바일에선 툴팁이 안 뜨므로 클릭이 유일한 통로)
  2. 자금 이동 페어 카드의 from/to 섹터명
  3. 타이밍 시그널 행의 섹터명
  4. 랭킹 테이블 확장 패널은 현행 유지 (인라인 칩) — 단, 섹터명 자체도 클릭 가능하게 통일
  5. 중립 섹터 접힘 목록 내 섹터명
- 멤버 데이터 없는 섹터(유령 시그널의 옛 이름 등)는 시트에 "구성종목 정보 없음" 표기 — JS 에러 금지.
- 스타일: 기존 다크 테마 토큰 재사용. 시트 최대 높이 70vh + 내부 스크롤.
- 접근성: 클릭 가능한 섹터명에 `role="button"` `tabindex=0` + Enter/Space 동작.

검증: 로컬 `python -m http.server`로 docs/ 띄워 모바일 뷰포트(375px)에서
RRG 점 탭 → 시트, 페어 카드 섹터 탭 → 시트, ESC 닫기 확인. 콘솔 에러 0.

## 커밋 규칙

- OJH-moneyflow-pages: `moneyflow-export — 유령 섹터 필터 + 구성종목 yfinance 이름 폴백` (작업 1+2 한 커밋)
- moneyflow-tracker: `feature: 섹터 구성종목 시트 — RRG/페어/시그널 어디서든 탭해서 확인` (작업 3)
- 완료 후 export 재실행 + push → GitHub Pages 반영 확인 (배포 실패 시
  `gh api -X POST repos/i2000jhj/moneyflow-tracker/pages/builds`로 직접 재빌드)

## 참고 (알려진 무해 이슈)

- 신규 KR 마이크로 섹터 일부의 attention `member_count`가 1~2로 낮음 — 신규 종목 가격 이력이
  짧아서이며 일일 자동화가 돌면서 자연 회복. 코드 수정 대상 아님.
