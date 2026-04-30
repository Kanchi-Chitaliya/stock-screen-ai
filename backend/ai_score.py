"""
AI Score — multi-factor investment analysis.

Two modes:
  • API mode  — Claude (claude-sonnet-4-6) does the analysis.
  • Local mode — Pure algorithmic scorer. No API key required.

Both modes return identical JSON shapes.

PILLAR WEIGHTS & SUB-METRICS (industry-aligned)
──────────────────────────────────────────────────────────────────────────────
Pillar 1 · Business Quality (30 pts)
  Gross margin      — raw pricing power; hardest metric to compress in downturns
  ROIC              — capital efficiency; primary moat signal (Morningstar / Fundsmith)
  FCF conversion    — FCF / Net Income; earnings quality (Terry Smith primary filter)

Pillar 2 · Profitability & Efficiency (25 pts)
  Operating margin  — execution quality after COGS
  Net margin        — after-tax profitability level
  Revenue consistency — std-dev of annual growth; separates compounders from cyclicals

Pillar 3 · Growth & Durability (20 pts)
  Revenue CAGR      — organic top-line compounding (non-overlapping with P2)
  EPS CAGR          — only here, not in P2 (previous double-count fixed)
  Recent YoY        — momentum signal

Pillar 4 · Balance Sheet & Capital Allocation (15 pts)
  Net Debt / EBITDA — debt serviceability (credit-analyst standard; replaces D/E)
  Interest coverage — ability to service existing debt
  Shareholder yield — dividends + buybacks as % of market cap

Pillar 5 · Valuation (10 pts)
  P/FCF             — cash-based valuation
  EV/EBITDA         — enterprise-level multiple
  PEG               — growth-adjusted P/E
──────────────────────────────────────────────────────────────────────────────
Total normalised to 0–10 scale.
"""

import json
import os
from typing import Optional

from dotenv import load_dotenv

load_dotenv(override=True)

_client = None


def _api_key() -> Optional[str]:
    key = os.environ.get("ANTHROPIC_API_KEY", "")
    if key and "your_anthropic" not in key and len(key) > 20:
        return key
    return None


def _get_client():
    global _client
    if _client is None:
        import anthropic
        _client = anthropic.Anthropic(api_key=_api_key())
    return _client


# ─────────────────────────────────────────────────────────────────────────────
#  Helpers
# ─────────────────────────────────────────────────────────────────────────────

def _n(v, default=None):
    """Return float or default if None / NaN."""
    if v is None:
        return default
    try:
        f = float(v)
        import math
        return default if (math.isnan(f) or math.isinf(f)) else f
    except (TypeError, ValueError):
        return default


def _pct(v):
    """Format decimal as percent string, e.g. 0.312 → '31.2%'."""
    return f"{v * 100:.1f}%" if v is not None else "N/A"


def _fmt(v, decimals=1, prefix="", suffix=""):
    return f"{prefix}{v:.{decimals}f}{suffix}" if v is not None else "N/A"


def _tier(v, thresholds):
    """
    thresholds: list of (cutoff, points) sorted descending.
    Returns points for first cutoff where v >= cutoff.
    Last entry is the fallback. Use for metrics where higher = better.
    """
    if v is None:
        return thresholds[-1][1]
    for cutoff, pts in thresholds[:-1]:
        if v >= cutoff:
            return pts
    return thresholds[-1][1]


def _tier_lower_better(v, thresholds):
    """
    thresholds: list of (ceiling, points) sorted ascending.
    Returns points for first ceiling where v <= ceiling.
    Last entry is the fallback. Use for valuation metrics where lower = better.
    """
    if v is None:
        return thresholds[-1][1]
    for ceiling, pts in thresholds[:-1]:
        if v <= ceiling:
            return pts
    return thresholds[-1][1]


# ─────────────────────────────────────────────────────────────────────────────
#  History helpers
# ─────────────────────────────────────────────────────────────────────────────

def _annual_sorted(d):
    return sorted(
        d.get("financial_history", {}).get("annual", []),
        key=lambda y: str(y.get("period", ""))
    )


def _fcf_conversion(d) -> Optional[float]:
    """FCF / Net Income averaged over last 3 years. >1 = earnings are real cash."""
    annual = _annual_sorted(d)
    ratios = []
    for y in annual[-3:]:
        fcf = _n(y.get("fcf"))
        ni  = _n(y.get("net_income"))
        if fcf is not None and ni and ni > 0:
            ratios.append(fcf / ni)
    return sum(ratios) / len(ratios) if ratios else None


