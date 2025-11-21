// Currency formatter for EUR (de-DE style)
const currencyFormatter = new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
});

function formatPercent(value) {
    const sign = value > 0 ? "+" : value < 0 ? "−" : "";
    const absVal = Math.abs(value).toFixed(2).replace(".", ",");
    return `${sign}${absVal} %`;
}

function formatYAxisValue(value) {
    return Math.round(value).toString();
}

// Backend endpoints (adjust if needed)
const REFRESH_API_URL = "/api/refresh";
const ADD_STOCK_API_URL = "/api/add_stock";

/**
 * Compute dividends info from record:
 * - Accepts entries like "2024" or "2025-09-27"
 * - Groups everything by year (first 4 characters)
 */
function computeDividendsInfo(record) {
    const dividenden = Array.isArray(record.dividenden) ? record.dividenden : [];

    let total = 0;
    const yearlyTotals = {};

    for (const entry of dividenden) {
        const rawDatum = String(entry.datum ?? "").trim();
        const amount = Number(entry.betrag_gesamt) || 0;
        total += amount;

        if (!rawDatum) continue;

        const yearCandidate = rawDatum.slice(0, 4);
        if (/^\d{4}$/.test(yearCandidate)) {
            yearlyTotals[yearCandidate] = (yearlyTotals[yearCandidate] || 0) + amount;
        }
    }

    if (typeof record.gesamtdividenden === "number") {
        total = record.gesamtdividenden;
    }

    return {
        total,
        yearlyTotals
    };
}

/**
 * Sparkline chart for cards
 */
