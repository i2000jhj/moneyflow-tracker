# 머니플로우 트래커

글로벌 섹터 자금 흐름을 한눈에 보는 정적 대시보드.
[gikd/etf-sector-tracker](https://github.com/gikd/etf-sector-tracker)의 구조를 참고하되,
자체 머니플로우 엔진(시장 온도계 · RRG 순환매 레이더 · 타이밍 시그널)을 얹었다.

**사이트**: https://i2000jhj.github.io/moneyflow-tracker/

## 구성

```
로컬 파이프라인 (매일 08:40, macOS launchd)
  머니플로우 v3 스냅샷 (SQLite) ─┐
  ETF 30종 시세 (Yahoo Finance)  ─┼→ docs/data.json → GitHub Pages
  섹터 뉴스 (Google News RSS)    ─┘
```

- **시장 온도계** — US/KR/JP 과열·패닉 절대 게이지 (0~100)
- **RRG 순환매 레이더** — 상대강도 × 모멘텀 사분면 + 10일 궤적
- **타이밍 시그널** — 온도×순환매 교차 신호 + 20거래일 자동 채점 적중률
- **섹터 관심도 랭킹** — 수익률·거래대금·상대강도 합성 점수 (0~100)
- **ETF 자금흐름** — 미국 11섹터 + 지역 + 테마 30종, ACWI 대비 초과수익 × 거래대금 급증 프록시

## 데이터 갱신

이 저장소의 `docs/data.json`은 로컬 워크스테이션의 비공개 파이프라인이 매일 push한다.
GitHub Actions는 사용하지 않는다 (원천 DB가 로컬에 있음).

## 면책

가격·거래대금 기반 추정치이며 실제 펀드 설정/환매 자금이 아님. 투자 판단 참고용.
