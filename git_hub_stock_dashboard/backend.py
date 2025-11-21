import json
import sys
import calendar
from pathlib import Path
from datetime import datetime, date

from flask import Flask, jsonify
from flask_cors import CORS

try:
    import yfinance
except ImportError:
    yfinance = None
    print("[WARN] yfinance is not installed. Updates will fail.", file=sys.stderr)


# ==========================
# Configuration
# ==========================

BASE_DIR = Path(__file__).resolve().parent

# Folder with JSON stock files used by the dashboard
STOCKS_DIR = BASE_DIR / "stocks"

# JS file consumed by index.html / app.js
OUTPUT_JS_FILE = BASE_DIR / "dashboard_data.js"

# Log folder
LOG_DIR = BASE_DIR / "logs"

# How many price points should be shown in the dashboard sparkline?
MAX_DAYS = 30

print("[DEBUG] BASE_DIR       =", BASE_DIR)
print("[DEBUG] STOCKS_DIR     =", STOCKS_DIR)
print("[DEBUG] OUTPUT_JS_FILE =", OUTPUT_JS_FILE)


# ==========================
# Helper functions – general
# ==========================

def ensure_directories():
    STOCKS_DIR.mkdir(parents=True, exist_ok=True)
    LOG_DIR.mkdir(parents=True, exist_ok=True)


def load_json_files():
    """
    Load all *.json files from STOCKS_DIR and return list of (path, data).
    """
    records = []
    for path in STOCKS_DIR.glob("*.json"):
        try:
            with path.open("r", encoding="utf-8") as f:
                data = json.load(f)
            records.append((path, data))
        except Exception as e:
            print(f"[WARN] Could not load JSON: {path} ({e})", file=sys.stderr)
    print(f"[DEBUG] load_json_files: found {len(records)} JSON file(s) in {STOCKS_DIR}")
    return records


def normalize_courses(aktienkurse):
    """
    Expects a list of objects:
      { "datum": "YYYY-MM-DD", "kurs": <number> }

    Sorted by date and returns only the last MAX_DAYS entries.
    """
    if not isinstance(aktienkurse, list):
        return []

    def parse_date(entry):
        try:
            return datetime.fromisoformat(str(entry.get("datum")))
        except Exception:
            return datetime.min

    sorted_courses = sorted(aktienkurse, key=parse_date)
    return sorted_courses[-MAX_DAYS:]


def build_dashboard_record(raw_record: dict) -> dict:
    """
    Build a cleaned record for the dashboard:
    - copy header fields (schema, version, aktienname, etc.)
    - aktienkurse is reduced to the last MAX_DAYS entries
    """
    if not isinstance(raw_record, dict):
        return {}

    result = {k: v for k, v in raw_record.items() if k != "aktienkurse"}
    aktienkurse = raw_record.get("aktienkurse", [])
    result["aktienkurse"] = normalize_courses(aktienkurse)
    return result


def write_dashboard_data_js(records: list, meta: dict, output_file: Path):
    """
    Writes a JS file in the format:

    window.DASHBOARD_DATA = [ {...}, {...}, ... ];
    window.DASHBOARD_META = { ... };
    """
    payload = (
        "window.DASHBOARD_DATA = "
        + json.dumps(records, ensure_ascii=False, indent=2)
        + ";\n\n"
        + "window.DASHBOARD_META = "
        + json.dumps(meta, ensure_ascii=False, indent=2)
        + ";\n"
    )

    with output_file.open("w", encoding="utf-8") as f:
        f.write(payload)

    print(f"[INFO] dashboard_data.js written: {output_file}")


def write_log(summary: dict):
    """
    Write one log file per day:
    logs/update_YYYY-MM-DD.json
    """
    ensure_directories()

    today = date.today().isoformat()
    log_path = LOG_DIR / f"update_{today}.json"

    try:
        with log_path.open("w", encoding="utf-8") as f:
            json.dump(summary, f, ensure_ascii=False, indent=2)
        print(f"[INFO] Log file written: {log_path}")
    except Exception as e:
        print(f"[WARN] Could not write log file: {log_path} ({e})", file=sys.stderr)


# ==========================
# Performance calculations
# ==========================

def _subtract_months(d: date, months: int) -> date:
    """
    Subtracts 'months' months from a date (simple implementation).
    """
    year = d.year
    month = d.month - months
    while month <= 0:
        month += 12
        year -= 1

    day = d.day
    last_day = calendar.monthrange(year, month)[1]
    if day > last_day:
        day = last_day
    return date(year, month, day)