function drawSparkline(canvas, data) {
    if (!canvas || !data || data.length === 0) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();

    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;

    const ctx = canvas.getContext("2d");
    ctx.save();
    ctx.scale(dpr, dpr);

    const width = rect.width;
    const height = rect.height;

    ctx.clearRect(0, 0, width, height);

    const margin = {
        left: 34,
        right: 6,
        top: 4,
        bottom: 16
    };

    const plotWidth = Math.max(width - margin.left - margin.right, 10);
    const plotHeight = Math.max(height - margin.top - margin.bottom, 10);

    const min = Math.min(...data);
    const max = Math.max(...data);
    const range = max - min || 1;
    const count = data.length;
    const stepX = count > 1 ? plotWidth / (count - 1) : plotWidth;

    const gridColor = "rgba(148, 163, 184, 0.25)";
    const axisTextColor = "#9ca3af";

    ctx.font = "9px system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
    ctx.lineWidth = 1;

    // Y ticks (min / mid / max)
    const yTicks = [
        { frac: 0, value: min },
        { frac: 0.5, value: min + range * 0.5 },
        { frac: 1, value: max }
    ];

    yTicks.forEach(tick => {
        const y = margin.top + (1 - tick.frac) * plotHeight;

        ctx.beginPath();
        ctx.strokeStyle = gridColor;
        ctx.moveTo(margin.left, y);
        ctx.lineTo(margin.left + plotWidth, y);
        ctx.stroke();

        const label = formatYAxisValue(tick.value);
        ctx.fillStyle = axisTextColor;
        ctx.textAlign = "right";
        ctx.textBaseline = "middle";
        ctx.fillText(label, margin.left - 4, y);
    });

    // X ticks (1,5,10,15,20,25,30)
    const desiredDays = [1, 5, 10, 15, 20, 25, 30];
    const xTicks = desiredDays
        .filter(day => day <= count)
        .map(day => ({
            index: day - 1,
            label: String(day)
        }));

    xTicks.forEach(tick => {
        const x = margin.left + (tick.index / Math.max(count - 1, 1)) * plotWidth;

        ctx.beginPath();
        ctx.strokeStyle = gridColor;
        ctx.moveTo(x, margin.top);
        ctx.lineTo(x, margin.top + plotHeight);
        ctx.stroke();

        ctx.fillStyle = axisTextColor;
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        ctx.fillText(tick.label, x, margin.top + plotHeight + 2);
    });

    // Main line
    const first = data[0];
    const last = data[data.length - 1];

    let lineColor = "#e5e7eb";
    if (last > first) lineColor = "#4ade80";
    else if (last < first) lineColor = "#f97373";

    ctx.beginPath();
    for (let i = 0; i < count; i++) {
        const x = margin.left + stepX * i;
        const normalized = (data[i] - min) / range;
        const y = margin.top + (1 - normalized) * plotHeight;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = lineColor;
    ctx.lineWidth = 1.4;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.stroke();

    // End point
    const endX = margin.left + stepX * (count - 1);
    const endNormalized = (last - min) / range;
    const endY = margin.top + (1 - endNormalized) * plotHeight;

    ctx.beginPath();
    ctx.arc(endX, endY, 2.5, 0, Math.PI * 2);
    ctx.fillStyle = lineColor;
    ctx.fill();

    ctx.restore();
}

/**
 * Map JSON record into internal stock representation
 */
function mapRecordToStock(record) {
    const rawCourses = Array.isArray(record.aktienkurse) ? record.aktienkurse.slice() : [];

    rawCourses.sort((a, b) => {
        const da = new Date(a.datum);
        const db = new Date(b.datum);
        return da - db;
    });

    // Only last 30 points for the sparkline
    const last30 = rawCourses.slice(-30);
    const prices = last30.map(entry => Number(entry.kurs) || 0);
    const currentValue = prices.length > 0 ? prices[prices.length - 1] : 0;

    // Today's performance (last vs previous)
    let diffAbsToday = null;
    let diffPctToday = null;
    if (prices.length >= 2) {
        const prev = prices[prices.length - 2];
        const curr = prices[prices.length - 1];
        const diff = curr - prev;
        diffAbsToday = diff;
        if (prev > 0) {
            diffPctToday = (diff / prev) * 100;
        } else {
            diffPctToday = 0;
        }
    }

    // 1M performance
    let diffAbs1m = 0;
    if (record.performance && typeof record.performance["1m"] === "number") {
        diffAbs1m = record.performance["1m"];
    } else if (prices.length > 1) {
        const firstValue = prices[0];
        diffAbs1m = currentValue - firstValue;
    }

    const previousValue1m = currentValue - diffAbs1m;
    const diffPct1m = previousValue1m > 0 ? (diffAbs1m / previousValue1m) * 100 : 0;

    // Overall performance (price only)
    let totalDiffAbs = 0;
    let totalDiffPct = 0;
    if (record.performance && typeof record.performance["gesamt"] === "number") {
        totalDiffAbs = record.performance["gesamt"];
        const baseTotal = currentValue - totalDiffAbs;
        totalDiffPct = baseTotal > 0 ? (totalDiffAbs / baseTotal) * 100 : 0;
    } else {
        totalDiffAbs = diffAbs1m;
        totalDiffPct = diffPct1m;
    }

    // Dividends
    const divInfo = computeDividendsInfo(record);
    const dividendsTotal = divInfo.total;
    const dividendsYearly = divInfo.yearlyTotals;

    const fileKeyRaw =
        record.dateiname || // if injected by backend
        record.aktienname ||
        record.yfinancename ||
        "stock";

    // Strip ".json" if present
    const fileKey = fileKeyRaw.endsWith(".json")
        ? fileKeyRaw.slice(0, -5)
        : fileKeyRaw;

    const displayName =
        record.aktienname ||
        record.yfinancename ||
        fileKey;

    return {
        raw: record,
        symbol: record.yfinancename || fileKey,
        name: displayName,
        fileKey,
        prices,
        currentValue,
        diffAbs1m,
        diffPct1m,
        totalDiffAbs,
        totalDiffPct,
        diffAbsToday,
        diffPctToday,
        dividendsTotal,
        dividendsYearly
    };
}

/**
 * Render dashboard meta info (version, last updated, active stocks)
 */
function renderDashboardMeta(container, meta) {
    if (!container) return;
    if (!meta) {
        container.textContent = "";
        return;
    }

    const generated = meta.generated_at
        ? new Date(meta.generated_at)
        : null;

    const formatter = new Intl.DateTimeFormat("en-GB", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit"
    });

    const generatedText = generated
        ? formatter.format(generated)
        : "unknown";

    const active = typeof meta.active_stocks === "number" ? meta.active_stocks : "–";
    const updated = typeof meta.updated_stocks === "number" ? meta.updated_stocks : "–";

    container.innerHTML = `
        <div>Version: ${meta.generated_at || "unknown"}</div>
        <div>Last updated: ${generatedText}</div>
        <div>Active stocks: ${active} (updated: ${updated})</div>
    `;
}

/**
 * Render portfolio summary (incl. today + dividends)
 */