def _revenue_consistency(d) -> Optional[float]:
    """Population std-dev of annual revenue growth rates (%). Lower = more consistent."""
    annual = _annual_sorted(d)
    growths = []
    for i in range(1, len(annual)):
        r0 = _n(annual[i - 1].get("revenue"))
        r1 = _n(annual[i].get("revenue"))
        if r0 and r1 and r0 > 0:
            growths.append((r1 - r0) / r0 * 100)
    if len(growths) < 2:
        return None
    mean = sum(growths) / len(growths)
    return (sum((g - mean) ** 2 for g in growths) / len(growths)) ** 0.5


def _nd_ebitda(d) -> Optional[float]:
    """Net Debt / EBITDA. Negative = net cash. Derived from EV/EBITDA ratio."""
    net_debt   = _n(d.get("net_debt"))
    market_cap = _n(d.get("market_cap"))
    ev_ebitda  = _n(d.get("ev_ebitda"))
    if net_debt is None:
        return None
    # EBITDA back-calculated from EV/EBITDA multiple
    if ev_ebitda and ev_ebitda > 0 and market_cap and market_cap > 0:
        ev     = market_cap + net_debt
        ebitda = ev / ev_ebitda
        if ebitda > 0:
            return net_debt / ebitda
    # Fallback: most recent historical EBITDA
    for y in reversed(_annual_sorted(d)[-2:]):
        ebitda = _n(y.get("ebitda"))
        if ebitda and ebitda > 0:
            return net_debt / ebitda
    return None


# ─────────────────────────────────────────────────────────────────────────────
#  Local (algorithmic) scorer — industry-aligned sub-metrics
# ─────────────────────────────────────────────────────────────────────────────

def _pillar1_business_quality(d) -> tuple[int, str]:
    """
    0-30 pts — gross margin (pricing power), ROIC (moat), FCF conversion (earnings quality).
    Sources: Morningstar moat framework, Fundsmith quality filters, Terry Smith FCF test.
    """
    gross_margin = _n(d.get("gross_margin"))   # decimal  e.g. 0.72
    roic         = _n(d.get("roic"))           # percent  e.g. 24.2
    fcf_conv     = _fcf_conversion(d)          # ratio    e.g. 1.15

    # Gross margin → 0-12  (raw pricing power; hard to compress in downturns)
    gm_pts = _tier(gross_margin, [
        (0.70, 12), (0.55, 10), (0.40, 8),
        (0.30, 6),  (0.20, 3),  (0.10, 1), (None, 0)
    ]) if gross_margin is not None else 4  # neutral

    # ROIC → 0-12  (primary moat signal: sustained ROIC >> WACC = durable advantage)
    r_pts = _tier(roic, [
        (30, 12), (20, 10), (15, 8),
        (10,  5), ( 5,  2), (None, 1)
    ]) if roic is not None else 4  # neutral

    # FCF conversion (FCF / Net Income) → 0-6
    # >1.0 means cash earnings exceed accrual earnings → high quality
    fc_pts = _tier(fcf_conv, [
        (1.20, 6), (1.00, 5), (0.80, 4),
        (0.60, 2), (0.00, 1), (None, 0)
    ]) if fcf_conv is not None else 3  # neutral

    score = gm_pts + r_pts + fc_pts

    quality = "exceptional" if score >= 26 else "strong" if score >= 18 else "moderate" if score >= 10 else "limited"
    note = (
        (f"Gross margin {gross_margin*100:.0f}%" if gross_margin else "Gross margin N/A")
        + (f", ROIC {roic:.1f}%" if roic else "")
        + (f", FCF conversion {fcf_conv:.2f}x" if fcf_conv else "")
        + f" — {quality} competitive moat."
    )
    return score, note


