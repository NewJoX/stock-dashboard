# 📈 Stock Dashboard

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
![Python](https://img.shields.io/badge/Python-3.10%2B-blue)
![Flask](https://img.shields.io/badge/Flask-Backend-green)
![JavaScript](https://img.shields.io/badge/JavaScript-Frontend-yellow)
![Status](https://img.shields.io/badge/Status-Active-success)

> 🇩🇪 **Deutsch** · 🇬🇧 **English below**

---

## 🇩🇪 Überblick

**Stock Dashboard** ist ein modernes, dunkles Aktien-Dashboard, das:

- historische Kursdaten,
- Dividenden,
- Performance (1M, 3M, 6M, 1Y, Gesamt),
- und einen „Today“-Vergleich

in einem **klaren UI** mit **Canvas-Charts** visualisiert.

Das Projekt kombiniert:

- **Python & Flask** als Backend/API  
- **yfinance** für Marktdaten  
- **JavaScript (Canvas)** für Charts  
- **HTML/CSS** für das Frontend  
- **JSON** als Datenschema für einzelne Aktien

Es eignet sich sowohl als **privates Portfolio-Tool**, als auch als **Tech-Demo / Lernprojekt** für Fullstack-Entwicklung.

---

## ✨ Features

### 🔹 Portfolio-Übersicht

- Gesamtwert des Portfolios  
- Gesamtperformance (inkl. Dividenden)  
- 1M Performance  
- Today Performance (heutiger Kurs vs. letzter Eintrag)  
- Dividenden-Gesamtwert mit **Hover-Tooltip pro Jahr**  
- „Refresh“-Button, der das Backend anstößt, Daten zu aktualisieren

### 🔹 Aktienkarten (Overview Grid)

- Responsive Grid (1–6 Spalten je nach Bildschirmbreite)  
- Sparkline-Chart (Canvas) für die letzten 30 Datenpunkte  
- Aktueller Wert & Gesamtperformance (farbig: grün/rot/neutral)  
- 1M-Performance (absolut & in Prozent)  
- Klick auf eine Karte öffnet die **Detailseite**

### 🔹 Detailseite pro Aktie

- Voller historischer Kursverlauf als Linienchart (Canvas)  
- Zeitbereiche: **1M, 3M, 6M, 1Y, All**  
- Performance-Berechnungen je Zeitraum (absolut & prozentual)  
- Einstiegsdaten: Kaufdatum, Entry Price, Shares  
- Dividenden:
  - in der JSON mit Datum gespeichert (z. B. `2025-09-27`)
  - im UI nach Jahren aggregiert (`2024`, `2025`, …)
  - Gesamtdividenden mit Tooltip pro Jahr

### 🔹 Add-Stock Feature

Über den **„Add stock“** Button:

- Ticker (yfinance Symbol) eingeben  
- Kaufen-Datum / Entry Price / Anzahl Aktien  
- Backend:
  - holt historische Kursdaten
  - holt Dividenden
  - berechnet Performance
  - erzeugt eine neue JSON im `stocks/` Ordner
  - aktualisiert die Dashboard-Daten

→ Andere Nutzer können das Dashboard mit eigenen Daten verwenden.

### 🔹 Fake-Portfolio Generator

Mit `generate_fake_portfolio.py`:

- Erzeugt ein globales Fake-Portfolio (z. B. AAPL, MSFT, ALV.DE etc.)  
- Nutzt echte Marktdaten via yfinance  
- Zufällige Haltedauer (1–7 Jahre)  
- Investitionssumme (z. B. 4k–8k) → Stückzahl  
- Kurs-History + Dividenden + Performance werden realistisch generiert  
- Speichert jede Aktie als JSON im `stocks/` Ordner

Ideal für eine **öffentliche Demo**, ohne echte privaten Finanzdaten zu zeigen.

---

## 🧱 Tech Stack

- **Backend**
  - Python 3.10+
  - Flask
  - yfinance

- **Frontend**
  - Plain HTML
  - CSS (Dark Theme)
  - Vanilla JavaScript (Canvas für Charts)

- **Daten**
  - JSON-Dateien pro Aktie (`stocks/*.json`)
  - `dashboard_data.js` als Snapshot für das Frontend

---

## 📂 Projektstruktur

Beispielhafte Struktur:

```text
stock-dashboard/
│
├─ index.html              # Dashboard Overview
├─ stock.html              # Detailseite pro Aktie
├─ styles.css              # Styling (Dark Mode)
├─ app.js                  # Haupt-Frontend-Logik (Overview)
├─ stock.js                # Frontend-Logik für Detailseite
│
├─ server.py               # Flask-Server (API, Routing)
├─ generate_fake_portfolio.py  # Fake-Daten-Generator
│
├─ stocks/                 # Aktien-JSONs (Fake oder echte)
│   ├─ Apple.json
│   ├─ Nvidia.json
│   └─ ...
│
├─ assets/                 # Screenshots, Logo etc. (optional)
│   ├─ logo.png
│   └─ screenshots/
│       ├─ dashboard_overview.png
│       ├─ stock_detail.png
│       └─ add_stock_modal.png
│
├─ README.md
└─ LICENSE