def _find_start_value(courses, target_date: date) -> float:
    """
    Expects 'courses' as list of (date, kurs), sorted ascending by date.
    Finds the last entry with date <= target_date.
    If none exists, fall back to the first value.
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


def compute_performance_for_record(record: dict):
    """
    Updates the 'performance' field of record based on:
    - full aktienkurse history
    - aktienanzahl
    - aktieneinstiegskurs.wert
    """
    aktienkurse = record.get("aktienkurse", [])
    if not aktienkurse:
        return

    parsed = []
    for entry in aktienkurse:
        try:
            d = datetime.fromisoformat(str(entry.get("datum"))).date()
            kurs = float(entry.get("kurs") or 0.0)
            parsed.append((d, kurs))
        except Exception:
            continue

    if not parsed:
        return

    parsed.sort(key=lambda t: t[0])
    end_date, end_value = parsed[-1]

    aktienanzahl = float(record.get("aktienanzahl") or 0.0)
    einstieg = record.get("aktieneinstiegskurs", {}) or {}
    einstieg_wert = float(einstieg.get("wert") or 0.0)

    basis_gesamt = einstieg_wert * aktienanzahl if aktienanzahl and einstieg_wert else 0.0

    target_1m = _subtract_months(end_date, 1)
    target_3m = _subtract_months(end_date, 3)
    target_6m = _subtract_months(end_date, 6)
    target_1y = _subtract_months(end_date, 12)

    start_1m = _find_start_value(parsed, target_1m)
    start_3m = _find_start_value(parsed, target_3m)
    start_6m = _find_start_value(parsed, target_6m)
    start_1y = _find_start_value(parsed, target_1y)

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

    record["performance"] = {
        "1m": round(perf_1m, 2),
        "3m": round(perf_3m, 2),
        "6m": round(perf_6m, 2),
        "1y": round(perf_1y, 2),
        "gesamt": round(perf_gesamt, 2),
    }

    record["performance_meta"] = record.get("performance_meta") or {}
    record["performance_meta"]["missing"] = record["performance_meta"].get("missing", [])


# ==========================
# Single stock update
# ==========================

def update_single_stock(path: Path, record: dict, today: date, summary: dict):
    aktienname = record.get("aktienname") or path.stem
    yname = record.get("yfinancename")
    aktienanzahl = float(record.get("aktienanzahl") or 0.0)

    if not yname:
        summary["errors"].append(
            {
                "file": str(path.name),
                "aktienname": aktienname,
                "message": "No 'yfinancename' defined",
            }
        )
        return False

    if yfinance is None:
        summary["errors"].append(
            {
                "file": str(path.name),
                "aktienname": aktienname,
                "message": "yfinance not installed",
            }
        )
        return False

    try:
        ticker = yfinance.Ticker(yname)
        finfo = ticker.fast_info
        last_price = float(finfo["last_price"])
    except Exception as e:
        summary["errors"].append(
            {
                "file": str(path.name),
                "aktienname": aktienname,
                "message": f"Error fetching last_price ({e})",
            }
        )
        return False

    kurs_heute = aktienanzahl * last_price

    aktienkurse = record.get("aktienkurse", [])
    if not isinstance(aktienkurse, list):
        aktienkurse = []

    today_str = today.isoformat()
    found = False
    for entry in aktienkurse:
        if str(entry.get("datum")) == today_str:
            entry["kurs"] = round(kurs_heute, 2)
            found = True
            break

    if not found:
        aktienkurse.append(
            {
                "datum": today_str,
                "kurs": round(kurs_heute, 2),
            }
        )

    def parse_date(entry):
        try:
            return datetime.fromisoformat(str(entry.get("datum")))
        except Exception:
            return datetime.min

    aktienkurse = sorted(aktienkurse, key=parse_date)
    record["aktienkurse"] = aktienkurse

    compute_performance_for_record(record)

    try:
        with path.open("w", encoding="utf-8") as f:
            json.dump(record, f, ensure_ascii=False, indent=2)
    except Exception as e:
        summary["errors"].append(
            {
                "file": str(path.name),
                "aktienname": aktienname,
                "message": f"Error writing JSON file ({e})",
            }
        )
        return False

    summary["updated_stocks"] += 1
    return True


# ==========================
# Main refresh logic
# ==========================

def refresh_all():
    print("[DEBUG] refresh_all() called")
    ensure_directories()

    raw_files = load_json_files()

    summary = {
        "schema": 1,
        "date": date.today().isoformat(),
        "run_started_at": datetime.now().isoformat(timespec="seconds"),
        "run_finished_at": None,
        "duration_seconds": None,
        "active_stocks": 0,
        "updated_stocks": 0,
        "skipped_inactive": 0,
        "errors": [],
        "version": None,
    }

    start_ts = datetime.now()

    active_records_for_dashboard = []

    for path, record in raw_files:
        status = str(record.get("status", "aktiv")).strip().lower()
        if status not in ("aktiv", "active"):
            summary["skipped_inactive"] += 1
            continue

        summary["active_stocks"] += 1

        ok = update_single_stock(path, record, date.today(), summary)
        if ok:
            cleaned = build_dashboard_record(record)
            cleaned["dateiname"] = path.stem
            active_records_for_dashboard.append(cleaned)

    generated_at = datetime.now().isoformat(timespec="seconds")
    meta = {
        "generated_at": generated_at,
        "active_stocks": summary["active_stocks"],
        "updated_stocks": summary["updated_stocks"],
        "skipped_inactive": summary["skipped_inactive"],
    }
    summary["version"] = generated_at

    # WICHTIG: immer dashboard_data.js schreiben, auch wenn keine aktiven Aktien gefunden wurden
    write_dashboard_data_js(active_records_for_dashboard, meta, OUTPUT_JS_FILE)

    end_ts = datetime.now()
    summary["run_finished_at"] = end_ts.isoformat(timespec="seconds")
    summary["duration_seconds"] = round((end_ts - start_ts).total_seconds(), 3)

    write_log(summary)

    return summary


# ==========================
# Flask app
# ==========================

app = Flask(
    __name__,
    static_folder=str(BASE_DIR),  # index.html, stock.html, app.js, styles.css, stocks/
    static_url_path=""
)
CORS(app)

@app.get("/")
def serve_index():
    return app.send_static_file("index.html")


@app.post("/api/refresh")
def api_refresh():
    try:
        summary = refresh_all()
        status_code = 200
        if summary["errors"]:
            status_code = 207
        return jsonify(summary), status_code
    except Exception as e:
        print("[ERROR] Unexpected error in /api/refresh:", e, file=sys.stderr)
        return jsonify({"status": "error", "message": str(e)}), 500


if __name__ == "__main__":
    print("[INFO] Backend running at http://localhost:5000")
    app.run(host="127.0.0.1", port=5000, debug=True)