function renderPortfolioSummary(
    container,
    totalCurrent,
    totalPerfAbsTotal,
    totalPerfPctTotal,
    totalDiffAbs1m,
    totalDiffPct1m,
    totalDiffAbsToday,
    totalDiffPctToday,
    totalDividends,
    dividendsYearMap
) {
    const isTotalPositive = totalPerfAbsTotal > 0;
    const isTotalNegative = totalPerfAbsTotal < 0;

    const totalPerfClass = isTotalPositive
        ? "performance-positive"
        : isTotalNegative
            ? "performance-negative"
            : "performance-neutral";

    const is1mPositive = totalDiffAbs1m > 0;
    const is1mNegative = totalDiffAbs1m < 0;

    const perf1mClass = is1mPositive
        ? "performance-positive"
        : is1mNegative
            ? "performance-negative"
            : "performance-neutral";

    let todayPerfClass = "performance-neutral";
    if (typeof totalDiffAbsToday === "number") {
        if (totalDiffAbsToday > 0) todayPerfClass = "performance-positive";
        else if (totalDiffAbsToday < 0) todayPerfClass = "performance-negative";
    }

    const totalCurrentFormatted = currencyFormatter.format(totalCurrent);

    const totalPerfAbsFormatted = currencyFormatter.format(totalPerfAbsTotal);
    const totalPerfPctFormatted = formatPercent(totalPerfPctTotal);

    const totalDiffAbs1mFormatted = currencyFormatter.format(totalDiffAbs1m);
    const totalDiffPct1mFormatted = formatPercent(totalDiffPct1m);

    let todayValueHTML;
    if (typeof totalDiffAbsToday === "number" && typeof totalDiffPctToday === "number") {
        const todayAbsFormatted = currencyFormatter.format(totalDiffAbsToday);
        const todayPctFormatted = formatPercent(totalDiffPctToday);
        todayValueHTML = `
            <span class="${todayPerfClass}">
                ${todayAbsFormatted} (${todayPctFormatted})
            </span>
        `;
    } else {
        todayValueHTML = `
            <span class="portfolio-summary__value portfolio-summary__value--small performance-neutral">
                No comparison possible
            </span>
        `;
    }

    const dividendsTotalFormatted = currencyFormatter.format(totalDividends);
    const years = Object.keys(dividendsYearMap || {}).sort();
    const tooltip = years.length
        ? years.map(year => `${year}: ${currencyFormatter.format(dividendsYearMap[year])}`).join("\n")
        : "No dividends recorded";

    container.innerHTML = `
        <div class="portfolio-summary__group">
            <div class="portfolio-summary__title">Total value</div>
            <div class="portfolio-summary__value">${totalCurrentFormatted}</div>
        </div>
        <div class="portfolio-summary__group">
            <div class="portfolio-summary__title">Overall performance<br><span style="font-size:0.75rem;color:#9ca3af;">including dividends</span></div>
            <div class="portfolio-summary__value ${totalPerfClass}">
                ${totalPerfAbsFormatted} (${totalPerfPctFormatted})
            </div>
        </div>
        <div class="portfolio-summary__group">
            <div class="portfolio-summary__title">1M performance</div>
            <div class="portfolio-summary__value ${perf1mClass}">
                ${totalDiffAbs1mFormatted} (${totalDiffPct1mFormatted})
            </div>
        </div>
        <div class="portfolio-summary__group">
            <div class="portfolio-summary__title">Today performance</div>
            <div class="portfolio-summary__value">
                ${todayValueHTML}
            </div>
        </div>
        <div class="portfolio-summary__group portfolio-summary__group--dividends">
            <div class="portfolio-summary__title">Total dividends</div>
            <div class="portfolio-summary__value portfolio-summary__value--dividends" title="${tooltip}">
                ${dividendsTotalFormatted}
            </div>
        </div>
    `;
}

/**
 * Render stock cards
 */
