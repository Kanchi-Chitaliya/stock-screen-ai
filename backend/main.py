import asyncio
import json
import os
import time
from concurrent.futures import ThreadPoolExecutor
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field, validator

from stock_lists import NASDAQ_100, SP_100, TOP_25, get_combined_list, INDEX_MAP
from stock_data import StockDataFetcher
from dcf_analysis import DCFAnalyzer
from llm_analysis import analyze_stock
from ai_score import score_stock, score_stock_local
from sentiment_analysis import analyze_sentiment
from alerts import (
    list_alerts, create_alert, delete_alert, clear_triggered,
    pop_pending_browser_notifications, send_test_email, email_configured,
    alert_monitor,
)
from cache import cache
from utils import validate_ticker, validate_index, logger, TICKER_NOT_FOUND, DATA_FETCH_ERROR, INVALID_PARAMETERS

_DEFAULT_ORIGINS = "http://localhost:5173,http://localhost:3000,http://127.0.0.1:5173"
_CORS_ORIGINS = [o.strip() for o in os.environ.get("CORS_ORIGINS", _DEFAULT_ORIGINS).split(",") if o.strip()]

# Thread pool — match worker count to batch size
_pool = ThreadPoolExecutor(max_workers=10)
fetcher = StockDataFetcher()
dcf = DCFAnalyzer()

BATCH_SIZE = 5          # tickers fetched in parallel per batch
BATCH_DELAY = 0.8       # seconds between batches (rate-limit guard)


# ------------------------------------------------------------------ #
#  Startup: pre-warm cache in background                             #
# ------------------------------------------------------------------ #

async def _prewarm():
    tickers = get_combined_list()
    cached_count = sum(1 for t in tickers if cache.get(f"metrics:{t}") is not None)
    if cached_count == len(tickers):
        print(f"[prewarm] all {len(tickers)} tickers already cached — skipping")
        return

    print(f"[prewarm] warming {len(tickers) - cached_count} uncached tickers…")
    loop = asyncio.get_running_loop()
    fetched = 0
    for i in range(0, len(tickers), BATCH_SIZE):
        batch = tickers[i : i + BATCH_SIZE]
        # skip tickers already in cache
        uncached = [t for t in batch if cache.get(f"metrics:{t}") is None]
        if uncached:
            futures = [loop.run_in_executor(_pool, fetcher.get_current_metrics, t) for t in uncached]
            await asyncio.gather(*futures, return_exceptions=True)
            fetched += len(uncached)
        await asyncio.sleep(BATCH_DELAY)

    print(f"[prewarm] done — fetched {fetched} tickers")


@asynccontextmanager
async def lifespan(app: FastAPI):
    asyncio.create_task(_prewarm())
    asyncio.create_task(alert_monitor())
    yield
    _pool.shutdown(wait=False)


