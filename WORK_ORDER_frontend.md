# [Codex 작업 지시] 머니플로우 트래커 — GitHub Pages 정적 대시보드 프론트엔드

> 이 문서만 읽고 구현 가능. 데이터 파이프라인은 완성돼 있고 `docs/data.json`(실데이터 595KB)이 이미 존재한다.
>
> **목적**: https://gikd.github.io/etf-sector-tracker/ 스타일의 "섹터 자금흐름 트래커"를
> 자체 머니플로우 v3 엔진(시장 온도계 · RRG 순환매 · 타이밍 시그널) 데이터로 만든다.
> GitHub Pages(`i2000jhj.github.io/moneyflow-tracker/`)에 그대로 올라간다.

## 산출물 (전부 `docs/` 안, 이 3개만 생성)

| 파일 | 내용 |
|------|------|
| `docs/index.html` | 마크업 + 섹션 골격 |
| `docs/style.css` | 다크 테마 + 반응형 |
| `docs/app.js` | fetch/렌더링/인터랙션 전부 |

**제약**:
- 외부 라이브러리·CDN·웹폰트 금지 — 순수 vanilla JS + SVG/Canvas. 빌드 스텝 없음.
- `fetch('data.json')` 상대경로 (서브패스 배포이므로 절대경로 `/` 금지).
- `docs/data.json`은 절대 수정 금지 (파이프라인이 매일 덮어씀).
- 다크 테마 (배경 `#0d1117` 계열), 전체 한국어 UI, 모바일 380px에서 세로 스택 반응형.
- git commit 금지 — 파일 생성/수정만 하고 종료 (커밋은 상위 워크플로우가 처리).

## data.json 스키마 (구현 전 실제 파일을 python으로 읽고 검증할 것)

```
{
 generated_at: ISO 시각,
 moneyflow: {
   as_of: "YYYY-MM-DD",
   temperatures: {US|KR|JP: {temperature(0~100 float), zone(str), vix, breadth_sma20,
                             disparity_pctile, thrust_pctile, capitulation(0/1), blowoff(0/1), member_count}},
   temperature_history: {market: [{date, temperature, zone}] ×90일 오름차순},
   attention: [{sector, market(US|KR|JP), score_short, score_mid, score_long,
                rank_mid, member_count, stage, confirmed}] — rank_mid 오름차순 76개,
   score_history: {sector: [{date, s(score_short), m(score_mid)}] ×90일},
   rrg: [{sector, market, rs_ratio, rs_momentum, quadrant, member_count,
          small_sample(0/1), tail: [[rs_ratio, rs_momentum] ×최대10 (과거→현재)]}],
   rotation_pairs: [{from_sector, to_sector, strength, correlation, note}] — 비어있을 수 있음,
   timing_signals: [{date, signal_type, market, sector, direction, note,
                     forward_return, benchmark_return, hit(1|0|null)}] — 최근 120일 날짜 내림차순 142건,
   hit_rates: {signal_type: {count, evaluated, hits, hit_rate(0~1|null)}}
 },
 etf: {
   benchmark: "ACWI",
   items: [{ticker, name(한글), group("미국 섹터"|"글로벌 지역"|"테마"), query, last,
            returns: {"1w","1m","3m","6m"} (%, null 가능),
            rel: {...} (ACWI 대비 %p, null 가능),
            vol_ratio (5일/20일 거래대금 비율, null 가능), inflow(bool),
            series: {dates[], open[], high[], low[], close[], volume[]} ×130일}] ×30,
   news: {ticker: [{title, link, date, source}] ×최대4}
 }
}
```

## 한글 라벨 / 색상 매핑 (app.js 상수로)

```js
ZONE_KO   = {panic:"패닉", fear:"공포", neutral:"중립", greed:"탐욕", overheat:"과열"}
ZONE_COLOR= {panic:"#3b82f6", fear:"#22d3ee", neutral:"#8b949e", greed:"#f59e0b", overheat:"#ef4444"}
STAGE_KO  = {emerging:"신규부상", strengthening:"강화", leading:"주도",
             slowdown_watch:"둔화관찰", exit_watch:"이탈관찰", neutral:"중립"}
QUAD_KO   = {leading:"주도", weakening:"약화", lagging:"소외", improving:"개선"}
QUAD_COLOR= {leading:"#3fb950", weakening:"#f59e0b", lagging:"#ef4444", improving:"#58a6ff"}
SIGNAL_KO = {take_profit:"차익실현", next_leader:"차기 주도주", follow_rotation:"순환매 추종"}
DIR_KO    = {buy_watch:"매수관찰", reduce:"비중축소"}  // 미정의 값은 원문 그대로
```

## 페이지 구성 (위→아래 8개 섹션)

### 1. 헤더
"머니플로우 트래커" + `moneyflow.as_of` 기준일 + `generated_at` 갱신 시각 (작게).

