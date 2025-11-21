# 📈 Stock Dashboard – Modern Portfolio Visualization  
*A clean, fast and interactive stock analytics dashboard powered by Python, Flask and JavaScript.*

> 🇬🇧 English version below  
> 🇩🇪 Deutsche Version oben

---

# 🇩🇪 Deutsch

## 🧭 Überblick
Dies ist ein modernes Aktien-Dashboard, das historische Kursdaten, Dividenden, Performance-Analysen und visuelle Charts miteinander kombiniert.  
Es basiert auf:

- **Python** (Datenverarbeitung, API, yfinance)
- **Flask** (Backend/Webserver)
- **JavaScript** (Frontend, Canvas-Charts)
- **HTML/CSS** (UI/UX)
- **JSON** als offene Datenstruktur  

Das Projekt bietet sowohl eine **Portfolio-Übersicht**, als auch **Detailseiten pro Aktie** – alles komplett clientseitig gerendert.

---

## ✨ Features

### 🔹 Portfolio Übersicht
- Gesamtwert des Portfolios  
- Gesamtperformance  
- 1-Monats-Performance  
- 🔥 *Today Performance* (aktueller Tag vs. Vortag)  
- Dividenden-Gesamt (mit Hover-Tooltip nach Jahren aggregiert)  
- Refresh-Button (aktualisiert Daten über das Backend)

### 🔹 Aktienkarten
- Sparkline-Charts (Canvas, mit Achsen/Grid)
- Aktueller Wert
- Performance (Farbcodes: Grün / Rot / Neutral)
- Zugriff auf Detailseite  
- Sauber responsive (1–6 Spalten)

### 🔹 Detailseite pro Aktie
- Vollständiger historischer Chart (alle Datenpunkte)
- 1M, 3M, 6M, 1Y, Gesamt-Performance (automatisch berechnet)
- Dividenden (Jahre aggregiert, Tooltip)
- Letzte 30 Kurses als Mini-Sparkline (optional)
- Cleanes Dark-Theme

### 🔹 Fake-Daten Generator (optional)
- Erstellt vollständige Fake-Portfolios  
- Nutzt reale Marktdaten via yfinance  
- Generiert:
  - Kursverläufe  
  - Dividenden  
  - Einstiegskurse  
  - Zufällige Haltedauer 1–7 Jahre  
  - JSON-Dateien im Produktionsformat  

Perfekt für die **öffentliche Version ohne private Daten**.

### 🔹 Add-Stock Feature
Ein Klick öffnet ein Formular:

- Ticker (yfinance)
- Kaufdatum
- Einstiegskurs pro Aktie
- Stückzahl

Backend lädt automatisch:
- Kurshistorie  
- Dividenden  
- Berechnet Performance  
- Speichert JSON-Datei  
- Dashboard lädt neu  

Damit können **andere Nutzer das Tool real verwenden**.

---

## 📁 Projektstruktur