def _pillar2_profitability_efficiency(d) -> tuple[int, str]:
    """
    0-25 pts — operating margin (execution), net margin (after-tax), revenue consistency.
    Revenue std-dev separates durable compounders from cyclicals — industry standard
    quality factor used by MSCI, S&P, and factor-investing frameworks.
    """
    op_margin  = _n(d.get("operating_margin"))   # decimal
    net_margin = _n(d.get("profit_margin"))       # decimal
    consistency = _revenue_consistency(d)         # std-dev % (lower = better)

    # Operating margin → 0-10
    om_pts = _tier(op_margin, [
        (0.35, 10), (0.25, 8), (0.20, 7),
        (0.15,  5), (0.10, 3), (0.05, 1), (None, 0)
    ]) if op_margin is not None else 4

    # Net margin → 0-9
    nm_pts = _tier(net_margin, [
        (0.25, 9), (0.20, 8), (0.15, 6),
        (0.10, 4), (0.05, 2), (0.00, 1), (None, 0)
    ]) if net_margin is not None else 3

    # Revenue consistency (lower std-dev = higher score) → 0-6
    if consistency is None:
        con_pts = 3  # neutral
    elif consistency < 3:
        con_pts = 6  # near-perfect consistency (e.g. Visa, Costco)
    elif consistency < 5:
        con_pts = 5
    elif consistency < 8:
        con_pts = 4
    elif consistency < 12:
        con_pts = 3
    elif consistency < 20:
        con_pts = 2
    else:
        con_pts = 1  # highly cyclical / volatile

    score = om_pts + nm_pts + con_pts

    note = (
        (f"Op margin {op_margin*100:.1f}%" if op_margin else "Op margin N/A")
        + (f", net margin {net_margin*100:.1f}%" if net_margin else "")
        + (f", rev growth σ {consistency:.1f}%" if consistency else "")
        + (". Highly consistent margins." if score >= 20
           else ". Solid profitability." if score >= 13
           else ". Margin pressure or cyclicality present.")
    )
    return score, note


def _pillar3_growth_durability(d) -> tuple[int, str]:
    """
    0-20 pts — revenue CAGR, EPS CAGR (only here — not double-counted), recent YoY.
    EPS CAGR > revenue CAGR signals operating leverage (quality growth).
    """
    rev_cagr   = _n(d.get("revenue_cagr"))    # percent
    eps_cagr   = _n(d.get("eps_cagr"))        # percent
    rev_growth = _n(d.get("revenue_growth"))  # decimal YoY

    # Revenue CAGR → 0-10
    rc_pts = _tier(rev_cagr, [
        (20, 10), (15, 8), (10, 6),
        ( 7,  5), ( 5, 3), ( 2, 2), (0, 1), (None, 3)
    ])

    # EPS CAGR → 0-7  (only pillar where EPS CAGR appears)
    ec_pts = _tier(eps_cagr, [
        (20, 7), (15, 6), (10, 4),
        ( 7, 3), ( 3, 2), ( 0, 1), (None, 3)
    ])

    # Recent YoY momentum → 0-3  (recency signal, low weight)
    mom_pts = _tier(rev_growth, [
        (0.15, 3), (0.07, 2), (0.00, 1), (None, 0)
    ]) if rev_growth is not None else 1

    score = rc_pts + ec_pts + mom_pts

    note = (
        (f"Rev CAGR {rev_cagr:.1f}%" if rev_cagr else "Rev CAGR N/A")
        + (f", EPS CAGR {eps_cagr:.1f}%" if eps_cagr else "")
        + (f", recent YoY {rev_growth*100:.1f}%" if rev_growth else "")
        + (". High-durability compounder." if score >= 16
           else ". Steady growth trajectory." if score >= 10
           else ". Growth is slowing or uncertain.")
    )
    return score, note


def _pillar4_balance_sheet(d) -> tuple[int, str]:
    """
    0-15 pts — Net Debt/EBITDA (credit standard), interest coverage, shareholder yield.
    Replaces D/E (book-value distorted) and Net Debt/Mkt Cap (price-sensitive).
    """
    nd_eb     = _nd_ebitda(d)                              # ratio (neg = net cash)
    int_cov   = _n(d.get("interest_coverage"))             # x
    sh_yield  = _n(d.get("total_shareholder_yield"))       # decimal

    # Net Debt / EBITDA → 0-7  (industry standard: <2x = investment grade)
    if nd_eb is None:
        nd_pts = 3  # neutral
    elif nd_eb < 0:
        nd_pts = 7  # net cash
    elif nd_eb < 0.5:
        nd_pts = 6
    elif nd_eb < 1.0:
        nd_pts = 5
    elif nd_eb < 2.0:
        nd_pts = 4
    elif nd_eb < 3.0:
        nd_pts = 2
    elif nd_eb < 4.0:
        nd_pts = 1
    else:
        nd_pts = 0  # heavily leveraged

    # Interest coverage → 0-4  (EBIT / interest expense)
    ic_pts = _tier(int_cov, [
        (20, 4), (10, 3), (5, 2), (2, 1), (None, 0)
    ]) if int_cov is not None else 2  # neutral

    # Total shareholder yield (dividends + buybacks) → 0-4
    sy_pts = _tier(sh_yield, [
        (0.06, 4), (0.04, 3), (0.02, 2), (0.005, 1), (None, 0)
    ]) if sh_yield is not None else 1

    score = nd_pts + ic_pts + sy_pts

    nd_str = (
        f"ND/EBITDA {nd_eb:.1f}x" if nd_eb is not None and nd_eb >= 0
        else f"net cash ({abs(nd_eb):.1f}x)" if nd_eb is not None
        else "ND/EBITDA N/A"
    )
    note = (
        nd_str
        + (f", int. coverage {int_cov:.1f}x" if int_cov else "")
        + (f", shareholder yield {sh_yield*100:.1f}%" if sh_yield else "")
        + (". Fortress balance sheet." if score >= 12
           else ". Manageable leverage." if score >= 7
           else ". Elevated debt burden or weak capital returns.")
    )
    return score, note