app = FastAPI(title="StockScreenAI", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=_CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ------------------------------------------------------------------ #
#  Indices                                                            #
# ------------------------------------------------------------------ #

@app.get("/api/search")
def search_stocks(q: str = Query(..., min_length=1, max_length=50)):
    """Search cached stocks by symbol or company name."""
    q_low = q.strip().lower()
    results = []
    now = time.time()
    for key, entry in cache._data.items():
        if not key.startswith("metrics:"):
            continue
        if now - entry["ts"] > cache.ttl:
            continue
        s = entry.get("value") or {}
        symbol = (s.get("symbol") or "").upper()
        name   = (s.get("name")   or "").lower()
        if not symbol or not (q_low in symbol.lower() or q_low in name):
            continue
        results.append({
            "symbol": symbol,
            "name":   s.get("name", ""),
            "sector": s.get("sector", ""),
            "price":  s.get("price"),
        })
    results.sort(key=lambda x: (
        0 if x["symbol"].lower() == q_low else
        1 if x["symbol"].lower().startswith(q_low) else
        2 if x["name"].lower().startswith(q_low) else
        3
    ))
    return results[:8]


@app.get("/api/indices")
def get_indices():
    return {"top_25": TOP_25, "nasdaq_100": NASDAQ_100, "sp_100": SP_100, "combined": get_combined_list()}


# ------------------------------------------------------------------ #
#  Screener — parallel batches, SSE stream                           #
# ------------------------------------------------------------------ #

@app.get("/api/screener/stream")
async def stream_screener(index: str = Query("combined")):
    """Stream stock screening results with real-time updates."""
    try:
        validate_index(index, list(INDEX_MAP.keys()))
    except ValueError as e:
        logger.warning(f"Invalid index: {index}")
        raise HTTPException(status_code=400, detail=str(e))
    
    tickers = INDEX_MAP.get(index, get_combined_list())
    logger.info(f"Screener started: {index} ({len(tickers)} tickers)")

    async def generate():
        yield f"data: {json.dumps({'type': 'start', 'total': len(tickers), 'index': index})}\n\n"
        loop = asyncio.get_running_loop()
        processed = 0
        errors = 0

        for i in range(0, len(tickers), BATCH_SIZE):
            batch = tickers[i : i + BATCH_SIZE]
            futures = [loop.run_in_executor(_pool, fetcher.get_current_metrics, t) for t in batch]
            results = await asyncio.gather(*futures, return_exceptions=True)

            for ticker, result in zip(batch, results):
                processed += 1
                if isinstance(result, Exception):
                    errors += 1
                    logger.warning(f"Screener error for {ticker}: {type(result).__name__}")
                    yield f"data: {json.dumps({'type': 'error', 'ticker': ticker, 'processed': processed, 'total': len(tickers)})}\n\n"
                elif result:
                    # Compute algorithmic AI score inline — fast, no API calls
                    try:
                        ai = score_stock_local(result)
                        s  = ai.get("score", {})
                        result["ai_score"]      = s.get("total_score")
                        result["ai_verdict"]    = s.get("verdict")
                        result["ai_fair_value"] = s.get("fair_value_range")
                    except Exception as e:
                        logger.warning(f"AI scoring failed for {ticker}: {type(e).__name__}")
                    
                    cached = cache.age_seconds(f"metrics:{ticker}")
                    result["_cached_age"] = cached
                    yield f"data: {json.dumps({'type': 'stock', 'data': result, 'processed': processed, 'total': len(tickers)})}\n\n"
                else:
                    logger.debug(f"No data for {ticker}")
                    yield f"data: {json.dumps({'type': 'skip', 'ticker': ticker, 'processed': processed, 'total': len(tickers)})}\n\n"

            # only throttle when fetching live (cache hits are instant)
            uncached_in_batch = sum(1 for t in batch if cache.get(f"metrics:{t}") is None)
            if uncached_in_batch:
                await asyncio.sleep(BATCH_DELAY)

        logger.info(f"Screener complete: {index} ({processed} processed, {errors} errors)")
        yield f"data: {json.dumps({'type': 'end', 'total': len(tickers), 'processed': processed, 'errors': errors})}\n\n"

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


# ------------------------------------------------------------------ #
#  Single Stock Detail                                                 #
# ------------------------------------------------------------------ #

@app.get("/api/stock/{ticker}")
async def get_stock(ticker: str):
    """Get full stock details with 5yr history and financials."""
    try:
        ticker = validate_ticker(ticker)
        logger.info(f"Stock detail request: {ticker}")
    except ValueError as e:
        logger.warning(f"Invalid ticker: {ticker}")
        raise HTTPException(status_code=400, detail=f"Invalid ticker: {str(e)}")
    
    loop = asyncio.get_running_loop()
    try:
        data = await loop.run_in_executor(_pool, fetcher.get_full_stock_data, ticker)
        if not data:
            logger.warning(f"No data found for {ticker}")
            raise HTTPException(status_code=404, detail=TICKER_NOT_FOUND)
        
        data["_cached_age"] = cache.age_seconds(f"detail:{ticker}")
        logger.debug(f"Stock detail loaded: {ticker}")
        return data
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Stock detail failed for {ticker}: {type(e).__name__}: {str(e)}")
        raise HTTPException(status_code=500, detail=DATA_FETCH_ERROR)


# ------------------------------------------------------------------ #
#  Request Models with Validation                                     #
# ------------------------------------------------------------------ #

class DCFRequest(BaseModel):
    revenue_growth_1_5: float = Field(default=10.0, ge=0, le=50, description="Years 1-5 revenue growth %")
    revenue_growth_6_10: float = Field(default=7.0, ge=0, le=50, description="Years 6-10 revenue growth %")
    fcf_margin: float = Field(default=15.0, ge=0, le=100, description="FCF margin % of revenue")
    terminal_growth_rate: float = Field(default=3.0, ge=0, le=10, description="Terminal growth rate %")
    discount_rate: float = Field(default=10.0, ge=1, le=50, description="WACC discount rate %")
    margin_of_safety: float = Field(default=25.0, ge=0, le=100, description="Margin of safety %")

    class Config:
        json_schema_extra = {
            "example": {
                "revenue_growth_1_5": 12,
                "revenue_growth_6_10": 8,
                "fcf_margin": 18,
                "terminal_growth_rate": 3,
                "discount_rate": 10,
                "margin_of_safety": 25,
            }
        }


# ------------------------------------------------------------------ #
#  DCF analysis                                                       #
# ------------------------------------------------------------------ #

@app.post("/api/dcf/{ticker}")
async def calculate_dcf(ticker: str, req: DCFRequest):
    """Calculate DCF valuation with custom assumptions."""
    try:
        ticker = validate_ticker(ticker)
        logger.info(f"DCF request: {ticker}")
    except ValueError as e:
        logger.warning(f"Invalid ticker: {ticker}")
        raise HTTPException(status_code=400, detail=f"Invalid ticker: {str(e)}")
    
    loop = asyncio.get_running_loop()
    try:
        result = await loop.run_in_executor(
            _pool,
            lambda: dcf.calculate(
                ticker=ticker,
                revenue_growth_1_5=req.revenue_growth_1_5,
                revenue_growth_6_10=req.revenue_growth_6_10,
                fcf_margin=req.fcf_margin,
                terminal_growth_rate=req.terminal_growth_rate,
                discount_rate=req.discount_rate,
                margin_of_safety=req.margin_of_safety,
            ),
        )
        if result.get("error"):
            raise HTTPException(status_code=400, detail=result["error"])
        logger.info(f"DCF calculated for {ticker}")
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"DCF calculation failed for {ticker}: {type(e).__name__}: {str(e)}")
        raise HTTPException(status_code=500, detail=DATA_FETCH_ERROR)


