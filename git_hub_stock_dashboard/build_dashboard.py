import json
import sys
from pathlib import Path
from datetime import datetime

# ==========================
# Konfiguration
# ==========================

# Ordner mit den Roh-JSONs aus deinem Imba-Projekt
SOURCE_DIR = Path(r"D:\Projekte\Imba\screens\aktien")

# Dashboard-Projektordner (da liegt index.html, app.js, styles.css)
DASHBOARD_DIR = Path(r"D:\Projekte\dashboard_aktien")

# Zielordner für bereinigte, "relevante" JSON-Dateien
TARGET_JSON_DIR = DASHBOARD_DIR / "aktien"

# Datei, die vom Dashboard (index.html/app.js) eingelesen wird
OUTPUT_JS_FILE = DASHBOARD_DIR / "dashboard_data.js"

# Wie viele Kurspunkte sollen maximal pro Aktie verwendet werden?
MAX_DAYS = 30


# ==========================
# Hilfsfunktionen
# ==========================

def load_json_files(source_dir: Path):
    """
    Lädt alle .json-Dateien aus source_dir und gibt eine Liste von Tupeln zurück:
    (pfad, datensatz)
    """
    records = []
    for path in sorted(source_dir.glob("*.json")):
        try:
            with path.open("r", encoding="utf-8") as f:
                data = json.load(f)
            records.append((path, data))
        except Exception as e:
            print(f"[WARN] Konnte Datei nicht laden: {path} ({e})", file=sys.stderr)
    return records


def normalize_courses(aktienkurse):
    """
    Erwartet ein Array von Objekten mit:
      { "datum": "YYYY-MM-DD", "kurs": <zahl> }

    Sortiert nach Datum und gibt nur die letzten MAX_DAYS Einträge zurück.
    """
    if not isinstance(aktienkurse, list):
        return []

    # Versuch, nach Datum zu sortieren
    def parse_date(entry):
        try:
            return datetime.fromisoformat(str(entry.get("datum")))
        except Exception:
            return datetime.min

    sorted_courses = sorted(aktienkurse, key=parse_date)

    # Letzte MAX_DAYS Einträge behalten
    return sorted_courses[-MAX_DAYS:]


def build_dashboard_record(raw_record: dict) -> dict:
    """
    Nimmt ein Roh-Record (voller JSON) und baut einen
    bereinigten Record für das Dashboard:

    - Kopf wird übernommen (schema, version, aktienname, etc.)
    - aktienkurse wird auf die letzten MAX_DAYS Einträge reduziert
    """
    if not isinstance(raw_record, dict):
        return {}

    # Basis-Kopie ohne aktienkurse
    result = {k: v for k, v in raw_record.items() if k != "aktienkurse"}

    aktienkurse = raw_record.get("aktienkurse", [])
    result["aktienkurse"] = normalize_courses(aktienkurse)

    return result


def ensure_directories():
    """
    Stellt sicher, dass Dashboard-Ordner und Zielordner existieren.
    """
    DASHBOARD_DIR.mkdir(parents=True, exist_ok=True)
    TARGET_JSON_DIR.mkdir(parents=True, exist_ok=True)


def write_dashboard_data_js(records: list, output_file: Path):
    """
    Schreibt eine JS-Datei im Format:

    window.DASHBOARD_DATA = [ {...}, {...}, ... ];
    """
    # Schön formatiertes JSON, aber als JS-Assignment
    payload = "window.DASHBOARD_DATA = " + json.dumps(
        records,
        ensure_ascii=False,
        indent=2
    ) + ";\n"

    with output_file.open("w", encoding="utf-8") as f:
        f.write(payload)

    print(f"[INFO] dashboard_data.js geschrieben: {output_file}")


def write_per_stock_json(records_with_paths: list):
    """
    Schreibt für jede Aktie eine bereinigte JSON in TARGET_JSON_DIR.
    Der Dateiname basiert auf dem ursprünglichen Namen.
    """
    for src_path, cleaned_record in records_with_paths:
        target_name = src_path.name  # gleicher Basisname wie Quelle
        target_path = TARGET_JSON_DIR / target_name

        try:
            with target_path.open("w", encoding="utf-8") as f:
                json.dump(cleaned_record, f, ensure_ascii=False, indent=2)
            print(f"[INFO] Bereinigte JSON geschrieben: {target_path}")
        except Exception as e:
            print(f"[WARN] Konnte JSON nicht schreiben: {target_path} ({e})", file=sys.stderr)


# ==========================
# Hauptlogik
# ==========================

def main():
    print(f"[INFO] Lade Rohdaten aus: {SOURCE_DIR}")

    ensure_directories()

    raw_files = load_json_files(SOURCE_DIR)
    if not raw_files:
        print(f"[WARN] Keine JSON-Dateien in {SOURCE_DIR} gefunden.")
        return

    cleaned_records = []
    cleaned_records_with_paths = []

    for src_path, raw_record in raw_files:
        status = raw_record.get("status", "unbekannt")
        if status != "aktiv":
            print(f"[INFO] Überspringe inaktive Aktie: {src_path.name} (status={status})")
            continue

        cleaned = build_dashboard_record(raw_record)

        # Nur Records mit Kursdaten übernehmen
        aktienkurse = cleaned.get("aktienkurse", [])
        if not aktienkurse:
            print(f"[WARN] Keine Kursdaten (aktienkurse) in: {src_path.name}, übersprungen.")
            continue

        cleaned_records.append(cleaned)
        cleaned_records_with_paths.append((src_path, cleaned))

    if not cleaned_records:
        print("[WARN] Keine aktiven Aktien mit Kursdaten gefunden. Abbruch.")
        return

    # JS-Datei für das Dashboard schreiben
    write_dashboard_data_js(cleaned_records, OUTPUT_JS_FILE)

    # Optional: pro Aktie eine bereinigte JSON im Dashboard-Projekt ablegen
    write_per_stock_json(cleaned_records_with_paths)

    print(f"[INFO] Fertig. Aktive Aktien im Dashboard: {len(cleaned_records)}")


if __name__ == "__main__":
    main()
