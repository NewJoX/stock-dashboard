import json
import random
import sys
from pathlib import Path
from datetime import datetime, date, timedelta

# yfinance muss installiert sein:
# pip install yfinance
try:
    import yfinance as yf
except ImportError:
    yf = None
    print("[FEHLER] yfinance ist nicht installiert. Bitte zuerst 'pip install yfinance' ausführen.",
          file=sys.stderr)
    sys.exit(1)

# ==========================
# Konfiguration
# ==========================

# Basis-Ordner für das Fake-Portfolio
# -> Diesen Ordner legst du neu an.
BASE_DIR = Path(r"D:\Projekte\git_hub_stock_dashboard")

# Unterordner, in dem die JSON-Aktien liegen werden
STOCKS_DIR = BASE_DIR / "stocks"

# Wie viele Aktien sollen erzeugt werden?
NUM_STOCKS = 30

# Zielinvest pro Aktie (in "Euro" – Währung ist hier egal, wir tun so)
INVEST_MIN = 4000.0
INVEST_MAX = 8000.0

# Zufällige Haltedauer in Jahren (Min/Max)
MIN_YEARS = 1
MAX_YEARS = 7

# Liste globaler Aktien: (Aktienname, yfinancename)
GLOBAL_STOCKS = [
    ("Apple", "AAPL"),
    ("Microsoft", "MSFT"),
    ("Amazon", "AMZN"),
    ("Alphabet A", "GOOGL"),
    ("Meta Platforms", "META"),
    ("Tesla", "TSLA"),
    ("Nvidia", "NVDA"),
    ("ASML Holding", "ASML.AS"),
    ("Nestle", "NESN.SW"),
    ("Roche", "ROG.SW"),
    ("Samsung Electronics", "005930.KS"),
    ("Toyota", "7203.T"),
    ("Allianz", "ALV.DE"),
    ("Siemens", "SIE.DE"),
    ("SAP", "SAP.DE"),
    ("Deutsche Telekom", "DTE.DE"),
    ("LVMH", "MC.PA"),
    ("TotalEnergies", "TTE.PA"),
    ("BP", "BP.L"),
    ("Unilever", "ULVR.L"),
    ("Novo Nordisk", "NOVO-B.CO"),
    ("Adidas", "ADS.DE"),
    ("Airbus", "AIR.PA"),
    ("Intel", "INTC"),
    ("AMD", "AMD"),
    ("Netflix", "NFLX"),
    ("Cisco Systems", "CSCO"),
    ("McDonald's", "MCD"),
    ("Coca-Cola", "KO"),
    ("Johnson & Johnson", "JNJ"),
]

# ==========================
# Hilfsfunktionen
# ==========================

def ensure_directories():
    BASE_DIR.mkdir(parents=True, exist_ok=True)
    STOCKS_DIR.mkdir(parents=True, exist_ok=True)


def safe_filename(name: str) -> str:
    # Aus dem aktiennamen eine halbwegs saubere Datei machen
    cleaned = "".join(
        ch if ch.isalnum() or ch in ("-", "_") else "_"
        for ch in name.strip().replace(" ", "_")
    )
    if not cleaned:
        cleaned = "aktie"
    return cleaned + ".json"


def random_holding_period():
    years = random.randint(MIN_YEARS, MAX_YEARS)
    # plus/minus ein paar Tage, damit es nicht immer exakt gleich aussieht
    extra_days = random.randint(-60, 60)
    return years, extra_days


def pick_start_date(years_back: int, extra_days: int) -> date:
    today = date.today()
    approx_days = years_back * 365 + extra_days
    start = today - timedelta(days=approx_days)
    # mindestens 1 Jahr zurück, falls extra_days positiv war
    min_back = today - timedelta(days=365)
    if start > min_back:
        start = min_back
    # und nicht vor 2000
    if start.year < 2000:
        start = date(2000, start.month, start.day)
    return start


def _subtract_months(d: date, months: int) -> date:
    """Einfaches 'Monate zurück'-Handling."""
    year = d.year
    month = d.month - months
    while month <= 0:
        month += 12
        year -= 1

    # Tag anpassen, falls der Monat weniger Tage hat
    day = min(d.day, [31, 29 if year % 4 == 0 and (year % 100 != 0 or year % 400 == 0) else 28,
                       31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1])
    return date(year, month, day)


