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

function getQueryParam(name) {
    const params = new URLSearchParams(window.location.search);
    return params.get(name);
}

function subtractMonths(dateObj, months) {
    const year = dateObj.getFullYear();
    const month = dateObj.getMonth();
    const targetMonthIndex = month - months;
    let targetYear = year;
    let targetMonth = targetMonthIndex;

    while (targetMonth < 0) {
        targetMonth += 12;
        targetYear -= 1;
    }

    const day = dateObj.getDate();
    const lastDayOfTargetMonth = new Date(targetYear, targetMonth + 1, 0).getDate();
    const targetDay = Math.min(day, lastDayOfTargetMonth);

    return new Date(targetYear, targetMonth, targetDay);
}

function parseCourses(aktienkurse) {
    if (!Array.isArray(aktienkurse)) return [];

    const parsed = [];

    for (const entry of aktienkurse) {
        try {
            const d = new Date(entry.datum);
            if (Number.isNaN(d.getTime())) continue;
            const kurs = Number(entry.kurs) || 0;
            parsed.push({
                date: d,
                kurs,
                datumStr: entry.datum
            });
        } catch {
            continue;
        }
    }

    parsed.sort((a, b) => a.date - b.date);
    return parsed;
}

function findStartValue(parsedCourses, targetDate) {
    if (!parsedCourses.length) return { value: 0, index: 0 };

    let candidate = parsedCourses[0];
    let candidateIndex = 0;

    for (let i = 0; i < parsedCourses.length; i++) {
        const c = parsedCourses[i];
        if (c.date <= targetDate) {
            candidate = c;
            candidateIndex = i;
        } else {
            break;
        }
    }

    return { value: candidate.kurs, index: candidateIndex };
}

function computeRangeMetrics(parsedCourses, aktienanzahl, einstiegWert) {
    if (!parsedCourses.length) {
        return {
            currentValue: 0,
            ranges: {}
        };
    }

    const last = parsedCourses[parsedCourses.length - 1];
    const lastDate = last.date;
    const currentValue = last.kurs;

    const basisGesamt =
        (Number(aktienanzahl) || 0) *
        (Number(einstiegWert) || 0);

    const target1m = subtractMonths(lastDate, 1);
    const target3m = subtractMonths(lastDate, 3);
    const target6m = subtractMonths(lastDate, 6);
    const target1y = subtractMonths(lastDate, 12);

    const start1m = findStartValue(parsedCourses, target1m);
    const start3m = findStartValue(parsedCourses, target3m);
    const start6m = findStartValue(parsedCourses, target6m);
    const start1y = findStartValue(parsedCourses, target1y);

    function diff(start, end) {
        const abs = end - start;
        const pct = start > 0 ? (abs / start) * 100 : 0;
        return { abs, pct };
    }

    const r1m = diff(start1m.value, currentValue);
    const r3m = diff(start3m.value, currentValue);
    const r6m = diff(start6m.value, currentValue);
    const r1y = diff(start1y.value, currentValue);

    let rAll;
    if (basisGesamt > 0) {
        const abs = currentValue - basisGesamt;
        const pct = (abs / basisGesamt) * 100;
        rAll = { abs, pct };
    } else {
        rAll = { abs: 0, pct: 0 };
    }

    return {
        currentValue,
        ranges: {
            "1m": { ...r1m, startIndex: start1m.index },
            "3m": { ...r3m, startIndex: start3m.index },
            "6m": { ...r6m, startIndex: start6m.index },
            "1y": { ...r1y, startIndex: start1y.index },
            all: { ...rAll, startIndex: 0 }
        }
    };
}

