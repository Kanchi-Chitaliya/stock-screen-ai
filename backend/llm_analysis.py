import json
import os
import anthropic
from dotenv import load_dotenv

load_dotenv(override=True)

_client = None


def _get_client() -> anthropic.Anthropic:
    global _client
    if _client is None:
        key = os.environ.get("ANTHROPIC_API_KEY")
        if not key or key == "your_anthropic_api_key_here":
            raise ValueError(
                "ANTHROPIC_API_KEY is not set. Add your key to backend/.env and restart the server."
            )
        _client = anthropic.Anthropic(api_key=key)
    return _client


def analyze_stock(stock_data: dict) -> dict:
    """
    Produce a structured Graham-style analysis using Claude.
    stock_data is the full dict from StockDataFetcher.get_full_stock_data.
    """
    sym = stock_data.get("symbol", "")
    name = stock_data.get("name", sym)
    sector = stock_data.get("sector", "N/A")
    industry = stock_data.get("industry", "N/A")
    price = stock_data.get("price")
    mkt_cap = stock_data.get("market_cap")
    pe = stock_data.get("pe_ratio")
    p_fcf = stock_data.get("p_fcf")
    ev_ebitda = stock_data.get("ev_ebitda")
    pb = stock_data.get("price_to_book")
    rev_growth = stock_data.get("revenue_growth")
    net_margin = stock_data.get("profit_margin")
    op_margin = stock_data.get("operating_margin")
    de = stock_data.get("debt_to_equity")
    cr = stock_data.get("current_ratio")
    roe = stock_data.get("return_on_equity")
    dy = stock_data.get("dividend_yield")
    beta = stock_data.get("beta")
    graham_score = stock_data.get("graham_score", {})
    graham_number = stock_data.get("graham_number")
    description = stock_data.get("description", "")[:800]

    def fmt(v, pct=False, mult=1, decimals=1):
        if v is None:
            return "N/A"
        v = v * mult
        return f"{v:.{decimals}f}{'%' if pct else ''}"

    metrics_block = f"""
Company: {name} ({sym})
Sector: {sector} | Industry: {industry}
Current Price: ${fmt(price, decimals=2)}
Market Cap: ${fmt(mkt_cap/1e9 if mkt_cap else None, decimals=1)}B

VALUATION
  P/E (TTM): {fmt(pe)}
  P/FCF: {fmt(p_fcf)}
  EV/EBITDA: {fmt(ev_ebitda)}
  Price/Book: {fmt(pb)}
  Graham Number: ${fmt(graham_number, decimals=2)}

PROFITABILITY
  Revenue Growth (YoY): {fmt(rev_growth, pct=True, mult=100)}
  Net Margin: {fmt(net_margin, pct=True, mult=100)}
  Operating Margin: {fmt(op_margin, pct=True, mult=100)}
  Return on Equity: {fmt(roe, pct=True, mult=100)}

FINANCIAL HEALTH
  Debt/Equity: {fmt(de)}
  Current Ratio: {fmt(cr)}
  Dividend Yield: {fmt(dy, pct=True, mult=100)}

RISK
  Beta: {fmt(beta)}

GRAHAM SCORE: {graham_score.get('score', 'N/A')}/10
  Criteria passed: {sum(1 for c in graham_score.get('criteria', []) if c['passed'])}/{len(graham_score.get('criteria', []))}

BUSINESS SUMMARY (excerpt):
{description}
"""

    prompt = f"""You are a value investor trained in the principles of Benjamin Graham's "The Intelligent Investor".
Analyze the following stock data and produce a structured investment analysis.

{metrics_block}

Provide your analysis in the following JSON structure (respond ONLY with valid JSON, no markdown):
{{
  "business_overview": "2-3 sentence overview of the business model and competitive position",
  "competitive_moat": "Assessment of the company's economic moat (wide/narrow/none) with reasoning",
  "financial_strengths": ["up to 3 bullet points of key financial strengths"],
  "financial_concerns": ["up to 3 bullet points of key financial concerns or risks"],
  "graham_assessment": "How well does this stock meet Benjamin Graham's criteria for a defensive investor? Be specific about which criteria it passes or fails.",
  "valuation_verdict": "Is the stock undervalued, fairly valued, or overvalued based on Graham principles? Compare to the Graham Number if available.",
  "key_risks": ["up to 3 specific risks unique to this company/industry"],
  "verdict": "BUY" | "HOLD" | "AVOID",
  "verdict_reasoning": "1-2 sentence explanation of the verdict from a Graham value investing perspective",
  "confidence": "HIGH" | "MEDIUM" | "LOW"
}}"""

    client = _get_client()
    message = client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=1500,
        messages=[{"role": "user", "content": prompt}],
    )

    raw = message.content[0].text.strip()

    try:
        # Strip any markdown code fences if present
        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]
        analysis = json.loads(raw)
    except json.JSONDecodeError:
        analysis = {"raw_response": raw, "error": "Could not parse structured response"}

    return {
        "ticker": sym,
        "analysis": analysis,
        "model": "claude-sonnet-4-6",
    }