def _find_start_value(courses, target_date: date) -> float:
    """
    Erwartet 'courses' als Liste von (date, kurs), sortiert aufsteigend.
    Sucht den letzten Eintrag mit datum <= target_date.
    Fallback: erster Kurs.
    """
    candidate = None
    for d, kurs in courses:
        if d <= target_date:
            candidate = kurs
        else:
            break

    if candidate is not None:
        return candidate
    if courses:
        return courses[0][1]
    return 0.0


def compute_performance_from_courses(courses, aktienanzahl: float, einstiegskurs: float):
    """
    Berechnet performance["1m","3m","6m","1y","gesamt"] analog zu deinem Setup.
    courses: Liste von (date, kurs)-Tupeln, kurs = Gesamtwert (Anzahl * Preis)
    """
    if not courses:
        return {
            "1m": 0.0,
            "3m": 0.0,
            "6m": 0.0,
            "1y": 0.0,
            "gesamt": 0.0,
        }

    courses_sorted = sorted(courses, key=lambda t: t[0])
    end_date, end_value = courses_sorted[-1]

    # Basiswert für Gesamt = Einstiegskurs * Anzahl
    basis_gesamt = float(einstiegskurs) * float(aktienanzahl)

    # Ziel-Daten für 1m, 3m, 6m, 1y
    target_1m = _subtract_months(end_date, 1)
    target_3m = _subtract_months(end_date, 3)
    target_6m = _subtract_months(end_date, 6)
    target_1y = _subtract_months(end_date, 12)

    start_1m = _find_start_value(courses_sorted, target_1m)
    start_3m = _find_start_value(courses_sorted, target_3m)
    start_6m = _find_start_value(courses_sorted, target_6m)
    start_1y = _find_start_value(courses_sorted, target_1y)

    def diff_abs(start, end):
        return float(end) - float(start)

    perf_1m = diff_abs(start_1m, end_value)
    perf_3m = diff_abs(start_3m, end_value)
    perf_6m = diff_abs(start_6m, end_value)
    perf_1y = diff_abs(start_1y, end_value)

    if basis_gesamt > 0:
        perf_gesamt = end_value - basis_gesamt
    else:
        perf_gesamt = 0.0

    return {
        "1m": round(perf_1m, 2),
        "3m": round(perf_3m, 2),
        "6m": round(perf_6m, 2),
        "1y": round(perf_1y, 2),
        "gesamt": round(perf_gesamt, 2),
    }