function renderStockCards(container, stockData) {
    container.innerHTML = "";

    stockData.forEach((stock, index) => {
        const is1mPositive = stock.diffAbs1m > 0;
        const is1mNegative = stock.diffAbs1m < 0;

        const perf1mClass = is1mPositive
            ? "performance-positive"
            : is1mNegative
                ? "performance-negative"
                : "performance-neutral";

        const isTotalPositive = stock.totalDiffAbs > 0;
        const isTotalNegative = stock.totalDiffAbs < 0;

        const totalPerfClass = isTotalPositive
            ? "performance-positive"
            : isTotalNegative
                ? "performance-negative"
                : "performance-neutral";

        const currentValueFormatted = currencyFormatter.format(stock.currentValue);

        const diffAbs1mFormatted = currencyFormatter.format(stock.diffAbs1m);
        const diffPct1mFormatted = formatPercent(stock.diffPct1m);

        const totalDiffAbsFormatted = currencyFormatter.format(stock.totalDiffAbs);
        const totalDiffPctFormatted = formatPercent(stock.totalDiffPct);

        const canvasId = `sparkline-${index}`;

        const card = document.createElement("article");
        card.className = "stock-card";
        card.style.cursor = "pointer";

        card.innerHTML = `
            <div class="stock-card__title">
                ${stock.name} (1M = stock performance)
            </div>
            <div class="stock-card__chart-wrapper">
                <canvas id="${canvasId}" class="stock-card__chart"></canvas>
            </div>
            <div class="stock-card__values">
                <div class="stock-card__current">
                    Current value: ${currentValueFormatted}
                    <span class="${totalPerfClass}">
                        (${totalDiffAbsFormatted} ${totalDiffPctFormatted})
                    </span>
                </div>
                <div class="stock-card__change ${perf1mClass}">
                    1M change: ${diffAbs1mFormatted} (${diffPct1mFormatted})
                </div>
            </div>
        `;

        card.addEventListener("click", () => {
            if (!stock.fileKey) return;
            const url = "stock.html?file=" + encodeURIComponent(stock.fileKey);
            window.location.href = url;
        });

        container.appendChild(card);

        const canvas = card.querySelector(`#${CSS.escape(canvasId)}`);
        drawSparkline(canvas, stock.prices);
    });
}

/**
 * Refresh button
 */
function setupRefreshButton(button, metaContainer) {
    if (!button) return;

    const defaultLabel = button.querySelector(".refresh-button__label");
    const defaultText = defaultLabel ? defaultLabel.textContent : "Refresh";

    async function handleClick() {
        if (!REFRESH_API_URL) return;

        button.disabled = true;
        if (defaultLabel) {
            defaultLabel.textContent = "Running…";
        }

        try {
            const response = await fetch(REFRESH_API_URL, {
                method: "POST"
            });

            if (!response.ok && response.status !== 207) {
                throw new Error(`HTTP ${response.status}`);
            }

            const summary = await response.json();

            if (metaContainer && summary.version) {
                renderDashboardMeta(metaContainer, {
                    generated_at: summary.version,
                    active_stocks: summary.active_stocks,
                    updated_stocks: summary.updated_stocks,
                    skipped_inactive: summary.skipped_inactive
                });
            }

            window.location.reload();
        } catch (err) {
            console.error("Error during refresh:", err);
            if (metaContainer) {
                metaContainer.innerHTML = `
                    <div>Refresh failed – check backend logs.</div>
                `;
            }
        } finally {
            button.disabled = false;
            if (defaultLabel) {
                defaultLabel.textContent = defaultText;
            }
        }
    }

    button.addEventListener("click", handleClick);
}

/**
 * Add-stock modal handling
 */
function setupAddStockModal() {
    const modal = document.getElementById("add-stock-modal");
    const openBtn = document.getElementById("add-stock-button");
    const closeBtn = document.getElementById("add-stock-close");
    const cancelBtn = document.getElementById("add-stock-cancel");
    const form = document.getElementById("add-stock-form");
    const errorEl = document.getElementById("add-stock-error");
    const submitBtn = document.getElementById("add-stock-submit");

    if (!modal || !openBtn || !closeBtn || !cancelBtn || !form || !submitBtn) return;

    function openModal() {
        modal.classList.remove("modal--hidden");
        errorEl.textContent = "";
        form.reset();
    }

    function closeModal() {
        modal.classList.add("modal--hidden");
    }

    openBtn.addEventListener("click", openModal);
    closeBtn.addEventListener("click", closeModal);
    cancelBtn.addEventListener("click", closeModal);

    modal.querySelector(".modal__backdrop").addEventListener("click", closeModal);

    form.addEventListener("submit", async (evt) => {
        evt.preventDefault();
        errorEl.textContent = "";
        submitBtn.disabled = true;
        submitBtn.textContent = "Saving…";

        const yfinancename = form.yfinancename.value.trim();
        const aktienname = form.aktienname.value.trim();
        const kaufdatum = form.kaufdatum.value;
        const einstieg = form.einstieg.value;
        const anzahl = form.anzahl.value;

        if (!yfinancename || !kaufdatum || !einstieg || !anzahl) {
            errorEl.textContent = "Please fill all required fields.";
            submitBtn.disabled = false;
            submitBtn.textContent = "Create";
            return;
        }

        try {
            const response = await fetch(ADD_STOCK_API_URL, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    yfinancename,
                    aktienname: aktienname || null,
                    kaufdatum,
                    einstieg: parseFloat(einstieg),
                    anzahl: parseInt(anzahl, 10)
                })
            });

            if (!response.ok) {
                const text = await response.text();
                throw new Error(text || `HTTP ${response.status}`);
            }

            closeModal();
            window.location.reload();
        } catch (err) {
            console.error("Error adding stock:", err);
            errorEl.textContent = "Could not add stock. Please check backend or console.";
        } finally {
            submitBtn.disabled = false;
            submitBtn.textContent = "Create";
        }
    });
}

