"""
Market & Investor Sentiment — rule-based, no API required.

Fetches recent news from yfinance and scores each article with keyword
matching to produce a structured 1-10 sentiment assessment.
"""

import re
import time
from collections import Counter


# ── Keyword lists ─────────────────────────────────────────────────────────

_BULLISH = [
    "beat", "beats", "exceeded", "surpass", "record high", "all-time high",
    "upgraded", "upgrade", "strong buy", "outperform", "raised guidance",
    "raised forecast", "raised price target", "raised outlook",
    "revenue growth", "earnings beat", "eps beat", "profit beat",
    "buyback", "share repurchase", "dividend increase", "special dividend",
    "acquisition", "partnership", "expansion", "new contract",
    "regulatory approval", "fda approval", "breakthrough", "launch",
    "above expectations", "better than expected", "ahead of estimates",
    "accelerat", "momentum", "robust demand", "bullish", "rally",
    "surge", "soar", "jump", "climbs", "rises", "record revenue",
    "record earnings", "record profit", "strong demand", "positive outlook",
    "raised its", "new high", "market share gain", "margin expansion",
    "cost reduction", "efficiency", "beat estimates", "topped estimates",
]

_BEARISH = [
    "miss", "missed", "fell short", "below expectations", "downgraded",
    "downgrade", "sell rating", "underperform", "cut guidance",
    "lowered guidance", "lowered forecast", "lowered outlook",
    "reduced guidance", "revenue decline", "revenue miss", "earnings miss",
    "eps miss", "net loss", "operating loss", "lawsuit", "investigation",
    "sec probe", "antitrust", "regulatory scrutiny", "recall", "layoff",
    "layoffs", "job cuts", "restructuring", "warning", "profit warning",
    "margin compression", "disappointing", "disappoint", "weak demand",
    "deficit", "bearish", "crash", "plunge", "slump", "tumbles",
    "falls", "drops sharply", "below estimate", "missed estimate",
    "fine", "penalty", "fraud", "accounting", "restatement",
    "supply chain", "shortage", "headwind", "uncertainty", "slowdown",
]

_STOP_WORDS = {
    "the", "a", "an", "in", "on", "at", "to", "for", "of", "and", "or",
    "is", "are", "was", "were", "be", "been", "being", "have", "has",
    "had", "do", "does", "did", "will", "would", "could", "should",
    "may", "might", "its", "it", "as", "by", "from", "with", "this",
    "that", "not", "but", "if", "than", "also", "about", "report",
    "says", "said", "new", "stock", "shares", "company", "quarter",
    "year", "first", "second", "third", "fourth", "after", "before",
    "into", "their", "over", "down", "up", "out", "more", "can",
}


# ── Helpers ───────────────────────────────────────────────────────────────

def _strip_html(text: str) -> str:
    return re.sub(r"<[^>]+>", " ", text or "").strip()


def _fetch_news(tk) -> list[dict]:
    articles = []
    try:
        raw = tk.news or []
        for item in raw[:14]:
            c         = item.get("content", {})
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
                    "title": title, "summary": summary,
                    "date": pub_date, "publisher": publisher, "url": url,
                })
    except Exception:
        pass
    return articles


def _count_signals(title: str, summary: str) -> tuple[int, int]:
    """Return (bullish_hits, bearish_hits) for one article."""
    text = (title + " " + (summary or "")).lower()
    bull = sum(1 for kw in _BULLISH if kw in text)
    bear = sum(1 for kw in _BEARISH if kw in text)
    return bull, bear


def _article_label(bull: int, bear: int) -> str:
    if bull > bear:   return "bullish"
    if bear > bull:   return "bearish"
    return "neutral"


def _extract_themes(articles: list[dict], n: int = 5) -> list[str]:
    freq = Counter()
    for a in articles:
        for w in re.findall(r"[a-zA-Z]{4,}", a["title"].lower()):
            if w not in _STOP_WORDS:
                freq[w] += 1
    return [w.title() for w, _ in freq.most_common(n)]


# ── Main entry point ──────────────────────────────────────────────────────