def _pillar5_valuation(d) -> tuple[int, str]:
    """
    0-10 pts — P/FCF (cash-based), EV/EBITDA (enterprise), PEG (growth-adjusted).
    These three together capture value from different angles without overlap.
    """
    p_fcf     = _n(d.get("p_fcf"))
    ev_ebitda = _n(d.get("ev_ebitda"))
    peg       = _n(d.get("peg_ratio"))

    # P/FCF → 0-4 (lower = cheaper = more points)
    pfcf_pts = _tier_lower_better(p_fcf, [
        (15, 4), (25, 3), (35, 2), (50, 1), (None, 0)
    ]) if (p_fcf and p_fcf > 0) else 1

    # EV/EBITDA → 0-3 (lower = cheaper = more points)
    ev_pts = _tier_lower_better(ev_ebitda, [
        (10, 3), (15, 2), (20, 1), (None, 0)
    ]) if (ev_ebitda and ev_ebitda > 0) else 1

    # PEG → 0-3 (lower = better growth-adjusted value = more points)
    peg_pts = _tier_lower_better(peg, [
        (1.0, 3), (1.5, 2), (2.5, 1), (None, 0)
    ]) if (peg and peg > 0) else 1

    score = pfcf_pts + ev_pts + peg_pts

    note = (
        (f"P/FCF {p_fcf:.0f}x" if p_fcf else "P/FCF N/A")
        + (f", EV/EBITDA {ev_ebitda:.1f}x" if ev_ebitda else "")
        + (f", PEG {peg:.1f}" if peg else "")
        + (". Attractive valuation." if score >= 8
           else ". Fair valuation." if score >= 5
           else ". Valuation stretched — modest margin of safety.")
    )
    return score, note


# ── Sector-normalised target multiples ───────────────────────────────────────
# Calibrated to long-run normalised multiples (not current frothy levels).
# pe  = fair trailing or forward P/E
# pfcf = fair Price/FCF
# ev_ebitda = fair EV/EBITDA; None means model doesn't apply (banks, etc.)
_SECTOR_MULTIPLES = {
    "Technology":             {"pe": 28, "pfcf": 30, "ev_ebitda": 22},
    "Communication Services": {"pe": 20, "pfcf": 22, "ev_ebitda": 14},
    "Consumer Defensive":     {"pe": 22, "pfcf": 20, "ev_ebitda": 14},
    "Consumer Cyclical":      {"pe": 18, "pfcf": 20, "ev_ebitda": 13},
    "Healthcare":             {"pe": 22, "pfcf": 25, "ev_ebitda": 16},
    "Financial Services":     {"pe": 13, "pfcf": None, "ev_ebitda": None},
    "Banks":                  {"pe": 12, "pfcf": None, "ev_ebitda": None},
    "Insurance":              {"pe": 14, "pfcf": None, "ev_ebitda": None},
    "Industrials":            {"pe": 20, "pfcf": 22, "ev_ebitda": 13},
    "Energy":                 {"pe": 14, "pfcf": 16, "ev_ebitda":  8},
    "Real Estate":            {"pe": None,"pfcf": 20, "ev_ebitda": 17},
    "Utilities":              {"pe": 18, "pfcf": 20, "ev_ebitda": 10},
    "Basic Materials":        {"pe": 15, "pfcf": 17, "ev_ebitda": 10},
}
_DEFAULT_MULTIPLES = {"pe": 18, "pfcf": 20, "ev_ebitda": 13}