// Main
function initDashboard() {
    const stocksGrid = document.getElementById("stocks-grid");
    const portfolioSummaryEl = document.getElementById("portfolio-summary");
    const metaEl = document.getElementById("dashboard-meta");
    const refreshButton = document.getElementById("refresh-button");

    if (!stocksGrid || !portfolioSummaryEl) return;

    console.log("DASHBOARD_DATA (raw):", window.DASHBOARD_DATA);

    let rawData = [];

    if (Array.isArray(window.DASHBOARD_DATA)) {
        rawData = window.DASHBOARD_DATA;
    } else {
        console.warn("window.DASHBOARD_DATA is not an array.");
    }

    if (metaEl && typeof window.DASHBOARD_META === "object") {
        renderDashboardMeta(metaEl, window.DASHBOARD_META);
    }

    if (refreshButton) {
        setupRefreshButton(refreshButton, metaEl);
    }

    setupAddStockModal();

    const activeRecords = rawData.filter(rec => {
        const status = (rec.status || "active").toString().toLowerCase().trim();
        return status === "aktiv" || status === "active";
    });

    console.log("Active records:", activeRecords);

    if (activeRecords.length === 0) {
        portfolioSummaryEl.innerHTML = `
            <div class="portfolio-summary__group">
                <div class="portfolio-summary__title">No active stocks</div>
                <div class="portfolio-summary__value">–</div>
            </div>
        `;
        stocksGrid.innerHTML = "<p>No active stocks found in data.</p>";
        return;
    }

    const stockData = activeRecords.map(mapRecordToStock);

    const totalCurrent = stockData.reduce((sum, s) => sum + s.currentValue, 0);

    const totalDiffAbs1m = stockData.reduce((sum, s) => sum + s.diffAbs1m, 0);
    const base1m = totalCurrent - totalDiffAbs1m;
    const totalDiffPct1m = base1m > 0 ? (totalDiffAbs1m / base1m) * 100 : 0;

    const totalDiffAbsPriceOnly = stockData.reduce((sum, s) => sum + s.totalDiffAbs, 0);
    const baseTotal = totalCurrent - totalDiffAbsPriceOnly;

    const totalDividends = stockData.reduce(
        (sum, s) => sum + (s.dividendsTotal || 0),
        0
    );

    const dividendsYearMapPortfolio = {};
    stockData.forEach(s => {
        const byYear = s.dividendsYearly || {};
        Object.keys(byYear).forEach(year => {
            dividendsYearMapPortfolio[year] =
                (dividendsYearMapPortfolio[year] || 0) + byYear[year];
        });
    });

    const totalPerfAbsInclDiv = totalDiffAbsPriceOnly + totalDividends;
    const totalPerfPctInclDiv =
        baseTotal > 0 ? (totalPerfAbsInclDiv / baseTotal) * 100 : 0;

    const validTodayStocks = stockData.filter(
        s => typeof s.diffAbsToday === "number" && typeof s.diffPctToday === "number"
    );

    let totalDiffAbsToday = null;
    let totalDiffPctToday = null;

    if (validTodayStocks.length > 0) {
        const sumTodayAbs = validTodayStocks.reduce(
            (sum, s) => sum + s.diffAbsToday,
            0
        );
        const baseToday = totalCurrent - sumTodayAbs;
        const pctToday = baseToday > 0 ? (sumTodayAbs / baseToday) * 100 : 0;
        totalDiffAbsToday = sumTodayAbs;
        totalDiffPctToday = pctToday;
    }

    renderPortfolioSummary(
        portfolioSummaryEl,
        totalCurrent,
        totalPerfAbsInclDiv,
        totalPerfPctInclDiv,
        totalDiffAbs1m,
        totalDiffPct1m,
        totalDiffAbsToday,
        totalDiffPctToday,
        totalDividends,
        dividendsYearMapPortfolio
    );

    renderStockCards(stocksGrid, stockData);
}

document.addEventListener("DOMContentLoaded", initDashboard);