# ------------------------------------------------------------------ #
#  AI Score & LLM Analysis                                            #
# ------------------------------------------------------------------ #

@app.post("/api/ai-score/{ticker}")
async def get_ai_score(ticker: str):
    """Calculate 5-pillar AI investment score."""
    try:
        ticker = validate_ticker(ticker)
        logger.info(f"AI score request: {ticker}")
    except ValueError as e:
        logger.warning(f"Invalid ticker: {ticker}")
        raise HTTPException(status_code=400, detail=f"Invalid ticker: {str(e)}")
    
    loop = asyncio.get_running_loop()
    cached = cache.get(f"aiscore:{ticker}")
    if cached is not None:
        logger.debug(f"AI score cache hit: {ticker}")
        return cached
    
    try:
        stock_data = await loop.run_in_executor(_pool, fetcher.get_full_stock_data, ticker)
        if not stock_data:
            logger.warning(f"No data found for {ticker}")
            raise HTTPException(status_code=404, detail=TICKER_NOT_FOUND)
        
        result = await loop.run_in_executor(_pool, score_stock, stock_data)
        cache.set(f"aiscore:{ticker}", result)
        logger.info(f"AI score calculated for {ticker}")
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"AI score failed for {ticker}: {type(e).__name__}: {str(e)}")
        raise HTTPException(status_code=500, detail=DATA_FETCH_ERROR)