def _fair_value_blended(d) -> Optional[dict]:
    """
    Blended comparable-multiple fair value — industry standard for screener-level estimates.

    Three methods (where data permits):
      1. EPS × sector fair P/E   (uses forward EPS when available, else trailing)
      2. FCF/share × sector fair P/FCF
      3. EV/EBITDA implied equity value per share

    Midpoint = equal-weighted average of available methods.
    Range    = midpoint ± 12% (tight confidence band).
    """
    sector    = d.get("sector", "")
    m         = _SECTOR_MULTIPLES.get(sector, _DEFAULT_MULTIPLES)

    price      = _n(d.get("price"))
    forward_pe = _n(d.get("forward_pe"))
    pe_ratio   = _n(d.get("pe_ratio"))
    fcf_ps     = _n(d.get("fcf_per_share"))
    ev_ebitda  = _n(d.get("ev_ebitda"))
    market_cap = _n(d.get("market_cap"))
    net_debt   = _n(d.get("net_debt")) or 0.0

    estimates  = []
    methods    = []

    # ── Method 1: EPS × fair P/E ─────────────────────────────────────────
    fair_pe = m.get("pe")
    if fair_pe and price and price > 0:
        eps = None
        if forward_pe and forward_pe > 2:          # forward EPS preferred
            eps = price / forward_pe
        elif pe_ratio and pe_ratio > 2:            # trailing EPS fallback
            eps = price / pe_ratio
        if eps and eps > 0:
            estimates.append(eps * fair_pe)
            methods.append("P/E")

    # ── Method 2: FCF/share × fair P/FCF ────────────────────────────────
    fair_pfcf = m.get("pfcf")
    if fair_pfcf and fcf_ps and fcf_ps > 0:
        estimates.append(fcf_ps * fair_pfcf)
        methods.append("P/FCF")

    # ── Method 3: EV/EBITDA implied price ───────────────────────────────
    fair_ev = m.get("ev_ebitda")
    if fair_ev and ev_ebitda and ev_ebitda > 0 and market_cap and price and price > 0:
        current_ev = market_cap + net_debt
        ebitda     = current_ev / ev_ebitda
        implied_ev = ebitda * fair_ev
        fair_equity = implied_ev - net_debt
        shares      = market_cap / price          # implied shares from mkt cap
        if shares > 0 and fair_equity > 0:
            estimates.append(fair_equity / shares)
            methods.append("EV/EBITDA")

    if not estimates:
        return None

    mid = sum(estimates) / len(estimates)
    return {
        "low":          round(mid * 0.88, 2),
        "mid":          round(mid, 2),
        "high":         round(mid * 1.12, 2),
        "methods_used": methods,
    }


def _verdict_from_score(total_10) -> tuple[str, str]:
    if total_10 >= 7.5:
        v = "STRONG BUY"
        r = "Strong fundamentals across multiple pillars with attractive or reasonable valuation."
    elif total_10 >= 6.5:
        v = "BUY"
        r = "Above-average business quality and financials; valuation offers a reasonable entry point."
    elif total_10 >= 5.0:
        v = "HOLD"
        r = "Solid business but valuation leaves limited upside or one or more pillars show weakness."
    elif total_10 >= 3.5:
        v = "REDUCE"
        r = "Multiple concerns across quality, financials, or growth; risk/reward is unattractive."
    else:
        v = "AVOID"
        r = "Fundamental weaknesses or extreme valuation make a satisfactory return unlikely."
    return v, r


def _confidence_local(d) -> tuple[str, str]:
    annual  = d.get("financial_history", {}).get("annual", [])
    missing = sum(1 for k in ["roic", "gross_margin", "revenue_cagr", "eps_cagr", "p_fcf", "interest_coverage"]
                  if _n(d.get(k)) is None)
    if len(annual) >= 3 and missing <= 2:
        return "HIGH", "Sufficient historical data and key metrics available for reliable scoring."
    elif len(annual) >= 2 and missing <= 3:
        return "MEDIUM", "Some metrics are missing; score may shift with more complete data."
    else:
        return "LOW", "Limited historical data — treat score as directional only."