def build_fake_stock_record(aktienname: str, ticker_symbol: str):
    """
    Baut ein komplettes Fake-JSON-Record für eine Aktie:
    - Historische Kurse aus yfinance
    - Zufällige Haltedauer 1-7 Jahre
    - Invest von ca. 4k-8k -> Stückzahl
    - aktienkurse = Anzahl * Close
    - Dividenden aus yfinance
    - performance-Objekt berechnet
    """
    print(f"[INFO] Hole Daten für {aktienname} ({ticker_symbol})...")

    t = yf.Ticker(ticker_symbol)

    years_back, extra_days = random_holding_period()
    start_date = pick_start_date(years_back, extra_days)
    today = date.today()

    # Historische Kurse holen
    try:
        hist = t.history(start=start_date.isoformat(), end=(today + timedelta(days=1)).isoformat())
    except Exception as e:
        print(f"[WARN] Fehler bei history() für {ticker_symbol}: {e}", file=sys.stderr)
        return None

    if hist is None or hist.empty:
        print(f"[WARN] Keine Kursdaten für {ticker_symbol} gefunden, übersprungen.")
        return None

    hist = hist.dropna(subset=["Close"])
    if hist.empty:
        print(f"[WARN] Keine gültigen Close-Daten für {ticker_symbol}, übersprungen.")
        return None

    # Einstieg: erster verfügbarer Tag aus hist
    first_row = hist.iloc[0]
    first_date = first_row.name.date() if isinstance(first_row.name, (datetime,)) else start_date
    first_price = float(first_row["Close"])

    # Invest zufällig ~4k-8k
    invest_target = random.uniform(INVEST_MIN, INVEST_MAX)
    shares = max(int(round(invest_target / first_price)), 1)

    # Kurshistorie als aktienkurse
    aktienkurse_list = []
    courses_for_perf = []

    for idx, row in hist.iterrows():
        if isinstance(idx, (datetime,)):
            d = idx.date()
        else:
            # Fallback
            d = start_date
        close_price = float(row["Close"])
        total_value = round(close_price * shares, 2)

        datum_str = d.isoformat()
        aktienkurse_list.append({
            "datum": datum_str,
            "kurs": total_value
        })
        courses_for_perf.append((d, total_value))

    # Dividenden pro Aktie aus yfinance
    try:
        divs = t.dividends
    except Exception as e:
        print(f"[WARN] Fehler beim Laden der Dividenden für {ticker_symbol}: {e}", file=sys.stderr)
        divs = None

    dividenden_list = []
    gesamtdividenden = 0.0

    if divs is not None and not divs.empty:
        for idx, value in divs.items():
            # Datum muss innerhalb unseres Haltezeitraums liegen
            if isinstance(idx, (datetime,)):
                d = idx.date()
            else:
                continue

            if d < first_date or d > today:
                continue

            per_share = float(value)
            total = round(per_share * shares, 2)
            gesamtdividenden += total

            dividenden_list.append({
                "datum": d.isoformat(),          # exaktes Datum
                "betrag_pro_aktie": round(per_share, 4),
                "betrag_gesamt": total
            })

    gesamtdividenden = round(gesamtdividenden, 2)

    # Performance aus Kursen berechnen
    performance = compute_performance_from_courses(
        courses_for_perf,
        aktienanzahl=shares,
        einstiegskurs=first_price
    )

    record = {
        "schema": 1,
        "version": date.today().isoformat(),
        "aktienname": aktienname,
        "yfinancename": ticker_symbol,
        "aktienanzahl": shares,
        "aktieneinstiegskurs": {
            "wert": round(first_price, 4),
            "datum": first_date.isoformat(),
            "quelle": "fake_generator"
        },
        "status": "aktiv",
        "gesamtdividenden": gesamtdividenden,
        "performance": performance,
        "performance_meta": {
            "missing": []
        },
        "gewinne_verlustmitnahme": [],
        "dividenden": dividenden_list,
        "aktienkurse": aktienkurse_list
    }

    return record


# ==========================
# Hauptlogik
# ==========================

def main():
    ensure_directories()
    print(f"[INFO] Erzeuge Fake-Portfolio in: {STOCKS_DIR}")

    # Zufällig 30 Aktien aus GLOBAL_STOCKS wählen
    if NUM_STOCKS > len(GLOBAL_STOCKS):
        print(f"[WARN] NUM_STOCKS > verfügbare GLOBAL_STOCKS, nutze {len(GLOBAL_STOCKS)}")
        selected = GLOBAL_STOCKS
    else:
        selected = random.sample(GLOBAL_STOCKS, NUM_STOCKS)

    created = 0
    skipped = 0

    for aktienname, ticker_symbol in selected:
        record = build_fake_stock_record(aktienname, ticker_symbol)
        if record is None:
            skipped += 1
            continue

        filename = safe_filename(aktienname)
        out_path = STOCKS_DIR / filename

        try:
            with out_path.open("w", encoding="utf-8") as f:
                json.dump(record, f, ensure_ascii=False, indent=2)
            print(f"[OK]   Datei geschrieben: {out_path}")
            created += 1
        except Exception as e:
            print(f"[WARN] Konnte Datei nicht schreiben {out_path}: {e}", file=sys.stderr)
            skipped += 1

    print("\n========== Zusammenfassung ==========")
    print(f"  Ziel-Aktien:       {NUM_STOCKS}")
    print(f"  Erfolgreich:       {created}")
    print(f"  Übersprungen/Fehler: {skipped}")
    print("  Ausgabeordner:     ", STOCKS_DIR)
    print("=====================================")


if __name__ == "__main__":
    main()