function drawDetailChart(canvas, data) {
    if (!canvas || !Array.isArray(data) || data.length === 0) return;

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
        left: 46,
        right: 12,
        top: 16,
        bottom: 24
    };

    const plotWidth = Math.max(width - margin.left - margin.right, 10);
    const plotHeight = Math.max(height - margin.top - margin.bottom, 10);

    const values = data.map(d => d.kurs);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 1;
    const count = data.length;

    const gridColor = "rgba(148, 163, 184, 0.25)";
    const axisTextColor = "#9ca3af";

    ctx.font = "11px system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
    ctx.lineWidth = 1;

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

        const label = Math.round(tick.value).toString();
        ctx.fillStyle = axisTextColor;
        ctx.textAlign = "right";
        ctx.textBaseline = "middle";
        ctx.fillText(label, margin.left - 6, y);
    });

    const xTickCount = Math.min(6, count);
    if (xTickCount > 1) {
        for (let i = 0; i < xTickCount; i++) {
            const frac = i / (xTickCount - 1);
            const index = Math.round(frac * (count - 1));
            const point = data[index];

            const x = margin.left + frac * plotWidth;
            const yTop = margin.top;
            const yBottom = margin.top + plotHeight;

            ctx.beginPath();
            ctx.strokeStyle = gridColor;
            ctx.moveTo(x, yTop);
            ctx.lineTo(x, yBottom);
            ctx.stroke();

            const d = point.date;
            const label = `${d.getDate().toString().padStart(2, "0")}.${(d.getMonth() + 1)
                .toString()
                .padStart(2, "0")}.`;

            ctx.fillStyle = axisTextColor;
            ctx.textAlign = "center";
            ctx.textBaseline = "top";
            ctx.fillText(label, x, margin.top + plotHeight + 4);
        }
    }

    const first = values[0];
    const last = values[values.length - 1];

    let lineColor = "#e5e7eb";
    if (last > first) lineColor = "#4ade80";
    else if (last < first) lineColor = "#f97373";

    ctx.beginPath();
    for (let i = 0; i < count; i++) {
        const fracX = count > 1 ? i / (count - 1) : 0.5;
        const x = margin.left + fracX * plotWidth;
        const normalized = (values[i] - min) / range;
        const y = margin.top + (1 - normalized) * plotHeight;

        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
    }

    ctx.strokeStyle = lineColor;
    ctx.lineWidth = 1.6;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.stroke();

    const endFracX = count > 1 ? (count - 1) / (count - 1) : 0.5;
    const endX = margin.left + endFracX * plotWidth;
    const endNormalized = (last - min) / range;
    const endY = margin.top + (1 - endNormalized) * plotHeight;

    ctx.beginPath();
    ctx.arc(endX, endY, 3, 0, Math.PI * 2);
    ctx.fillStyle = lineColor;
    ctx.fill();

    ctx.restore();
}

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

    const years = Object.keys(yearlyTotals).sort();
    const tooltip = years.length
        ? years.map(year => `${year}: ${currencyFormatter.format(yearlyTotals[year])}`).join("\n")
        : "No dividends recorded";

    return {
        total,
        yearlyTotals,
        tooltip
    };
}

function renderSummary(record, metrics) {
    const currentValueEl = document.getElementById("detail-current-value");
    const totalPerfEl = document.getElementById("detail-total-performance");

    const r1mEl = document.getElementById("detail-range-1m");
    const r3mEl = document.getElementById("detail-range-3m");
    const r6mEl = document.getElementById("detail-range-6m");
    const r1yEl = document.getElementById("detail-range-1y");
    const rAllEl = document.getElementById("detail-range-all");

    const ranges = metrics.ranges;

    const currentFormatted = currencyFormatter.format(metrics.currentValue);
    if (currentValueEl) currentValueEl.textContent = currentFormatted;

    const totalAbs = ranges.all.abs;
    const totalPct = ranges.all.pct;
    const totalAbsFormatted = currencyFormatter.format(totalAbs);
    const totalPctFormatted = formatPercent(totalPct);

    if (totalPerfEl) {
        let cls = "performance-neutral";
        if (totalAbs > 0) cls = "performance-positive";
        else if (totalAbs < 0) cls = "performance-negative";

        totalPerfEl.innerHTML = `
            <span class="${cls}">
                ${totalAbsFormatted} (${totalPctFormatted})
            </span>
        `;
    }

    function renderRange(el, rangeKey) {
        if (!el || !ranges[rangeKey]) return;
        const { abs, pct } = ranges[rangeKey];
        const absFormatted = currencyFormatter.format(abs);
        const pctFormatted = formatPercent(pct);

        let cls = "performance-neutral";
        if (abs > 0) cls = "performance-positive";
        else if (abs < 0) cls = "performance-negative";

        el.innerHTML = `
            <span class="${cls}">
                ${absFormatted} (${pctFormatted})
            </span>
        `;
    }

    renderRange(r1mEl, "1m");
    renderRange(r3mEl, "3m");
    renderRange(r6mEl, "6m");
    renderRange(r1yEl, "1y");
    renderRange(rAllEl, "all");
}