def score_stock_local(stock_data: dict) -> dict:
    """Fully algorithmic 5-pillar score — no API required."""
    p1, n1 = _pillar1_business_quality(stock_data)
    p2, n2 = _pillar2_profitability_efficiency(stock_data)
    p3, n3 = _pillar3_growth_durability(stock_data)
    p4, n4 = _pillar4_balance_sheet(stock_data)
    p5, n5 = _pillar5_valuation(stock_data)

    total_100 = p1 + p2 + p3 + p4 + p5
    total_10  = round(total_100 / 10, 1)

    verdict, verdict_reasoning = _verdict_from_score(total_10)
    confidence, confidence_reason = _confidence_local(stock_data)
    fv = _fair_value_blended(stock_data)

    rev_cagr = _n(stock_data.get("revenue_cagr"))
    eps_cagr = _n(stock_data.get("eps_cagr"))
    roic     = _n(stock_data.get("roic"))
    op_margin = _n(stock_data.get("operating_margin"))
    peg      = _n(stock_data.get("peg_ratio"))

    bull_thesis = (
        f"{'High ROIC (' + str(round(roic, 1)) + '%) ' if roic and roic >= 15 else ''}"
        f"{'and strong revenue CAGR (' + str(round(rev_cagr, 1)) + '%) ' if rev_cagr and rev_cagr >= 8 else ''}"
        f"suggest durable compounding potential. "
        f"{'Expanding margins and operating leverage could drive outsized EPS growth.' if eps_cagr and eps_cagr >= 10 else 'Consistent cash generation supports ongoing capital returns to shareholders.'}"
    ).strip()

    bear_thesis = (
        f"{'Elevated valuation (PEG ' + str(round(peg, 1)) + 'x) limits margin of safety. ' if peg and peg >= 2.5 else ''}"
        f"{'Revenue growth deceleration could compress multiples significantly. ' if rev_cagr and rev_cagr < 5 else ''}"
        f"{'Thin operating margins (' + str(round(op_margin * 100, 1)) + '%) leave little buffer in a downturn. ' if op_margin and op_margin < 0.12 else ''}"
        f"{'Macro sensitivity and sector rotation remain persistent risks.' if not (peg and peg >= 2.5) and not (rev_cagr and rev_cagr < 5) else ''}"
    ).strip() or "Competitive pressure and macro headwinds could weigh on growth. Valuation may not fully discount execution risk."

    key_factors = []
    if roic and roic >= 20:
        key_factors.append(f"Exceptional ROIC ({roic:.1f}%) — sustained returns well above cost of capital")
    if rev_cagr and rev_cagr >= 10:
        key_factors.append(f"Strong revenue CAGR ({rev_cagr:.1f}%) — top-line durability")
    if eps_cagr and eps_cagr >= 12:
        key_factors.append(f"EPS compounding ({eps_cagr:.1f}% CAGR) — operating leverage at work")
    if op_margin and op_margin >= 0.25:
        key_factors.append(f"High operating margin ({op_margin*100:.1f}%) — strong pricing power and cost control")
    if peg and 0 < peg < 1.5:
        key_factors.append(f"Attractive PEG ({peg:.2f}) — growth available at a reasonable price")
    if not key_factors:
        key_factors = ["Algorithmic scoring — run AI mode for deeper conviction factors"]

    score_dict = {
        "pillar_scores": {
            "business_quality":                 p1,
            "financial_performance":            p2,
            "growth_durability":                p3,
            "balance_sheet_capital_allocation": p4,
            "valuation":                        p5,
        },
        "pillar_notes": {
            "business_quality":                 n1,
            "financial_performance":            n2,
            "growth_durability":                n3,
            "balance_sheet_capital_allocation": n4,
            "valuation":                        n5,
        },
        "total_score":           total_10,
        "verdict":               verdict,
        "verdict_reasoning":     verdict_reasoning,
        "confidence":            confidence,
        "confidence_reason":     confidence_reason,
        "fair_value_range":      fv,
        "fair_value_basis":      f"Blended comparable multiples ({', '.join(fv['methods_used']) if fv else 'N/A'}): sector-normalised P/E, P/FCF, and EV/EBITDA midpoint ± 12%.",
        "bull_thesis":           bull_thesis,
        "bear_thesis":           bear_thesis,
        "key_conviction_factors": key_factors,
    }

    return {
        "ticker": stock_data.get("symbol", ""),
        "score":  score_dict,
        "mode":   "local",
        "methodology": {
            "pillars": {
                "business_quality":                 "Gross margin (pricing power), ROIC (moat), FCF conversion (earnings quality) — 30% weight",
                "financial_performance":            "Operating margin, net margin, revenue consistency (std-dev) — 25% weight",
                "growth_durability":                "Revenue CAGR, EPS CAGR, recent YoY momentum — 20% weight",
                "balance_sheet_capital_allocation": "Net Debt/EBITDA, interest coverage, shareholder yield — 15% weight",
                "valuation":                        "P/FCF, EV/EBITDA, PEG — 10% weight",
            },
            "philosophy": "Quality-value: wonderful businesses at fair prices. ROIC > WACC is the primary filter. Valuation matters but is secondary to business quality.",
        },
        "model": "algorithmic",
    }