@app.post("/api/llm/{ticker}")
async def get_llm_analysis(ticker: str):
    """Get free-form LLM narrative analysis."""
    try:
        ticker = validate_ticker(ticker)
        logger.info(f"LLM analysis request: {ticker}")
    except ValueError as e:
        logger.warning(f"Invalid ticker: {ticker}")
        raise HTTPException(status_code=400, detail=f"Invalid ticker: {str(e)}")

    loop = asyncio.get_running_loop()
    try:
        stock_data = await loop.run_in_executor(_pool, fetcher.get_full_stock_data, ticker)
        if not stock_data:
            logger.warning(f"No data found for {ticker}")
            raise HTTPException(status_code=404, detail=TICKER_NOT_FOUND)

        result = await loop.run_in_executor(_pool, analyze_stock, stock_data)
        logger.info(f"LLM analysis completed for {ticker}")
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"LLM analysis failed for {ticker}: {type(e).__name__}: {str(e)}")
        raise HTTPException(status_code=500, detail=DATA_FETCH_ERROR)


# ------------------------------------------------------------------ #
#  Market & Investor Sentiment                                        #
# ------------------------------------------------------------------ #

@app.post("/api/sentiment/{ticker}")
async def get_sentiment(ticker: str):
    """Live news sentiment analysis powered by Claude."""
    try:
        ticker = validate_ticker(ticker)
        logger.info(f"Sentiment request: {ticker}")
    except ValueError as e:
        logger.warning(f"Invalid ticker: {ticker}")
        raise HTTPException(status_code=400, detail=f"Invalid ticker: {str(e)}")

    loop = asyncio.get_running_loop()
    try:
        stock_data = await loop.run_in_executor(_pool, fetcher.get_current_metrics, ticker)
        if not stock_data:
            logger.warning(f"No data found for {ticker}")
            raise HTTPException(status_code=404, detail=TICKER_NOT_FOUND)

        def _run_sentiment():
            import yfinance as yf
            tk = yf.Ticker(ticker)
            return analyze_sentiment(stock_data, tk)

        result = await loop.run_in_executor(_pool, _run_sentiment)
        if result.get("error"):
            raise HTTPException(status_code=400, detail=result["error"])
        logger.info(f"Sentiment analysis completed for {ticker}")
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Sentiment analysis failed for {ticker}: {type(e).__name__}: {str(e)}")
        raise HTTPException(status_code=500, detail=DATA_FETCH_ERROR)


# ------------------------------------------------------------------ #
#  Price Alerts                                                       #
# ------------------------------------------------------------------ #

class AlertRequest(BaseModel):
    ticker:        str
    name:          str   = ""
    target_price:  float = Field(..., gt=0)
    direction:     str   = Field(..., pattern="^(above|below)$")
    current_price: float = Field(..., gt=0)


@app.get("/api/alerts")
def get_alerts():
    return list_alerts()


@app.post("/api/alerts")
def add_alert(req: AlertRequest):
    try:
        ticker = validate_ticker(req.ticker)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return create_alert(ticker, req.name or ticker, req.target_price, req.direction, req.current_price)


@app.delete("/api/alerts/{alert_id}")
def remove_alert(alert_id: str):
    if not delete_alert(alert_id):
        raise HTTPException(status_code=404, detail="Alert not found")
    return {"deleted": alert_id}


@app.delete("/api/alerts")
def remove_triggered_alerts():
    return {"removed": clear_triggered()}


@app.get("/api/alerts/pending")
def pending_notifications():
    """Browser polls this to get newly triggered alerts for desktop notification."""
    return pop_pending_browser_notifications()


@app.post("/api/alerts/test-email")
def test_alert_email():
    if not email_configured():
        raise HTTPException(
            status_code=400,
            detail="Email not configured. Add ALERT_EMAIL_FROM and GMAIL_APP_PASSWORD to backend/.env"
        )
    try:
        send_test_email()
        return {"sent": True, "to": "configured address"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Email failed: {str(e)}")


@app.get("/api/alerts/config")
def alert_config():
    return {"email_configured": email_configured()}


# ------------------------------------------------------------------ #
#  Cache management                                                   #
# ------------------------------------------------------------------ #

@app.get("/api/cache/stats")
def cache_stats():
    return cache.stats()


@app.delete("/api/cache")
def clear_cache(prefix: str | None = None):
    removed = cache.clear(prefix)
    return {"cleared": removed, "prefix": prefix}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
