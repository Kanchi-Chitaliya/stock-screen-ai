"""
Market & Investor Sentiment — live news → Claude analysis.

Fetches up to 10 recent articles from yfinance, strips HTML,
then asks Claude to rate sentiment and explain what's driving the stock.
"""

import json
import os
import re
import time
from typing import Optional

import anthropic
from dotenv import load_dotenv

load_dotenv(override=True)

_client: Optional[anthropic.Anthropic] = None


def _get_client() -> anthropic.Anthropic:
    global _client
    if _client is None:
        key = os.environ.get("ANTHROPIC_API_KEY", "")
        if not key or "your_anthropic" in key:
            raise ValueError(
                "ANTHROPIC_API_KEY is not set. Add your key to backend/.env and restart."
            )
        _client = anthropic.Anthropic(api_key=key)
    return _client


def _strip_html(text: str) -> str:
    return re.sub(r"<[^>]+>", " ", text or "").strip()


def _fetch_news(tk) -> list[dict]:
    """Extract title + summary from yfinance news. Returns list newest-first."""
    articles = []
    try:
        raw = tk.news or []
        for item in raw[:12]:
            c = item.get("content", {})
            title     = (c.get("title") or "").strip()
            summary   = _strip_html(c.get("summary") or c.get("description") or "")[:600]
            pub_date  = c.get("pubDate", "")
            publisher = c.get("provider", {}).get("displayName", "")
            url       = (
                c.get("canonicalUrl",    {}).get("url", "") or
                c.get("clickThroughUrl", {}).get("url", "")
            )
            if title:
                articles.append({
                    "title":     title,
                    "summary":   summary,
                    "date":      pub_date,
                    "publisher": publisher,
                    "url":       url,
                })
    except Exception:
        pass
    return articles


def analyze_sentiment(stock_data: dict, tk) -> dict:
    """
    Fetch live news for the ticker and use Claude to produce a structured
    sentiment analysis — score, key drivers, bull/bear catalysts, and themes.
    """
    articles = _fetch_news(tk)
    if not articles:
        return {"error": "No recent news articles found for this ticker."}

    sym    = stock_data.get("symbol", "")
    name   = stock_data.get("name", sym)
    sector = stock_data.get("sector", "N/A")
    price  = stock_data.get("price")

    chg     = stock_data.get("regular_market_change")
    chg_pct = stock_data.get("regular_market_change_pct")
    session_line = ""
    if chg is not None and chg_pct is not None:
        sign = "+" if chg >= 0 else ""
        session_line = f"Today's move: {sign}{chg:.2f} ({sign}{chg_pct * 100:.2f}%)"

    post_price = stock_data.get("post_market_price")
    if post_price:
        post_chg = stock_data.get("post_market_change") or 0
        session_line += f"  |  After-hours: ${post_price:.2f} ({'+' if post_chg >= 0 else ''}{post_chg:.2f})"

    news_block = "\n".join(
        f"[{i+1}] {a['publisher']} — {a['date'][:10]}\n"
        f"    TITLE: {a['title']}\n"
        f"    {a['summary']}"
        for i, a in enumerate(articles)
    )

    prompt = f"""You are a senior equity strategist who monitors real-time market sentiment and investor positioning.
Analyze the following recent news for {name} ({sym}) and produce a structured sentiment assessment.

STOCK CONTEXT
  Ticker:  {sym}
  Name:    {name}
  Sector:  {sector}
  Price:   ${price:.2f if price else 'N/A'}
  {session_line}

RECENT NEWS ARTICLES (newest first)
{news_block}

Based on this news, produce a JSON response (ONLY valid JSON, no markdown fences):
{{
  "sentiment_score": <integer 1-10 where 1=very bearish, 5=neutral, 10=very bullish>,
  "sentiment_label": "Very Bullish" | "Bullish" | "Neutral" | "Bearish" | "Very Bearish",
  "one_line_summary": "<single sentence capturing the dominant narrative right now>",
  "what_is_driving_the_stock": [
    "<primary catalyst or theme — be specific, e.g. 'Earnings beat: EPS $2.84 vs $2.67 est (+6.3%)'>",
    "<secondary driver>",
    "<optional third driver>"
  ],
  "bull_catalysts": [
    "<positive factor from the news>",
    "<second positive factor>",
    "<optional third>"
  ],
  "bear_risks": [
    "<key risk or concern from the news>",
    "<second risk>",
    "<optional third>"
  ],
  "key_themes": ["<theme 1>", "<theme 2>", "<theme 3>"],
  "investor_tone": "euphoric" | "optimistic" | "cautious" | "fearful" | "panic",
  "news_sentiment_breakdown": {{
    "bullish_count": <number of bullish articles>,
    "neutral_count": <number of neutral articles>,
    "bearish_count": <number of bearish articles>
  }},
  "notable_headlines": [
    {{"title": "<most important headline>", "sentiment": "bullish" | "neutral" | "bearish", "why": "<1 sentence>"}},
    {{"title": "<second headline>", "sentiment": "bullish" | "neutral" | "bearish", "why": "<1 sentence>"}}
  ]
}}"""

    client = _get_client()
    msg = client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=1800,
        messages=[{"role": "user", "content": prompt}],
    )

    raw = msg.content[0].text.strip()
    if raw.startswith("```"):
        raw = raw.split("```")[1]
        if raw.startswith("json"):
            raw = raw[4:]

    try:
        result = json.loads(raw)
    except json.JSONDecodeError:
        result = {"raw_response": raw, "error": "parse_failed"}

    return {
        "ticker":        sym,
        "analysis":      result,
        "articles":      articles,
        "article_count": len(articles),
        "fetched_at":    time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "model":         "claude-sonnet-4-6",
    }