# ─────────────────────────────────────────────────────────────────────────────
#  API scorer (Claude)
# ─────────────────────────────────────────────────────────────────────────────

def _fmt_api(v, pct=False, prefix="", decimals=1, mult=1):
    if v is None:
        return "N/A"
    v = v * mult
    return f"{prefix}{v:.{decimals}f}{'%' if pct else ''}"


def score_stock_api(stock_data: dict) -> dict:
    """Claude-powered scorer — richer reasoning and fair-value narrative."""
    sym   = stock_data.get("symbol", "")
    name  = stock_data.get("name", sym)
    price = stock_data.get("price")
    annual = sorted(stock_data.get("financial_history", {}).get("annual", []),
                    key=lambda y: str(y.get("period", "")))

    def hist_line(key, label, pct=False, fmt_fn=None):
        vals = []
        for y in annual[-4:]:
            v = y.get(key)
            if v is None:
                vals.append("—")
            elif fmt_fn:
                vals.append(fmt_fn(v))
            elif pct:
                vals.append(f"{v:.1f}%")
            else:
                vals.append(f"${v/1e9:.1f}B")
        years = [str(y.get("period", "")) for y in annual[-4:]]
        return f"  {label}: " + "  ".join(f"{yr}={v}" for yr, v in zip(years, vals))

    hist_block = "\n".join([
        hist_line("revenue",          "Revenue"),
        hist_line("fcf",              "FCF"),
        hist_line("fcf_margin",       "FCF Margin",    pct=True),
        hist_line("operating_margin", "Op Margin",     pct=True),
        hist_line("roic",             "ROIC",          pct=True),
        hist_line("eps",              "EPS (diluted)", fmt_fn=lambda v: f"${v:.2f}"),
        hist_line("shares",           "Shares (M)",    fmt_fn=lambda v: f"{v:.0f}M"),
    ])

    block = f"""
=== {name} ({sym}) ===
Sector: {stock_data.get('sector','N/A')} | Industry: {stock_data.get('industry','N/A')}
Current Price: ${_fmt_api(price, decimals=2)}
Market Cap: ${_fmt_api(stock_data.get('market_cap'), decimals=1, mult=1/1e9)}B

VALUATION MULTIPLES
  P/E (TTM): {_fmt_api(stock_data.get('pe_ratio'))}
  Forward P/E: {_fmt_api(stock_data.get('forward_pe'))}
  P/FCF: {_fmt_api(stock_data.get('p_fcf'))}
  P/S: {_fmt_api(stock_data.get('price_to_sales'), decimals=2)}
  EV/EBITDA: {_fmt_api(stock_data.get('ev_ebitda'))}
  P/Book: {_fmt_api(stock_data.get('price_to_book'), decimals=2)}
  PEG: {_fmt_api(stock_data.get('peg_ratio'), decimals=2)}

CURRENT PROFITABILITY
  ROIC: {_fmt_api(stock_data.get('roic'))}%
  ROE: {_fmt_api(stock_data.get('return_on_equity'), pct=True, mult=100)}
  Op Margin: {_fmt_api(stock_data.get('operating_margin'), pct=True, mult=100)}
  Net Margin: {_fmt_api(stock_data.get('profit_margin'), pct=True, mult=100)}
  FCF/Share: ${_fmt_api(stock_data.get('fcf_per_share'), decimals=2)}
  FCF (TTM): ${_fmt_api(stock_data.get('fcf_ttm'), decimals=1, mult=1/1e9)}B

GROWTH
  Revenue Growth (YoY): {_fmt_api(stock_data.get('revenue_growth'), pct=True, mult=100)}
  Revenue CAGR (hist): {_fmt_api(stock_data.get('revenue_cagr'), decimals=1)}%
  EPS CAGR (hist): {_fmt_api(stock_data.get('eps_cagr'), decimals=1)}%

BALANCE SHEET & CAPITAL ALLOCATION
  Net Debt: ${_fmt_api(stock_data.get('net_debt'), decimals=1, mult=1/1e9)}B
  D/E: {_fmt_api(stock_data.get('debt_to_equity'), decimals=2)}
  Interest Coverage: {_fmt_api(stock_data.get('interest_coverage'))}x
  Buyback Yield: {_fmt_api(stock_data.get('buyback_yield'), pct=True, mult=100)}
  Dividend Yield: {_fmt_api(stock_data.get('dividend_yield'), pct=True, mult=100)}
  Total Shareholder Yield: {_fmt_api(stock_data.get('total_shareholder_yield'), pct=True, mult=100)}
  Beta: {_fmt_api(stock_data.get('beta'), decimals=2)}

HISTORICAL FINANCIALS
{hist_block}

RULE-BASED GRAHAM SCORE: {stock_data.get('graham_score',{}).get('score','N/A')}/10
"""

    prompt = f"""You are a senior portfolio manager at a long-only equity fund with a quality-value mandate,
similar to the investment philosophy of Terry Smith (Fundsmith), Nick Sleep (Nomad), or Warren Buffett's modern approach.
Your mandate: buy wonderful businesses at fair prices, hold for the long term.

Analyze this stock and produce a structured AI investment score. Use your OWN judgment — this is NOT a Graham
mechanical checklist. Consider: moat durability, capital efficiency, management quality signals,
industry structure, long-run compounding potential, and current valuation vs quality.

{block}

Respond ONLY with valid JSON (no markdown, no explanation outside JSON):
{{
  "pillar_scores": {{
    "business_quality": <integer 0-30, weight 30%>,
    "financial_performance": <integer 0-25, weight 25%>,
    "growth_durability": <integer 0-20, weight 20%>,
    "balance_sheet_capital_allocation": <integer 0-15, weight 15%>,
    "valuation": <integer 0-10, weight 10%>
  }},
  "pillar_notes": {{
    "business_quality": "<one sentence>",
    "financial_performance": "<one sentence>",
    "growth_durability": "<one sentence>",
    "balance_sheet_capital_allocation": "<one sentence>",
    "valuation": "<one sentence>"
  }},
  "fair_value_range": {{"low": <number>, "high": <number>}},
  "fair_value_basis": "<one sentence>",
  "bull_thesis": "<two sentences>",
  "bear_thesis": "<two sentences>",
  "key_conviction_factors": ["<factor 1>", "<factor 2>", "<factor 3>"],
  "verdict": "STRONG BUY" | "BUY" | "HOLD" | "REDUCE" | "AVOID",
  "verdict_reasoning": "<two sentences>",
  "confidence": "HIGH" | "MEDIUM" | "LOW",
  "confidence_reason": "<one sentence>"
}}"""

    client = _get_client()
    msg = client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=2000,
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

    if "pillar_scores" in result and "error" not in result:
        ps = result["pillar_scores"]
        result["total_score"] = round(
            sum([ps.get("business_quality", 0),
                 ps.get("financial_performance", 0),
                 ps.get("growth_durability", 0),
                 ps.get("balance_sheet_capital_allocation", 0),
                 ps.get("valuation", 0)]) / 10, 1
        )

    return {
        "ticker": sym,
        "score":  result,
        "mode":   "claude",
        "methodology": {
            "pillars": {
                "business_quality":                 "Moat strength, pricing power, competitive durability — 30% weight",
                "financial_performance":            "ROIC vs WACC, FCF conversion, margin quality — 25% weight",
                "growth_durability":                "Revenue/EPS CAGR, organic growth quality, TAM — 20% weight",
                "balance_sheet_capital_allocation": "Net debt, buybacks, capital returns — 15% weight",
                "valuation":                        "P/FCF vs growth, total yield, margin of safety — 10% weight",
            },
            "philosophy": "Quality-value: wonderful businesses at fair prices. ROIC > WACC is the primary filter. Valuation matters but is secondary to business quality.",
        },
        "model": "claude-sonnet-4-6",
    }


# ─────────────────────────────────────────────────────────────────────────────
#  Public entry point — auto-selects mode
# ─────────────────────────────────────────────────────────────────────────────

def score_stock(stock_data: dict) -> dict:
    """Use Claude if API key is available, otherwise fall back to local scorer."""
    if _api_key():
        try:
            return score_stock_api(stock_data)
        except Exception:
            pass  # fall through to local
    return score_stock_local(stock_data)
