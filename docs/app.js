(() => {
  "use strict";

  const SVG_NS = "http://www.w3.org/2000/svg";
  const MARKETS = ["US", "KR", "JP"];
  const PERIOD_LABEL = { "1w": "1주", "1m": "1개월", "3m": "3개월", "6m": "6개월" };
  const ZONE_KO = { panic: "패닉", fear: "공포", neutral: "중립", greed: "탐욕", overheat: "과열" };
  const ZONE_COLOR = { panic: "#3b82f6", fear: "#22d3ee", neutral: "#8b949e", greed: "#f59e0b", overheat: "#ef4444" };
  const STAGE_KO = {
    emerging: "신규부상",
    strengthening: "강화",
    leading: "주도",
    slowdown_watch: "둔화관찰",
    exit_watch: "이탈관찰",
    neutral: "중립"
  };
  const STAGE_COLOR = {
    emerging: "#58a6ff",
    strengthening: "#8b949e",
    leading: "#3fb950",
    slowdown_watch: "#8b949e",
    exit_watch: "#ef4444",
    neutral: "#8b949e"
  };
  const QUAD_KO = { leading: "주도", weakening: "약화", lagging: "소외", improving: "개선" };
  const QUAD_COLOR = { leading: "#3fb950", weakening: "#f59e0b", lagging: "#ef4444", improving: "#58a6ff" };
  const SIGNAL_KO = { take_profit: "차익실현", next_leader: "차기 주도주", follow_rotation: "순환매 추종" };
  const DIR_KO = { buy_watch: "매수관찰", reduce: "비중축소" };
  const SIGNAL_ORDER = ["take_profit", "next_leader", "follow_rotation"];
  installInlineFavicon();

  const state = {
    data: null,
    sectorMembers: new Map(),
    globalMarket: "ALL",
    rrgMarket: "ALL",
    pairMarket: "ALL",
    signalMarket: "ALL",
    rankMarket: "ALL",
    rrgRows: [],
    signalsVisible: 20,
    expandedSector: null,
    etfPeriod: "1m",
    etfGroup: "ALL",
    etfSort: { key: "returns.1m", dir: "desc" },
    modalTicker: null,
    sectorSheetSector: null
  };

  document.addEventListener("DOMContentLoaded", () => {
    bindEvents();
    loadData();
  });

  async function loadData() {
    try {
      const response = await fetch("data.json", { cache: "no-store" });
      if (!response.ok) {
        throw new Error(`data.json HTTP ${response.status}`);
      }
      state.data = await response.json();
      state.sectorMembers = buildSectorMembersMap(state.data);
      renderAll();
    } catch (error) {
      renderError(error);
    }
  }

  function bindEvents() {
    document.addEventListener("click", handleClick);
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        closeModal();
        closeSectorSheet();
        return;
      }
      handleActionKey(event);
    });

    const rrgChart = document.getElementById("rrgChart");
    rrgChart.addEventListener("pointermove", handleRrgPointer);
    rrgChart.addEventListener("pointerleave", hideTooltip);
    rrgChart.addEventListener("click", handleRrgPointer);

    window.addEventListener("resize", () => {
      if (state.modalTicker) {
        const item = findEtf(state.modalTicker);
        if (item) renderCandleChart(item);
      }
    });
  }

  function handleClick(event) {
    const actionNode = event.target.closest("[data-action]");
    if (!actionNode) return;

    const action = actionNode.dataset.action;
    if (action === "global-market") {
      const market = actionNode.dataset.market || "ALL";
      if (market !== "ALL" && !MARKETS.includes(market)) return;
      state.globalMarket = market;
      state.rrgMarket = market === "ALL" ? "ALL" : market;
      state.pairMarket = market === "ALL" ? "ALL" : market;
      state.signalMarket = market === "ALL" ? "ALL" : market;
      state.rankMarket = market === "ALL" ? "ALL" : market;
      state.signalsVisible = 20;
      state.expandedSector = null;
      hideTooltip();
      renderHeader();
      renderGlobalMarketTabs();
      renderTemperatures();
      renderRrg();
      renderRotationPairs();
      renderHitRates();
      renderSignals();
      renderRanking();
      return;
    }

    if (action === "rrg-filter") {
      if (state.globalMarket !== "ALL") return;
      const market = readMarket(actionNode);
      if (!market) return;
      state.rrgMarket = market;
      renderRrg();
      return;
    }

    if (action === "pair-filter") {
      if (state.globalMarket !== "ALL") return;
      const market = readMarket(actionNode);
      if (!market) return;
      state.pairMarket = market;
      renderRotationPairs();
      return;
    }

    if (action === "signal-filter") {
      if (state.globalMarket !== "ALL") return;
      const market = readMarket(actionNode);
      if (!market) return;
      state.signalMarket = market;
      state.signalsVisible = 20;
      renderSignals();
      return;
    }

    if (action === "rank-filter") {
      if (state.globalMarket !== "ALL") return;
      const market = readMarket(actionNode);
      if (!market) return;
      state.rankMarket = market;
      renderRanking();
      return;
    }

    if (action === "signals-more") {
      state.signalsVisible += 20;
      renderSignals();
      return;
    }

    if (action === "toggle-sector") {
      const sector = actionNode.dataset.sector || "";
      state.expandedSector = state.expandedSector === sector ? null : sector;
      renderRanking();
      return;
    }

    if (action === "open-sector-sheet") {
      const sector = actionNode.dataset.sector || "";
      if (sector) openSectorSheet(sector);
      return;
    }

    if (action === "etf-period") {
      state.etfPeriod = actionNode.dataset.period || "1m";
      state.etfSort = { key: `returns.${state.etfPeriod}`, dir: "desc" };
      renderEtf();
      return;
    }

    if (action === "etf-group") {
      state.etfGroup = actionNode.dataset.group || "ALL";
      renderEtf();
      return;
    }

    if (action === "etf-sort") {
      const key = actionNode.dataset.sort || "ticker";
      if (state.etfSort.key === key) {
        state.etfSort.dir = state.etfSort.dir === "asc" ? "desc" : "asc";
      } else {
        state.etfSort = { key, dir: isTextSort(key) ? "asc" : "desc" };
      }
      renderEtfTable();
      return;
    }

    if (action === "open-etf") {
      const ticker = actionNode.dataset.ticker;
      if (ticker) openEtfModal(ticker);
      return;
    }

    if (action === "modal-close") {
      closeModal();
      return;
    }

    if (action === "sector-sheet-close") {
      closeSectorSheet();
    }
  }

  function handleActionKey(event) {
    if (event.key !== "Enter" && event.key !== " ") return;
    const actionNode = event.target.closest && event.target.closest("[data-action]");
    if (!actionNode || actionNode.tagName === "BUTTON" || actionNode.tagName === "A") return;
    event.preventDefault();
    actionNode.click();
  }

  function renderAll() {
    renderHeader();
    renderGlobalMarketTabs();
    renderTemperatures();
    renderRrg();
    renderRotationPairs();
    renderHitRates();
    renderSignals();
    renderRanking();
    renderEtf();
  }

  function renderHeader() {
    const data = state.data || {};
    const moneyflow = data.moneyflow || {};
    text("asOfBadge", `기준일 ${formatAsOfBadge(moneyflow)}`);
    text("generatedBadge", `갱신 ${formatDateTime(data.generated_at)}`);
  }

  function renderGlobalMarketTabs() {
    setActive("global-market", "market", state.globalMarket);
  }

  function renderTemperatures() {
    const host = byId("temperatureCards");
    host.replaceChildren();

    const moneyflow = (state.data && state.data.moneyflow) || {};
    const temperatures = moneyflow.temperatures || {};
    const history = moneyflow.temperature_history || {};
    const markets = getVisibleMarkets();
    host.classList.toggle("is-single", markets.length === 1);

    markets.forEach((market) => {
      const item = temperatures[market] || {};
      const zone = item.zone || "neutral";
      const color = ZONE_COLOR[zone] || ZONE_COLOR.neutral;
      const card = div("card temperature-card");

      const head = div("card-head");
      head.append(el("h3", "", market), makeBadge(ZONE_KO[zone] || zone, color));
      card.append(head);

      card.append(makeGauge(item.temperature, color));

      const main = div("metric-main");
      main.append(el("span", "metric-number", fmtNumber(item.temperature, 1)), el("span", "metric-unit", "/ 100"));
      card.append(main);

      const badges = div("badge-row");
      if (item.capitulation === 1) badges.append(makeBadge("⚡투매", "#58a6ff"));
      if (item.blowoff === 1) badges.append(makeBadge("⚡분출", "#ef4444"));
      if (badges.childElementCount) card.append(badges);

      const metrics = div("mini-metrics");
      metrics.append(
        el("span", "", `VIX ${fmtNumber(item.vix, 2)}`),
        el("span", "", `20일 폭 ${fmtNumber(item.breadth_sma20, 1)}`),
        el("span", "", `괴리 ${fmtNumber(item.disparity_pctile, 1)}`),
        el("span", "", `추력 ${fmtNumber(item.thrust_pctile, 1)}`),
        el("span", "", `구성 ${fmtInteger(item.member_count)}`)
      );
      card.append(metrics);
      card.append(makeSparkline(history[market] || [], color, "temperature"));

      host.append(card);
    });
  }

  function renderRrg() {
    const activeMarket = prepareSectionMarketFilter("rrgMarketFilters", "rrg-filter", "rrgMarket");
    const host = byId("rrgChart");
    host.replaceChildren();

    const rows = (((state.data || {}).moneyflow || {}).rrg || [])
      .filter((row) => activeMarket === "ALL" || row.market === activeMarket);
    state.rrgRows = rows;

    if (!rows.length) {
      host.append(el("p", "empty-state", "표시할 RRG 데이터가 없습니다."));
      return;
    }

    const attention = (((state.data || {}).moneyflow || {}).attention || [])
      .filter((item) => activeMarket === "ALL" || item.market === activeMarket)
      .slice()
      .sort((a, b) => safeNumber(a.rank_mid, 9999) - safeNumber(b.rank_mid, 9999));
    const labelSectors = new Set(attention.slice(0, 12).map((item) => item.sector));
    const points = collectRrgPoints(rows);
    const extent = makeExtent(points);
    const width = 900;
    const height = 520;
    const pad = { left: 64, right: 34, top: 34, bottom: 46 };
    const plotW = width - pad.left - pad.right;
    const plotH = height - pad.top - pad.bottom;
    const x100 = mapValue(100, extent.xMin, extent.xMax, pad.left, pad.left + plotW);
    const y100 = mapValue(100, extent.yMin, extent.yMax, pad.top + plotH, pad.top);

    const svg = svgEl("svg", { class: "rrg-svg", viewBox: `0 0 ${width} ${height}`, role: "img", "aria-label": "RRG 순환매 레이더" });
    appendQuadrants(svg, pad, plotW, plotH, x100, y100);
    appendRrgAxes(svg, width, height, pad, plotW, plotH, x100, y100);

    rows.forEach((row, index) => {
      const color = QUAD_COLOR[row.quadrant] || "#8b949e";
      appendRrgTail(svg, row, extent, pad, plotW, plotH, color);
      appendRrgPoint(svg, row, index, extent, pad, plotW, plotH, color);
      if (labelSectors.has(row.sector)) {
        appendRrgLabel(svg, row, index, extent, pad, plotW, plotH);
      }
    });

    host.append(svg);
  }

  function renderRotationPairs() {
    const activeMarket = prepareSectionMarketFilter("pairMarketFilters", "pair-filter", "pairMarket");
    const host = byId("rotationPairs");
    host.replaceChildren();
    const sectorMarket = makeSectorMarketMap();
    const pairs = (((state.data || {}).moneyflow || {}).rotation_pairs || [])
      .filter((pair) => {
        if (activeMarket === "ALL") return true;
        return sectorMarket.get(pair.from_sector) === activeMarket || sectorMarket.get(pair.to_sector) === activeMarket;
      });

    if (!pairs.length) {
      host.append(el("p", "card empty-state", "오늘 감지된 순환매 없음"));
      return;
    }

    pairs.forEach((pair) => {
      const card = div("card pair-card");
      const arrow = div("pair-arrow");
      arrow.append(
        makeSectorTrigger(pair.from_sector, "pair-sector"),
        el("span", "neutral", "→"),
        makeSectorTrigger(pair.to_sector, "pair-sector")
      );
      const strength = clamp(safeNumber(pair.strength, 0), 0, 100);
      const bar = div("strength-bar");
      const fill = el("i");
      fill.style.width = `${strength}%`;
      fill.style.background = "#58a6ff";
      bar.append(fill);
      card.append(
        arrow,
        el("p", "neutral", `강도 ${fmtNumber(pair.strength, 1)} · 상관 ${fmtNumber(pair.correlation, 2)}`),
        bar,
        el("p", "neutral", pair.note || "")
      );
      host.append(card);
    });
  }

  function renderHitRates() {
    const host = byId("hitRateCards");
    host.replaceChildren();
    const rawHitRates = (((state.data || {}).moneyflow || {}).hit_rates || {});
    const hasRawHitRates = state.globalMarket === "ALL" && Object.keys(rawHitRates).length > 0;
    const hitRates = hasRawHitRates ? rawHitRates : calculateHitRates(getGlobalFilteredSignals());
    const keys = hasRawHitRates
      ? SIGNAL_ORDER.filter((key) => hitRates[key]).concat(Object.keys(hitRates).filter((key) => !SIGNAL_ORDER.includes(key)))
      : SIGNAL_ORDER;

    keys.forEach((key) => {
      const item = hitRates[key] || {};
      const card = div("card hit-card");
      card.append(
        el("h3", "", SIGNAL_KO[key] || key)
      );
      if (key === "follow_rotation") card.append(makeSignalWarningBadge());
      card.append(
        el("p", "hit-rate", fmtHitRate(item.hit_rate)),
        el("p", "neutral", `${fmtInteger(item.hits)}/${fmtInteger(item.evaluated)} · 총 ${fmtInteger(item.count)}`)
      );
      const excessNode = makeHitRateExcess(key, item);
      if (excessNode) card.append(excessNode);
      host.append(card);
    });
  }

  function renderSignals() {
    const activeMarket = prepareSectionMarketFilter("signalMarketFilters", "signal-filter", "signalMarket");
    const body = byId("signalsTable");
    body.replaceChildren();
    const signals = getFilteredSignals(activeMarket);

    if (!signals.length) {
      const tr = el("tr");
      const td = cell(activeMarket === "ALL" ? "타이밍 시그널 없음" : "해당 시장 시그널 없음", "empty-state");
      td.colSpan = 7;
      tr.append(td);
      body.append(tr);
      byId("signalsMore").hidden = true;
      return;
    }

    signals.slice(0, state.signalsVisible).forEach((signal) => {
      const tr = el("tr");
      tr.append(
        cell(signal.date || "—"),
        cell(SIGNAL_KO[signal.signal_type] || signal.signal_type || "—"),
        cell(signal.market || "—"),
        sectorCell(signal.sector || ""),
        cell(DIR_KO[signal.direction] || signal.direction || "—"),
        noteCell(signal.note || ""),
        resultCell(signal)
      );
      body.append(tr);
    });

    byId("signalsMore").hidden = state.signalsVisible >= signals.length;
  }

  function renderRanking() {
    const activeMarket = prepareSectionMarketFilter("rankMarketFilters", "rank-filter", "rankMarket");
    const host = byId("rankingList");
    host.replaceChildren();
    const attention = (((state.data || {}).moneyflow || {}).attention || [])
      .filter((item) => activeMarket === "ALL" || item.market === activeMarket)
      .slice()
      .sort((a, b) => safeNumber(b.score_mid, -Infinity) - safeNumber(a.score_mid, -Infinity))
      .slice(0, 20);
    const scoreHistory = (((state.data || {}).moneyflow || {}).score_history || {});

    if (!attention.length) {
      host.append(el("p", "empty-state", "섹터 관심도 데이터가 없습니다."));
      return;
    }

    const regularItems = attention.filter((item) => !isSmallSampleAttention(item));
    const referenceItems = attention.filter(isSmallSampleAttention);

    regularItems.forEach((item, index) => {
      host.append(makeRankingRow(item, scoreHistory, index + 1, false));
    });

    if (referenceItems.length) {
      host.append(el("p", "rank-reference-header", "표본 부족 (구성 5종목 미만) — 참고용"));
      referenceItems.forEach((item) => {
        host.append(makeRankingRow(item, scoreHistory, null, true));
      });
    }
  }

  function renderEtf() {
    setActive("etf-period", "period", state.etfPeriod);
    setActive("etf-group", "group", state.etfGroup);
    renderEtfBars();
    renderEtfTable();
  }

  function renderEtfBars() {
    const host = byId("etfBars");
    host.replaceChildren();
    const rows = getFilteredEtfs()
      .slice()
      .sort((a, b) => safeNumber(getPeriodValue(b, "returns"), -Infinity) - safeNumber(getPeriodValue(a, "returns"), -Infinity));

    if (!rows.length) {
      host.append(el("p", "empty-state", "ETF 데이터가 없습니다."));
      return;
    }

    const maxAbs = Math.max(1, ...rows.map((item) => Math.abs(safeNumber(getPeriodValue(item, "returns"), 0))));
    rows.forEach((item) => {
      const value = getPeriodValue(item, "returns");
      const row = div("etf-bar-row");
      row.dataset.action = "open-etf";
      row.dataset.ticker = item.ticker || "";
      row.setAttribute("role", "button");
      row.setAttribute("tabindex", "0");

      const bar = div("etf-return-bar");
      const fill = el("i");
      fill.style.width = `${Math.min(100, Math.abs(safeNumber(value, 0)) / maxAbs * 100)}%`;
      fill.style.marginLeft = safeNumber(value, 0) < 0 ? "auto" : "0";
      fill.style.background = safeNumber(value, 0) >= 0 ? "#3fb950" : "#ef4444";
      bar.append(fill);

      row.append(
        el("span", "ticker-cell", item.ticker || "—"),
        el("span", "etf-name", item.name || "—"),
        bar,
        el("span", valueClass(value), fmtPercent(value, 1, true)),
        item.inflow ? makeBadge("💰 자금유입", "#3fb950") : el("span", "neutral", "—")
      );
      host.append(row);
    });
  }

  function renderEtfTable() {
    const head = byId("etfTableHead");
    const body = byId("etfTableBody");
    head.replaceChildren();
    body.replaceChildren();

    const columns = [
      { key: "ticker", label: "티커" },
      { key: "name", label: "이름" },
      { key: "last", label: "현재가" },
      { key: "returns.1w", label: "1w" },
      { key: "returns.1m", label: "1m" },
      { key: "returns.3m", label: "3m" },
      { key: "returns.6m", label: "6m" },
      { key: `rel.${state.etfPeriod}`, label: `ACWI대비(${PERIOD_LABEL[state.etfPeriod]})` },
      { key: "vol_ratio", label: "거래대금비율" }
    ];

    const tr = el("tr");
    columns.forEach((column) => {
      const th = el("th", "sortable", column.label);
      th.dataset.action = "etf-sort";
      th.dataset.sort = column.key;
      if (state.etfSort.key === column.key) th.classList.add(`sort-${state.etfSort.dir}`);
      tr.append(th);
    });
    head.append(tr);

    const rows = sortEtfs(getFilteredEtfs());
    rows.forEach((item) => {
      const row = el("tr");
      row.dataset.action = "open-etf";
      row.dataset.ticker = item.ticker || "";
      row.append(
        cell(item.ticker || "—", "ticker-cell"),
        cell(item.name || "—", "ticker-name"),
        cell(fmtPrice(item.last)),
        pctCell(item.returns && item.returns["1w"]),
        pctCell(item.returns && item.returns["1m"]),
        pctCell(item.returns && item.returns["3m"]),
        pctCell(item.returns && item.returns["6m"]),
        pctCell(item.rel && item.rel[state.etfPeriod]),
        cell(fmtNumber(item.vol_ratio, 2))
      );
      body.append(row);
    });
  }

  function openEtfModal(ticker) {
    const item = findEtf(ticker);
    if (!item) return;
    state.modalTicker = ticker;
    const modal = byId("etfModal");
    modal.hidden = false;
    document.body.style.overflow = "hidden";
    text("modalTicker", `${item.ticker || "—"} · ${item.group || "—"}`);
    text("modalTitle", item.name || item.ticker || "—");
    renderNews(item);
    requestAnimationFrame(() => renderCandleChart(item));
  }

  function closeModal() {
    const modal = byId("etfModal");
    if (!modal || modal.hidden) return;
    modal.hidden = true;
    state.modalTicker = null;
    if (!state.sectorSheetSector) document.body.style.overflow = "";
  }

  function openSectorSheet(sector) {
    if (!sector) return;
    hideTooltip();
    state.sectorSheetSector = sector;

    const sheet = ensureSectorSheet();
    const dialog = sheet.querySelector(".sector-sheet-dialog");
    const titleId = "sectorSheetTitle";
    const members = getSectorMembers(sector);
    const market = getSectorMarket(sector);
    const isSmallSample = isSmallSampleSector(sector);
    const head = div("sector-sheet-head");
    const titleBlock = div("sector-sheet-title");
    const title = el("h2", "", sector);
    title.id = titleId;
    titleBlock.append(el("p", "eyebrow", "Sector Members"), title);
    const meta = div("sector-sheet-meta");
    if (market) meta.append(makeMarketTag(market));
    if (isSmallSample) meta.append(makeSmallSampleBadge());
    if (meta.childElementCount) titleBlock.append(meta);

    const close = el("button", "icon-button", "×");
    close.type = "button";
    close.dataset.action = "sector-sheet-close";
    close.setAttribute("aria-label", "닫기");
    head.append(titleBlock, close);

    const body = div("sector-sheet-body");
    if (members.length) {
      body.append(makeSectorMemberList(members));
    } else {
      body.append(el("p", "empty-state", "구성종목 정보 없음"));
    }

    dialog.replaceChildren(head, body);
    dialog.setAttribute("aria-labelledby", titleId);
    sheet.hidden = false;
    document.body.style.overflow = "hidden";
    requestAnimationFrame(() => close.focus({ preventScroll: true }));
  }

  function closeSectorSheet() {
    const sheet = byId("sectorSheet");
    if (!sheet || sheet.hidden) return;
    sheet.hidden = true;
    state.sectorSheetSector = null;
    if (!state.modalTicker) document.body.style.overflow = "";
  }

  function ensureSectorSheet() {
    const existing = byId("sectorSheet");
    if (existing) return existing;
    const sheet = div("sector-sheet");
    sheet.id = "sectorSheet";
    sheet.hidden = true;
    const backdrop = div("sector-sheet-backdrop");
    backdrop.dataset.action = "sector-sheet-close";
    const dialog = el("section", "sector-sheet-dialog");
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("aria-modal", "true");
    sheet.append(backdrop, dialog);
    document.body.append(sheet);
    return sheet;
  }

  function renderNews(item) {
    const host = byId("modalNews");
    host.replaceChildren();
    const ticker = item.ticker || "";
    const list = ((((state.data || {}).etf || {}).news || {})[ticker] || []);
    if (!list.length) {
      host.append(el("p", "empty-state", "관련 뉴스가 없습니다."));
      return;
    }

    list.forEach((news) => {
      const card = div("news-item");
      const link = el("a");
      link.textContent = news.title || "제목 없음";
      link.href = safeUrl(news.link);
      link.target = "_blank";
      link.rel = "noopener";
      card.append(link, el("span", "news-meta", `${news.source || "—"} · ${news.date || "—"}`));
      host.append(card);
    });
  }

  function renderCandleChart(item) {
    const canvas = byId("candleCanvas");
    const ctx = canvas.getContext("2d");
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const width = Math.max(320, Math.floor(rect.width || 980));
    const height = Math.max(300, Math.floor(rect.height || 460));
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = "#0b1118";
    ctx.fillRect(0, 0, width, height);

    const candles = normalizeSeries(item.series);
    if (!candles.length) {
      drawCanvasText(ctx, "차트 데이터가 없습니다.", width / 2, height / 2, "#8b949e", "center");
      return;
    }

    const pad = { left: 54, right: 18, top: 18, bottom: 34 };
    const volumeH = Math.max(66, Math.floor(height * 0.22));
    const gap = 18;
    const priceBottom = height - pad.bottom - volumeH - gap;
    const priceH = Math.max(120, priceBottom - pad.top);
    const volumeTop = priceBottom + gap;
    const plotW = width - pad.left - pad.right;
    const highs = candles.map((d) => d.high);
    const lows = candles.map((d) => d.low);
    const priceMinRaw = Math.min(...lows);
    const priceMaxRaw = Math.max(...highs);
    const pricePad = Math.max((priceMaxRaw - priceMinRaw) * 0.06, Math.abs(priceMaxRaw) * 0.01, 1);
    const priceMin = priceMinRaw - pricePad;
    const priceMax = priceMaxRaw + pricePad;
    const volumeMax = Math.max(1, ...candles.map((d) => d.volume || 0));

    drawGrid(ctx, pad, plotW, priceH, priceMin, priceMax);

    const step = plotW / candles.length;
    const bodyW = Math.max(2, Math.min(10, step * 0.58));
    candles.forEach((d, index) => {
      const x = pad.left + index * step + step / 2;
      const openY = mapValue(d.open, priceMin, priceMax, priceBottom, pad.top);
      const closeY = mapValue(d.close, priceMin, priceMax, priceBottom, pad.top);
      const highY = mapValue(d.high, priceMin, priceMax, priceBottom, pad.top);
      const lowY = mapValue(d.low, priceMin, priceMax, priceBottom, pad.top);
      const up = d.close >= d.open;
      const color = up ? "#3fb950" : "#ef4444";

      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, highY);
      ctx.lineTo(x, lowY);
      ctx.stroke();

      ctx.fillStyle = color;
      const y = Math.min(openY, closeY);
      const h = Math.max(1, Math.abs(closeY - openY));
      ctx.fillRect(x - bodyW / 2, y, bodyW, h);

      const volH = (safeNumber(d.volume, 0) / volumeMax) * volumeH;
      ctx.globalAlpha = 0.55;
      ctx.fillRect(x - bodyW / 2, volumeTop + volumeH - volH, bodyW, volH);
      ctx.globalAlpha = 1;
    });

    drawVolumeFrame(ctx, pad.left, volumeTop, plotW, volumeH);
    drawCanvasText(ctx, candles[0].date || "", pad.left, height - 11, "#8b949e", "left");
    drawCanvasText(ctx, candles[candles.length - 1].date || "", width - pad.right, height - 11, "#8b949e", "right");
  }

  function makeGauge(value, color) {
    const normalized = clamp(safeNumber(value, 0), 0, 100);
    const svg = svgEl("svg", { class: "gauge-svg", viewBox: "0 0 200 130", "aria-hidden": "true" });
    const bgPath = "M 22 100 A 78 78 0 0 1 178 100";
    svg.append(
      svgEl("path", { d: bgPath, fill: "none", stroke: "rgba(139,148,158,0.18)", "stroke-width": 16, "stroke-linecap": "round", pathLength: 100 }),
      svgEl("path", {
        d: bgPath,
        fill: "none",
        stroke: color,
        "stroke-width": 16,
        "stroke-linecap": "round",
        pathLength: 100,
        "stroke-dasharray": `${normalized} 100`
      })
    );

    const angle = Math.PI - (normalized / 100) * Math.PI;
    const nx = 100 + Math.cos(angle) * 58;
    const ny = 100 - Math.sin(angle) * 58;
    svg.append(
      svgEl("line", { x1: 100, y1: 100, x2: nx, y2: ny, stroke: "#e6edf3", "stroke-width": 3, "stroke-linecap": "round" }),
      svgEl("circle", { cx: 100, cy: 100, r: 5, fill: "#e6edf3" }),
      svgEl("text", { x: 22, y: 122, fill: "#8b949e", "font-size": 11 }, "0"),
      svgEl("text", { x: 165, y: 122, fill: "#8b949e", "font-size": 11 }, "100")
    );
    return svg;
  }

  function makeSparkline(rows, color, key) {
    const svg = svgEl("svg", { class: "spark-svg", viewBox: "0 0 190 52", "aria-hidden": "true" });
    if (!Array.isArray(rows) || !rows.length) return svg;
    const w = 190;
    const h = 44;
    const values = rows.map((row) => safeNumber(row[key], null)).filter((value) => value !== null);
    if (!values.length) return svg;
    const min = Math.min(0, ...values);
    const max = Math.max(100, ...values);
    const path = rows.map((row, index) => {
      const value = safeNumber(row[key], 0);
      const x = rows.length === 1 ? w / 2 : (index / (rows.length - 1)) * w;
      const y = mapValue(value, min, max, h, 4);
      return `${index === 0 ? "M" : "L"} ${round(x)} ${round(y)}`;
    }).join(" ");
    svg.append(
      svgEl("path", { d: "M 0 44 L 190 44", stroke: "rgba(139,148,158,0.18)", "stroke-width": 1 }),
      svgEl("path", { d: path, fill: "none", stroke: color, "stroke-width": 2.2, "stroke-linecap": "round", "stroke-linejoin": "round" })
    );
    return svg;
  }

  function appendQuadrants(svg, pad, plotW, plotH, x100, y100) {
    const left = pad.left;
    const right = pad.left + plotW;
    const top = pad.top;
    const bottom = pad.top + plotH;
    const rects = [
      { x: x100, y: top, w: right - x100, h: y100 - top, fill: "rgba(63,185,80,0.08)", label: "주도", lx: right - 52, ly: top + 22 },
      { x: x100, y: y100, w: right - x100, h: bottom - y100, fill: "rgba(245,158,11,0.08)", label: "약화", lx: right - 52, ly: bottom - 14 },
      { x: left, y: y100, w: x100 - left, h: bottom - y100, fill: "rgba(239,68,68,0.08)", label: "소외", lx: left + 12, ly: bottom - 14 },
      { x: left, y: top, w: x100 - left, h: y100 - top, fill: "rgba(88,166,255,0.08)", label: "개선", lx: left + 12, ly: top + 22 }
    ];

    rects.forEach((rect) => {
      svg.append(svgEl("rect", { x: rect.x, y: rect.y, width: Math.max(0, rect.w), height: Math.max(0, rect.h), fill: rect.fill }));
      svg.append(svgEl("text", { x: rect.lx, y: rect.ly, fill: "rgba(230,237,243,0.46)", "font-size": 16, "font-weight": 700 }, rect.label));
    });
  }

  function appendRrgAxes(svg, width, height, pad, plotW, plotH, x100, y100) {
    svg.append(
      svgEl("rect", { x: pad.left, y: pad.top, width: plotW, height: plotH, fill: "none", stroke: "rgba(139,148,158,0.28)" }),
      svgEl("line", { x1: x100, y1: pad.top, x2: x100, y2: pad.top + plotH, stroke: "rgba(230,237,243,0.55)", "stroke-dasharray": "5 5" }),
      svgEl("line", { x1: pad.left, y1: y100, x2: pad.left + plotW, y2: y100, stroke: "rgba(230,237,243,0.55)", "stroke-dasharray": "5 5" }),
      svgEl("text", { x: width / 2, y: height - 10, fill: "#8b949e", "font-size": 12, "text-anchor": "middle" }, "RS Ratio"),
      svgEl("text", { x: 17, y: height / 2, fill: "#8b949e", "font-size": 12, transform: `rotate(-90 17 ${height / 2})`, "text-anchor": "middle" }, "RS Momentum"),
      svgEl("text", { x: x100 + 5, y: y100 - 6, fill: "#8b949e", "font-size": 11 }, "100")
    );
  }

  function appendRrgTail(svg, row, extent, pad, plotW, plotH, color) {
    const tail = Array.isArray(row.tail) ? row.tail.filter((point) => isNum(point[0]) && isNum(point[1])) : [];
    if (tail.length < 2) return;
    for (let index = 1; index < tail.length; index += 1) {
      const from = tail[index - 1];
      const to = tail[index];
      const opacity = 0.12 + (index / (tail.length - 1)) * 0.36;
      svg.append(svgEl("line", {
        x1: rrgX(from[0], extent, pad, plotW),
        y1: rrgY(from[1], extent, pad, plotH),
        x2: rrgX(to[0], extent, pad, plotW),
        y2: rrgY(to[1], extent, pad, plotH),
        stroke: color,
        "stroke-width": 2,
        "stroke-linecap": "round",
        opacity
      }));
    }
  }

  function appendRrgPoint(svg, row, index, extent, pad, plotW, plotH, color) {
    const circle = svgEl("circle", {
      cx: rrgX(row.rs_ratio, extent, pad, plotW),
      cy: rrgY(row.rs_momentum, extent, pad, plotH),
      r: row.small_sample === 1 ? 5 : 6,
      fill: color,
      stroke: "#e6edf3",
      "stroke-width": row.small_sample === 1 ? 1.6 : 1,
      "stroke-dasharray": row.small_sample === 1 ? "3 3" : "",
      opacity: row.small_sample === 1 ? 0.58 : 0.94,
      "data-rrg-index": index,
      "data-action": "open-sector-sheet",
      "data-sector": row.sector || "",
      class: "rrg-point sector-trigger",
      role: "button",
      tabindex: 0
    });
    circle.append(svgEl("title", {}, tooltipText(row)));
    svg.append(circle);
  }

  function appendRrgLabel(svg, row, index, extent, pad, plotW, plotH) {
    const label = svgEl("text", {
      x: rrgX(row.rs_ratio, extent, pad, plotW) + 8,
      y: rrgY(row.rs_momentum, extent, pad, plotH) - 8,
      fill: "#e6edf3",
      "font-size": 11,
      "data-rrg-index": index,
      "data-action": "open-sector-sheet",
      "data-sector": row.sector || "",
      class: "rrg-label sector-trigger",
      role: "button",
      tabindex: 0
    }, row.sector || "");
    svg.append(label);
  }

  function makeScoreDetail(rows, sector) {
    const detail = div("score-detail");
    const legend = div("score-legend");
    const dotS = el("span", "legend-dot");
    dotS.style.background = "#58a6ff";
    const dotM = el("span", "legend-dot");
    dotM.style.background = "#3fb950";
    const sLabel = el("span");
    sLabel.append(dotS, document.createTextNode("단기"));
    const mLabel = el("span");
    mLabel.append(dotM, document.createTextNode("중기"));
    legend.append(sLabel, mLabel);
    detail.append(legend, makeScoreChart(rows));

    const members = getSectorMembers(sector);
    if (members.length) {
      detail.append(makeSectorMemberList(members));
    }
    return detail;
  }

  function makeSectorMemberList(members) {
    const block = div("sector-members");
    const label = el("p", "sector-members-title", "구성종목");
    const chips = div("sector-member-chips");
    members.forEach((member) => {
      chips.append(makeSectorMemberChip(member));
    });
    block.append(label, chips);
    return block;
  }

  function makeRankingRow(item, scoreHistory, rank, isReference) {
    const row = div(isReference ? "rank-row rank-row-reference" : "rank-row");
    row.dataset.action = "toggle-sector";
    row.dataset.sector = item.sector || "";
    row.setAttribute("role", "button");
    row.setAttribute("tabindex", "0");
    row.setAttribute("aria-expanded", String(state.expandedSector === item.sector));

    const score = clamp(safeNumber(item.score_mid, 0), 0, 100);
    const color = STAGE_COLOR[item.stage] || "#8b949e";
    const bar = div("rank-bar");
    const fill = el("i");
    fill.style.width = `${score}%`;
    fill.style.background = color;
    bar.append(fill);

    const rankNode = el("span", "rank-number", rank ? `#${rank}` : "");
    if (!rank) rankNode.setAttribute("aria-hidden", "true");
    row.append(
      rankNode,
      makeRankSectorCell(item),
      makeMarketTag(item.market || "—"),
      makeStageBadge(item.stage),
      bar,
      el("span", "score-value", fmtNumber(item.score_mid, 1))
    );

    if (state.expandedSector === item.sector) {
      row.append(makeScoreDetail(scoreHistory[item.sector] || [], item.sector));
    }

    return row;
  }

  function makeRankSectorCell(item) {
    const cellNode = el("span", "rank-sector-cell");
    cellNode.append(makeSectorTrigger(item.sector, "sector-name"));
    if (isSmallSampleAttention(item)) cellNode.append(makeSmallSampleBadge());
    return cellNode;
  }

  function makeSignalWarningBadge() {
    const badge = makeBadge("역지표 관찰", "#f59e0b");
    badge.classList.add("signal-warning-badge");
    return badge;
  }

  function makeHitRateExcess(key, item) {
    const value = key === "take_profit" ? item.avg_benchmark_after : item.avg_excess;
    if (!isNum(value)) return null;
    const label = key === "take_profit" ? "신호 후 시장" : "평균 초과수익";
    return el("p", `signal-excess ${valueClass(value)}`, `${label} ${fmtPercent(value * 100, 1, true)}`);
  }

  function makeSectorMemberChip(member) {
    const chip = el("span", "sector-member-chip");
    chip.append(el("span", "sector-member-label", formatSectorMember(member)));
    if (isNum(member && member.c)) {
      chip.append(el("span", `sector-member-change ${valueClass(member.c)}`, fmtPercent(member.c, 1, true)));
    }
    return chip;
  }

  function makeSectorTrigger(sector, className) {
    const node = el("span", className || "", sector || "—");
    if (!sector) return node;
    node.classList.add("sector-trigger");
    node.dataset.action = "open-sector-sheet";
    node.dataset.sector = sector;
    node.setAttribute("role", "button");
    node.setAttribute("tabindex", "0");
    node.setAttribute("aria-label", `${sector} 구성종목 보기`);
    return node;
  }

  function sectorCell(sector) {
    const td = cell("");
    td.append(makeSectorTrigger(sector, "table-sector"));
    return td;
  }

  function makeScoreChart(rows) {
    const svg = svgEl("svg", { class: "score-svg", viewBox: "0 0 720 180", "aria-hidden": "true" });
    if (!Array.isArray(rows) || !rows.length) {
      svg.append(svgEl("text", { x: 360, y: 90, fill: "#8b949e", "text-anchor": "middle" }, "이력 데이터 없음"));
      return svg;
    }
    const pad = { left: 34, right: 14, top: 14, bottom: 28 };
    const plotW = 720 - pad.left - pad.right;
    const plotH = 180 - pad.top - pad.bottom;
    svg.append(svgEl("rect", { x: pad.left, y: pad.top, width: plotW, height: plotH, fill: "rgba(13,17,23,0.45)", stroke: "rgba(139,148,158,0.18)" }));
    [25, 50, 75].forEach((tick) => {
      const y = mapValue(tick, 0, 100, pad.top + plotH, pad.top);
      svg.append(svgEl("line", { x1: pad.left, y1: y, x2: pad.left + plotW, y2: y, stroke: "rgba(139,148,158,0.14)" }));
    });
    svg.append(
      svgEl("path", { d: historyPath(rows, "s", pad, plotW, plotH), fill: "none", stroke: "#58a6ff", "stroke-width": 2, "stroke-linejoin": "round" }),
      svgEl("path", { d: historyPath(rows, "m", pad, plotW, plotH), fill: "none", stroke: "#3fb950", "stroke-width": 2, "stroke-linejoin": "round" })
    );
    return svg;
  }

  function historyPath(rows, key, pad, plotW, plotH) {
    return rows.map((row, index) => {
      const x = pad.left + (rows.length === 1 ? plotW / 2 : (index / (rows.length - 1)) * plotW);
      const y = mapValue(clamp(safeNumber(row[key], 0), 0, 100), 0, 100, pad.top + plotH, pad.top);
      return `${index === 0 ? "M" : "L"} ${round(x)} ${round(y)}`;
    }).join(" ");
  }

  function handleRrgPointer(event) {
    const target = event.target.closest("[data-rrg-index]");
    if (!target) {
      hideTooltip();
      return;
    }
    const row = state.rrgRows[Number(target.dataset.rrgIndex)];
    if (!row) return;
    const tooltip = byId("rrgTooltip");
    tooltip.replaceChildren();
    tooltip.append(
      el("strong", "", row.sector || "—"),
      el("span", "", `${row.market || "—"} · ${QUAD_KO[row.quadrant] || row.quadrant || "—"}`),
      el("span", "", `RS Ratio ${fmtNumber(row.rs_ratio, 2)}`),
      el("span", "", `RS Momentum ${fmtNumber(row.rs_momentum, 2)}`),
      el("span", "", `구성 ${fmtInteger(row.member_count)}`)
    );
    const memberSummary = formatTooltipMembers(row.sector);
    if (memberSummary) {
      tooltip.append(el("span", "", `구성종목 ${memberSummary}`));
    }
    tooltip.hidden = false;
    const x = Math.min(window.innerWidth - 292, event.clientX + 14);
    const y = Math.min(window.innerHeight - 132, event.clientY + 14);
    tooltip.style.left = `${Math.max(12, x)}px`;
    tooltip.style.top = `${Math.max(12, y)}px`;
  }

  function hideTooltip() {
    byId("rrgTooltip").hidden = true;
  }

  function collectRrgPoints(rows) {
    const points = [{ x: 100, y: 100 }];
    rows.forEach((row) => {
      if (isNum(row.rs_ratio) && isNum(row.rs_momentum)) points.push({ x: row.rs_ratio, y: row.rs_momentum });
      if (Array.isArray(row.tail)) {
        row.tail.forEach((point) => {
          if (isNum(point[0]) && isNum(point[1])) points.push({ x: point[0], y: point[1] });
        });
      }
    });
    return points;
  }

  function makeExtent(points) {
    let xMin = Math.min(...points.map((point) => point.x), 100);
    let xMax = Math.max(...points.map((point) => point.x), 100);
    let yMin = Math.min(...points.map((point) => point.y), 100);
    let yMax = Math.max(...points.map((point) => point.y), 100);
    const xPad = Math.max((xMax - xMin) * 0.05, 1);
    const yPad = Math.max((yMax - yMin) * 0.05, 1);
    xMin -= xPad;
    xMax += xPad;
    yMin -= yPad;
    yMax += yPad;
    return { xMin, xMax, yMin, yMax };
  }

  function rrgX(value, extent, pad, plotW) {
    return mapValue(value, extent.xMin, extent.xMax, pad.left, pad.left + plotW);
  }

  function rrgY(value, extent, pad, plotH) {
    return mapValue(value, extent.yMin, extent.yMax, pad.top + plotH, pad.top);
  }

  function tooltipText(row) {
    const lines = [
      row.sector || "—",
      `${row.market || "—"} · ${QUAD_KO[row.quadrant] || row.quadrant || "—"}`,
      `RS Ratio ${fmtNumber(row.rs_ratio, 2)}`,
      `RS Momentum ${fmtNumber(row.rs_momentum, 2)}`
    ];
    const memberSummary = formatTooltipMembers(row.sector);
    if (memberSummary) lines.push(`구성종목 ${memberSummary}`);
    return lines.join("\n");
  }

  function getVisibleMarkets() {
    return state.globalMarket === "ALL" ? MARKETS : MARKETS.filter((market) => market === state.globalMarket);
  }

  function getEffectiveSectionMarket(sectionMarket) {
    return state.globalMarket === "ALL" ? sectionMarket : state.globalMarket;
  }

  function prepareSectionMarketFilter(filtersId, action, stateKey) {
    const activeMarket = getEffectiveSectionMarket(state[stateKey]);
    const filters = byId(filtersId);
    if (filters) filters.hidden = state.globalMarket !== "ALL";
    if (state.globalMarket !== "ALL") state[stateKey] = activeMarket;
    setActive(action, "market", activeMarket);
    return activeMarket;
  }

  function readMarket(actionNode) {
    const market = actionNode.dataset.market || "ALL";
    return market === "ALL" || MARKETS.includes(market) ? market : null;
  }

  function getFilteredSignals(activeMarket) {
    const signals = (((state.data || {}).moneyflow || {}).timing_signals || []);
    return signals.filter((signal) => activeMarket === "ALL" || signal.market === activeMarket);
  }

  function getGlobalFilteredSignals() {
    const signals = (((state.data || {}).moneyflow || {}).timing_signals || []);
    return signals.filter((signal) => state.globalMarket === "ALL" || signal.market === state.globalMarket);
  }

  function makeSectorMarketMap() {
    const map = new Map();
    const attention = (((state.data || {}).moneyflow || {}).attention || []);
    attention.forEach((item) => {
      if (item.sector) map.set(item.sector, item.market || "");
    });
    return map;
  }

  function getSectorMarket(sector) {
    if (!sector) return "—";
    const inferred = inferMarketFromSectorName(sector);
    if (inferred) return inferred;
    return makeSectorMarketMap().get(sector) || "—";
  }

  function inferMarketFromSectorName(sector) {
    if (sector.startsWith("한국")) return "KR";
    if (sector.startsWith("일본")) return "JP";
    return "";
  }

  function buildSectorMembersMap(data) {
    const raw = (((data || {}).moneyflow || {}).sector_members || {});
    const map = new Map();
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return map;
    Object.entries(raw).forEach(([sector, members]) => {
      if (!Array.isArray(members)) return;
      const normalized = members
        .map((member) => normalizeSectorMember(member))
        .filter((member) => member.t);
      if (sector && normalized.length) map.set(sector, normalized);
    });
    return map;
  }

  function normalizeSectorMember(member) {
    const normalized = {
      t: String((member && member.t) || "").trim(),
      n: String((member && member.n) || "").trim()
    };
    const change = normalizeMemberChange(member);
    if (change !== null) normalized.c = change;
    return normalized;
  }

  function normalizeMemberChange(member) {
    if (!member || !Object.prototype.hasOwnProperty.call(member, "c")) return null;
    if (member.c === null || member.c === "") return null;
    const value = Number(member.c);
    return Number.isFinite(value) ? value : null;
  }

  function getSectorMembers(sector) {
    if (!sector) return [];
    return state.sectorMembers.get(sector) || [];
  }

  function formatSectorMember(member) {
    const ticker = member.t || "—";
    const name = member.n || "";
    return !name || name === ticker ? ticker : `${name} (${ticker})`;
  }

  function formatTooltipMembers(sector) {
    const members = getSectorMembers(sector);
    if (!members.length) return "";
    const tickers = members.slice(0, 5).map((member) => member.t).filter(Boolean);
    if (!tickers.length) return "";
    const extra = members.length - tickers.length;
    return extra > 0 ? `${tickers.join(", ")} 외 ${extra}개` : tickers.join(", ");
  }

  function isSmallSampleSector(sector) {
    if (!sector) return false;
    return (((state.data || {}).moneyflow || {}).attention || [])
      .some((item) => item.sector === sector && isSmallSampleAttention(item));
  }

  function isSmallSampleAttention(item) {
    return safeNumber(item && item.member_count, Infinity) < 5;
  }

  function calculateHitRates(signals) {
    return SIGNAL_ORDER.reduce((acc, key) => {
      const rows = signals.filter((signal) => signal.signal_type === key);
      const evaluated = rows.filter((signal) => signal.hit !== null && signal.hit !== undefined).length;
      const hits = rows.filter((signal) => signal.hit === 1).length;
      const excessRows = rows.filter((signal) => isNum(signal.forward_return) && isNum(signal.benchmark_return));
      const winExcessRows = excessRows.filter((signal) => signal.hit === 1);
      const lossExcessRows = excessRows.filter((signal) => signal.hit === 0);
      const benchmarkRows = rows.filter((signal) => isNum(signal.benchmark_return));
      acc[key] = {
        count: rows.length,
        evaluated,
        hits,
        hit_rate: evaluated > 0 ? hits / evaluated : null,
        avg_excess: average(excessRows.map((signal) => signal.forward_return - signal.benchmark_return)),
        avg_win_excess: average(winExcessRows.map((signal) => signal.forward_return - signal.benchmark_return)),
        avg_loss_excess: average(lossExcessRows.map((signal) => signal.forward_return - signal.benchmark_return)),
        avg_benchmark_after: average(benchmarkRows.map((signal) => signal.benchmark_return))
      };
      return acc;
    }, {});
  }

  function getFilteredEtfs() {
    const items = (((state.data || {}).etf || {}).items || []);
    return items.filter((item) => state.etfGroup === "ALL" || item.group === state.etfGroup);
  }

  function sortEtfs(items) {
    const { key, dir } = state.etfSort;
    const factor = dir === "asc" ? 1 : -1;
    return items.slice().sort((a, b) => {
      const av = valueByPath(a, key);
      const bv = valueByPath(b, key);
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === "string" || typeof bv === "string") {
        return String(av).localeCompare(String(bv), "ko") * factor;
      }
      return (safeNumber(av, 0) - safeNumber(bv, 0)) * factor;
    });
  }

  function getPeriodValue(item, key) {
    return item && item[key] ? item[key][state.etfPeriod] : null;
  }

  function findEtf(ticker) {
    return ((((state.data || {}).etf || {}).items || []).find((item) => item.ticker === ticker));
  }

  function normalizeSeries(series) {
    if (!series) return [];
    const dates = series.dates || [];
    const rows = [];
    for (let index = 0; index < dates.length; index += 1) {
      const row = {
        date: dates[index],
        open: series.open && series.open[index],
        high: series.high && series.high[index],
        low: series.low && series.low[index],
        close: series.close && series.close[index],
        volume: series.volume && series.volume[index]
      };
      if ([row.open, row.high, row.low, row.close].every(isNum)) rows.push(row);
    }
    return rows;
  }

  function drawGrid(ctx, pad, plotW, plotH, min, max) {
    ctx.strokeStyle = "rgba(139,148,158,0.15)";
    ctx.lineWidth = 1;
    ctx.font = "12px system-ui";
    ctx.fillStyle = "#8b949e";
    for (let index = 0; index <= 4; index += 1) {
      const ratio = index / 4;
      const y = pad.top + plotH * ratio;
      const value = max - (max - min) * ratio;
      ctx.beginPath();
      ctx.moveTo(pad.left, y);
      ctx.lineTo(pad.left + plotW, y);
      ctx.stroke();
      ctx.fillText(fmtPrice(value), 6, y + 4);
    }
  }

  function drawVolumeFrame(ctx, x, y, w, h) {
    ctx.strokeStyle = "rgba(139,148,158,0.16)";
    ctx.strokeRect(x, y, w, h);
    drawCanvasText(ctx, "거래량", x + 6, y + 14, "#8b949e", "left");
  }

  function drawCanvasText(ctx, textValue, x, y, color, align) {
    ctx.font = "12px system-ui";
    ctx.fillStyle = color;
    ctx.textAlign = align || "left";
    ctx.fillText(textValue, x, y);
  }

  function renderError(error) {
    const app = byId("app");
    app.replaceChildren();
    const card = div("card");
    card.append(el("h2", "", "데이터 로딩 실패"), el("p", "neutral", error && error.message ? error.message : "알 수 없는 오류"));
    app.append(card);
  }

  function installInlineFavicon() {
    if (document.querySelector("link[rel~='icon']")) return;
    const link = document.createElement("link");
    link.rel = "icon";
    link.href = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Crect width='16' height='16' rx='3' fill='%230d1117'/%3E%3Cpath d='M3 10l3-3 2 2 5-5' fill='none' stroke='%2358a6ff' stroke-width='2'/%3E%3C/svg%3E";
    document.head.append(link);
  }

  function makeBadge(label, color) {
    const badge = el("span", "badge", label || "—");
    badge.style.borderColor = withAlpha(color, 0.42);
    badge.style.color = color;
    badge.style.background = withAlpha(color, 0.10);
    return badge;
  }

  function makeMarketTag(label) {
    return el("span", "market-tag", label || "—");
  }

  function makeSmallSampleBadge() {
    return el("span", "sample-badge", "표본 부족");
  }

  function makeStageBadge(stage) {
    const color = STAGE_COLOR[stage] || STAGE_COLOR.neutral;
    const badge = el("span", "stage-badge", STAGE_KO[stage] || stage || "—");
    badge.style.borderColor = withAlpha(color, 0.42);
    badge.style.color = color;
    badge.style.background = withAlpha(color, 0.10);
    return badge;
  }

  function resultCell(signal) {
    const value = signal.hit === 1 ? "✅적중" : signal.hit === 0 ? "❌실패" : "⏳평가중";
    const extra = isNum(signal.forward_return) ? ` ${fmtPercent(signal.forward_return, 1, true)}` : "";
    return cell(`${value}${extra}`, signal.hit === 1 ? "positive" : signal.hit === 0 ? "negative" : "neutral");
  }

  function noteCell(value) {
    const td = cell(value || "—", "note-cell");
    td.title = value || "";
    return td;
  }

  function pctCell(value) {
    return cell(fmtPercent(value, 1, true), valueClass(value));
  }

  function cell(value, className) {
    const td = el("td", className || "", value);
    return td;
  }

  function valueClass(value) {
    if (!isNum(value)) return "neutral";
    return value > 0 ? "positive" : value < 0 ? "negative" : "neutral";
  }

  function setActive(action, key, value) {
    document.querySelectorAll(`[data-action="${action}"]`).forEach((node) => {
      node.classList.toggle("is-active", node.dataset[key] === value);
    });
  }

  function text(id, value) {
    byId(id).textContent = value;
  }

  function byId(id) {
    return document.getElementById(id);
  }

  function el(tag, className, value) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (value !== undefined && value !== null) node.textContent = value;
    return node;
  }

  function div(className) {
    return el("div", className);
  }

  function svgEl(tag, attrs, value) {
    const node = document.createElementNS(SVG_NS, tag);
    Object.entries(attrs || {}).forEach(([key, val]) => {
      if (val !== undefined && val !== null && val !== "") node.setAttribute(key, String(val));
    });
    if (value !== undefined && value !== null) node.textContent = value;
    return node;
  }

  function formatDateTime(value) {
    if (!value) return "—";
    return String(value).replace("T", " ");
  }

  function formatAsOfBadge(moneyflow) {
    const fallback = moneyflow && moneyflow.as_of ? String(moneyflow.as_of) : "—";
    const dates = moneyflow && moneyflow.as_of_by_market;
    if (!dates || typeof dates !== "object" || Array.isArray(dates)) return fallback;

    if (state.globalMarket !== "ALL") {
      return formatMarketAsOf(state.globalMarket, dates[state.globalMarket] || fallback);
    }

    const parts = MARKETS.map((market) => formatMarketAsOf(market, dates[market] || fallback));
    return parts.some((part) => !part.endsWith(" —")) ? parts.join(" · ") : fallback;
  }

  function formatMarketAsOf(market, value) {
    return `${market} ${formatShortDate(value)}`;
  }

  function formatShortDate(value) {
    if (!value) return "—";
    const textValue = String(value);
    const match = textValue.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (!match) return textValue;
    return `${Number(match[2])}/${Number(match[3])}`;
  }

  function fmtNumber(value, digits) {
    if (!isNum(value)) return "—";
    return value.toLocaleString("ko-KR", { maximumFractionDigits: digits, minimumFractionDigits: digits });
  }

  function fmtInteger(value) {
    if (!isNum(value)) return "—";
    return Math.round(value).toLocaleString("ko-KR");
  }

  function fmtPrice(value) {
    if (!isNum(value)) return "—";
    return value.toLocaleString("ko-KR", { maximumFractionDigits: 2, minimumFractionDigits: 0 });
  }

  function fmtPercent(value, digits, signed) {
    if (!isNum(value)) return "—";
    const sign = signed && value > 0 ? "+" : "";
    return `${sign}${value.toLocaleString("ko-KR", { maximumFractionDigits: digits, minimumFractionDigits: digits })}%`;
  }

  function fmtHitRate(value) {
    if (!isNum(value)) return "—";
    return `${Math.round(value * 100)}%`;
  }

  function isTextSort(key) {
    return key === "ticker" || key === "name";
  }

  function valueByPath(object, path) {
    return path.split(".").reduce((acc, key) => (acc == null ? null : acc[key]), object);
  }

  function safeUrl(value) {
    try {
      const url = new URL(value, window.location.href);
      return url.protocol === "http:" || url.protocol === "https:" ? url.href : "about:blank";
    } catch {
      return "about:blank";
    }
  }

  function safeNumber(value, fallback) {
    return isNum(value) ? value : fallback;
  }

  function isNum(value) {
    return typeof value === "number" && Number.isFinite(value);
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function mapValue(value, inMin, inMax, outMin, outMax) {
    if (inMin === inMax) return (outMin + outMax) / 2;
    return outMin + ((value - inMin) / (inMax - inMin)) * (outMax - outMin);
  }

  function round(value) {
    return Math.round(value * 100) / 100;
  }

  function average(values) {
    const nums = values.filter(isNum);
    if (!nums.length) return null;
    return nums.reduce((sum, value) => sum + value, 0) / nums.length;
  }

  function withAlpha(hex, alpha) {
    const clean = String(hex || "#8b949e").replace("#", "");
    const r = parseInt(clean.slice(0, 2), 16);
    const g = parseInt(clean.slice(2, 4), 16);
    const b = parseInt(clean.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
})();
