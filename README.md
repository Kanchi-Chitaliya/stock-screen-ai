# StockScreenAI

StockScreenAI combines classic Graham value investing with modern AI-powered stock screening. It provides a fast, data-driven screener for pre-built watchlists, complete stock detail pages, DCF modeling, and optional Claude-powered narrative analysis.

## Why StockScreenAI

- Built for investors who want both rule-based fundamentals and intelligent contextual analysis.
- Uses a Graham-inspired score for conservative valuation discipline.
- Uses Claude AI to generate richer investment insights, fair value ranges, and narrative summaries.
- Designed for speed with streaming screener results and cached metrics.

## Features

- **Graham Score**: Rule-based valuation checklist with sector-aware thresholds
- **AI Score**: 5-pillar investment scoring across quality, performance, growth, capital, and valuation
- **DCF Valuation**: Customizable cash-flow valuation calculator
- **LLM Analysis**: Optional Claude narrative analysis for individual stocks
- **Real-time Screener**: SSE streaming of live stock metrics and scores
- **Multiple Indices**: NASDAQ-100, S&P-100, TOP-25, and combined watchlists
- **Cache-backed performance**: Thread-safe disk cache for fast repeat queries

## Quick Start

```bash
./start.sh
```

This script will:
1. Install Python dependencies
2. Install Node.js dependencies
3. Start the backend on `http://localhost:8000`
4. Start the frontend on `http://localhost:5173`

Then open:
- Frontend: `http://localhost:5173`
- API docs: `http://localhost:8000/docs`

> If you want AI analysis, copy `backend/.env.example` to `backend/.env` and set `ANTHROPIC_API_KEY`.

## Project Structure

```
stock-screen-ai/
├── backend/          # FastAPI API, data fetchers, scoring, caching
│   ├── main.py
│   ├── stock_data.py
│   ├── ai_score.py
│   ├── llm_analysis.py
│   ├── dcf_analysis.py
│   ├── cache.py
│   ├── utils.py
│   ├── requirements.txt
│   └── .env.example
└── frontend/         # React + Vite + Tailwind UI
    ├── package.json
    ├── vite.config.js
    └── src/
        ├── App.jsx
        ├── api.js
        └── components/
            ├── StockScreener.jsx
            ├── StockDetail.jsx
            ├── AIScore.jsx
            ├── DCFCalculator.jsx
            └── GrahamScore.jsx
```

## Setup

### Prerequisites
- Python 3.11+
- Node.js 16+

### Backend Setup

```bash
cd backend
pip install -r requirements.txt
```

### Frontend Setup

```bash
cd frontend
npm install
```

### Enable Claude AI

```bash
cd backend
cp .env.example .env
# add your ANTHROPIC_API_KEY to backend/.env
```

## Development

Start backend:

```bash
cd backend
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

Start frontend:

```bash
cd frontend
npm run dev
```

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/indices` | Returns available index lists |
| GET | `/api/screener/stream?index=combined` | Streams screener results via SSE |
| GET | `/api/stock/{ticker}` | Full stock detail payload |
| POST | `/api/dcf/{ticker}` | Run DCF valuation with custom assumptions |
| POST | `/api/ai-score/{ticker}` | Run 5-pillar AI investment scoring |
| POST | `/api/llm/{ticker}` | Run free-form LLM analysis |
| GET | `/api/cache/stats` | Cache metrics and hit statistics |
| DELETE | `/api/cache?prefix=metrics:` | Clear cache entries by prefix |

## Scoring Overview

### Graham Score
A rule-based score from 0–10 that evaluates a company on:
- valuation ratios
- profitability
- balance-sheet health
- growth trends
- shareholder returns

Financial-sector companies receive adjusted thresholds.

### AI Score
A 0–10 normalized score derived from a 5-pillar framework:

| Pillar | Weight |
|--------|--------|
| Business Quality | 30%
| Financial Performance | 25%
| Growth & Durability | 20%
| Balance Sheet & Capital | 15%
| Valuation | 10%

Modes:
- **Local mode**: deterministic scoring with no external API
- **AI mode**: Claude-powered narrative scoring when `ANTHROPIC_API_KEY` is present

### Verdicts
- `STRONG BUY` ≥ 7.5
- `BUY` ≥ 6.5
- `HOLD` ≥ 5.0
- `REDUCE` ≥ 3.5
- `AVOID` < 3.5

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `ANTHROPIC_API_KEY` | No | Enables Claude-powered AI scoring |
| `CACHE_TTL_SECONDS` | No | Cache TTL in seconds (default `3600`) |
| `CORS_ORIGINS` | No | Comma-separated allowed origins (default: localhost dev ports) |

## Tech Stack

### Backend
- FastAPI
- yfinance
- pandas / numpy
- Anthropic Claude (optional)

### Frontend
- React 18
- Vite
- Tailwind CSS
- Recharts
- Lucide React

## License

MIT License — see `LICENSE`

## Disclaimer

This project is for educational and informational purposes only. It is not financial advice. Always perform your own research and consult a qualified advisor before making investment decisions.

---