function renderDividendsHeader(record) {
    const totalEl = document.getElementById("detail-dividends-total");
    if (!totalEl) return;

    const info = computeDividendsInfo(record);

    totalEl.textContent = currencyFormatter.format(info.total);
    totalEl.title = info.tooltip;
}

function setActiveRangeButton(range) {
    const buttons = document.querySelectorAll(".range-button");
    buttons.forEach(btn => {
        if (btn.dataset.range === range) {
            btn.classList.add("range-button--active");
        } else {
            btn.classList.remove("range-button--active");
        }
    });
}

function filterCoursesForRange(parsedCourses, rangeKey, metrics) {
    if (!parsedCourses.length) return [];

    if (rangeKey === "all") {
        return parsedCourses;
    }

    const rangeInfo = metrics.ranges[rangeKey];
    if (!rangeInfo) return parsedCourses;

    const startIndex = rangeInfo.startIndex || 0;
    return parsedCourses.slice(startIndex);
}

async function initStockDetail() {
    const fileParam = getQueryParam("file");

    const titleEl = document.getElementById("stock-title");
    const subtitleEl = document.getElementById("stock-subtitle");
    const chartNoteEl = document.getElementById("detail-chart-note");
    const chartCanvas = document.getElementById("detail-chart");

    if (!fileParam) {
        if (titleEl) titleEl.textContent = "No stock selected";
        if (chartNoteEl) chartNoteEl.textContent = "Please select a stock from the dashboard.";
        return;
    }

    const decodedFile = decodeURIComponent(fileParam);

    try {
        const response = await fetch("stocks/" + encodeURIComponent(decodedFile) + ".json");
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        const record = await response.json();

        if (titleEl) {
            titleEl.textContent = record.aktienname || record.yfinancename || decodedFile;
        }

        if (subtitleEl) {
            const yname = record.yfinancename || "–";
            const anzahl = record.aktienanzahl != null ? record.aktienanzahl : "–";
            const einstieg = record.aktieneinstiegskurs || {};
            const einstiegWert = einstieg.wert != null ? einstieg.wert : "–";
            const einstiegDatum = einstieg.datum || "–";

            subtitleEl.innerHTML = `
                <span>Symbol: ${yname}</span>
                <span>•</span>
                <span>Shares: ${anzahl}</span>
                <span>•</span>
                <span>Entry price: ${einstiegWert} € (${einstiegDatum})</span>
            `;
        }

        renderDividendsHeader(record);

        const parsedCourses = parseCourses(record.aktienkurse || []);
        if (!parsedCourses.length) {
            if (chartNoteEl) {
                chartNoteEl.textContent = "No price history available.";
            }
            return;
        }

        const aktienanzahl = record.aktienanzahl || 0;
        const einstiegWert = (record.aktieneinstiegskurs && record.aktieneinstiegskurs.wert) || 0;
        const metrics = computeRangeMetrics(parsedCourses, aktienanzahl, einstiegWert);

        renderSummary(record, metrics);

        let currentRange = "all";
        setActiveRangeButton(currentRange);

        function updateChart(rangeKey) {
            currentRange = rangeKey;
            setActiveRangeButton(rangeKey);

            const visible = filterCoursesForRange(parsedCourses, rangeKey, metrics);
            drawDetailChart(chartCanvas, visible);

            if (chartNoteEl && visible.length > 0) {
                const first = visible[0];
                const last = visible[visible.length - 1];
                const formatter = new Intl.DateTimeFormat("en-GB", {
                    year: "numeric",
                    month: "2-digit",
                    day: "2-digit"
                });
                const fromText = formatter.format(first.date);
                const toText = formatter.format(last.date);

                const labelKey = rangeKey === "all" ? "All" : rangeKey.toUpperCase();
                chartNoteEl.textContent = `Range: ${fromText} – ${toText} (${labelKey})`;
            }
        }

        updateChart(currentRange);

        const buttons = document.querySelectorAll(".range-button");
        buttons.forEach(btn => {
            btn.addEventListener("click", () => {
                const r = btn.dataset.range;
                if (!r) return;
                updateChart(r);
            });
        });
    } catch (err) {
        console.error("Error loading stock:", err);
        if (titleEl) titleEl.textContent = "Error loading stock";
        if (chartNoteEl) chartNoteEl.textContent = "Make sure the JSON file exists in /stocks.";
    }
}

document.addEventListener("DOMContentLoaded", initStockDetail);