def analyze_sentiment(stock_data: dict, tk) -> dict:
    """
    Keyword-based sentiment analysis on live yfinance news.
    No external API required.
    """
    articles = _fetch_news(tk)
    if not articles:
        return {"error": "No recent news articles found for this ticker."}

    sym  = stock_data.get("symbol", "")
    name = stock_data.get("name", sym)

    # Score every article
    scored = []
    for a in articles:
        bull, bear = _count_signals(a["title"], a.get("summary", ""))
        scored.append({**a, "_bull": bull, "_bear": bear, "_sent": _article_label(bull, bear)})

    n_bull    = sum(1 for s in scored if s["_sent"] == "bullish")
    n_neutral = sum(1 for s in scored if s["_sent"] == "neutral")
    n_bear    = sum(1 for s in scored if s["_sent"] == "bearish")
    total     = len(scored)

    # ── Score: 1-10 based on bull/bear ratio + keyword intensity ──────────
    net_ratio  = (n_bull - n_bear) / total if total else 0          # -1 … +1
    avg_bull   = sum(s["_bull"] for s in scored) / total if total else 0
    avg_bear   = sum(s["_bear"] for s in scored) / total if total else 0
    intensity  = (avg_bull - avg_bear) * 0.4
    raw        = 5.0 + net_ratio * 3.5 + intensity
    score      = int(max(1, min(10, round(raw))))

    # ── Labels ────────────────────────────────────────────────────────────
    if score >= 9:
        label, tone = "Very Bullish", "euphoric"
    elif score >= 7:
        label, tone = "Bullish",      "optimistic"
    elif score == 6:
        label, tone = "Slightly Bullish", "optimistic"
    elif score == 5:
        label, tone = "Neutral",      "cautious"
    elif score == 4:
        label, tone = "Slightly Bearish", "cautious"
    elif score >= 2:
        label, tone = "Bearish",      "fearful"
    else:
        label, tone = "Very Bearish", "panic"

    # ── One-line summary ──────────────────────────────────────────────────
    direction = ("bullish" if n_bull > n_bear else
                 "bearish" if n_bear > n_bull else "mixed")
    summary = (
        f"{name} news flow is {direction} — {n_bull} of {total} recent articles "
        f"carry bullish signals vs {n_bear} bearish, putting sentiment at {score}/10 ({label})."
    )

    # ── Drivers: titles from the most-polarized articles ──────────────────
    top_bull = [s for s in scored if s["_sent"] == "bullish"]
    top_bear = [s for s in scored if s["_sent"] == "bearish"]

    if n_bull >= n_bear:
        driver_arts = sorted(top_bull, key=lambda s: s["_bull"], reverse=True)[:3]
    else:
        driver_arts = sorted(top_bear, key=lambda s: s["_bear"], reverse=True)[:3]
    drivers = [a["title"] for a in driver_arts] or [scored[0]["title"]]

    bull_catalysts = [a["title"] for a in sorted(top_bull, key=lambda s: s["_bull"], reverse=True)[:3]] \
                     or ["No strong bullish signals in recent headlines"]
    bear_risks     = [a["title"] for a in sorted(top_bear, key=lambda s: s["_bear"], reverse=True)[:3]] \
                     or ["No strong bearish signals in recent headlines"]

    # ── Notable headlines ─────────────────────────────────────────────────
    notable_src = sorted(scored,
                         key=lambda s: abs(s["_bull"] - s["_bear"]) + s["_bull"] + s["_bear"],
                         reverse=True)[:4]
    notable_headlines = []
    for n in notable_src:
        parts = []
        if n["_bull"]:
            parts.append(f"{n['_bull']} bullish keyword{'s' if n['_bull']!=1 else ''}")
        if n["_bear"]:
            parts.append(f"{n['_bear']} bearish keyword{'s' if n['_bear']!=1 else ''}")
        why = (", ".join(parts) + " detected") if parts else "no strong signals"
        notable_headlines.append({
            "title":     n["title"],
            "sentiment": n["_sent"],
            "why":       why,
        })

    themes = _extract_themes(articles)

    clean_articles = [{k: v for k, v in a.items() if not k.startswith("_")} for a in scored]

    return {
        "ticker":   sym,
        "analysis": {
            "sentiment_score":           score,
            "sentiment_label":           label,
            "one_line_summary":          summary,
            "what_is_driving_the_stock": drivers,
            "bull_catalysts":            bull_catalysts,
            "bear_risks":                bear_risks,
            "key_themes":                themes,
            "investor_tone":             tone,
            "news_sentiment_breakdown":  {
                "bullish_count": n_bull,
                "neutral_count": n_neutral,
                "bearish_count": n_bear,
            },
            "notable_headlines": notable_headlines,
        },
        "articles":      clean_articles,
        "article_count": len(clean_articles),
        "fetched_at":    time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "model":         "keyword-based",
    }