### 2. 시장 온도계 (US/KR/JP 카드 3장, 가로 배치→모바일 세로)
- SVG 반원 게이지 0~100, 바늘 또는 호(arc) 채움, zone 색상.
- 큰 온도 숫자 + zone 한글 배지 + VIX 소표기.
- 90일 온도 스파크라인 (temperature_history, zone 색 그라데이션 없이 단색 라인이면 충분).
- `capitulation`=1이면 "⚡투매" 배지, `blowoff`=1이면 "⚡분출" 배지.

### 3. RRG 순환매 레이더 (SVG 산점도)
- x=rs_ratio, y=rs_momentum. 기준선 x=100, y=100으로 4사분면 분할.
- 사분면 배경 은은한 틴트 + 모서리에 한글 라벨(주도/약화/소외/개선).
- 점 색 = quadrant 색. `tail` 폴리라인(과거→현재, 점점 진해짐), 마지막 점 강조.
- 시장 필터 버튼: 전체 / US / KR / JP (기본 전체).
- 76개 점이라 라벨 전부 그리면 겹침 — score_mid 상위 12개(attention의 rank_mid 기준)만 텍스트 라벨, 나머지는 hover/tap 툴팁(섹터명·rs_ratio·rs_momentum·사분면·멤버수).
- 축 범위는 데이터 min/max에 여백 5% (극단값 때문에 100 기준선이 화면 밖이면 안 됨 — 반드시 100 포함).
- `small_sample`=1이면 점을 반투명+점선 테두리.

### 4. 순환매 페어
- `rotation_pairs`를 "A → B" 화살표 카드로. strength 표시.
- 비어있으면 "오늘 감지된 순환매 없음" 안내문.

### 5. 타이밍 시그널
- 상단: 유형별 적중률 카드 3장 — `hit_rate` %(소수0자리), `hits/evaluated` 병기, 유형 한글명.
- 하단: 최근 시그널 테이블 기본 20건 (날짜 / 유형 / 시장 / 섹터 / 방향 / 노트 / 결과).
  - 결과: hit=1 "✅적중", hit=0 "❌실패", null "⏳평가중". forward_return 있으면 % 병기.
  - 노트는 길다 — CSS 말줄임 + title 속성으로 전체 확인.
  - "더보기" 버튼 → 20건씩 추가 노출.

### 6. 섹터 관심도 랭킹
- score_mid 기준 상위 20 가로 바차트 (finviz 스타일 — 바 길이=score_mid 0~100).
- 각 행: 순위, 섹터명, 시장 태그(US/KR/JP), stage 한글 배지(색: leading 녹색·exit_watch 빨강·emerging 파랑·나머지 회색톤), score_mid 숫자.
- 행 클릭 → 해당 섹터 90일 score_history 라인차트(s·m 2개 라인)를 행 아래 인라인 확장/접기.

### 7. ETF 자금흐름 (레퍼런스 복제 파트)
- 컨트롤: 기간 토글(1주/1개월/3개월/6개월, 기본 1개월) + 그룹 탭(전체/미국 섹터/글로벌 지역/테마).
- 수익률 가로 바차트: 선택 기간 returns 내림차순, 양수 녹색/음수 빨강, `inflow`=true면 "💰 자금유입" 배지.
- 비교 테이블: 티커/이름/현재가/1w/1m/3m/6m/ACWI대비(선택기간 rel)/거래대금비율 — **열 헤더 클릭 정렬**(재클릭 시 역순).
- 바 또는 행 클릭 → **모달**: canvas 캔들차트(130일 OHLC, 양봉 녹색/음봉 빨강) + 하단 거래량 바 + 그 아래 `news[ticker]` 링크 리스트(제목·출처, `target="_blank" rel="noopener"`).
- 모달은 ESC/바깥 클릭으로 닫기.

### 8. 푸터
"가격·거래대금 기반 추정치이며 실제 펀드 설정/환매 자금이 아닙니다. 투자 판단 참고용."
+ 출처: Yahoo Finance · Google News RSS · 자체 머니플로우 엔진.

## 품질 기준

- 모든 수치 null 방어 → "—" 표시. 배열 빈 값 방어.
- 숫자 포맷: 소수 1~2자리, +/− 부호(수익률), 천단위 콤마(가격·거래량).
- XSS 방어: 뉴스 제목/시그널 노트 등 외부 문자열은 `textContent`로만 삽입 (innerHTML에 외부 문자열 결합 금지).
- 이벤트 위임 사용 (테이블 행 76~142개에 개별 리스너 X).
- 함수 분리: 섹션별 render 함수 + 공용 유틸(fmt, el 생성). 파일 3개 외 추가 파일 금지.

## 완료 전 자체 검증 (필수)

1. `node --check docs/app.js` 문법 통과.
2. `python3 -m http.server 8123 -d docs` 백그라운드 기동 → `curl -s -o /dev/null -w "%{http_code}" http://localhost:8123/` 200 확인.
3. data.json의 실제 키로 렌더 코드가 전부 매칭되는지 grep으로 재확인 (오타 필드 금지).
4. 완료 보고: 구현한 섹션 체크리스트 + 미완/주의점.
