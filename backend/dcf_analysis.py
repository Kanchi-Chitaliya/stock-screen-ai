import math
from typing import Optional
import yfinance as yf
from stock_data import _safe, _first


class DCFAnalyzer:

    def calculate(
        self,
        ticker: str,
        revenue_growth_1_5: float = 10.0,   # % annual revenue growth, years 1-5
        revenue_growth_6_10: float = 7.0,    # % annual revenue growth, years 6-10
        fcf_margin: float = 15.0,            # FCF as % of revenue (long-run target)
        terminal_growth_rate: float = 3.0,
        discount_rate: float = 10.0,         # WACC
        margin_of_safety: float = 25.0,
    ) -> dict:
        tk = yf.Ticker(ticker)
        info = tk.info or {}

        base_revenue = self._get_base_revenue(tk, info)
        if not base_revenue or base_revenue <= 0:
            return {"error": "Could not determine revenue for this company."}

        price      = _safe(info.get("currentPrice") or info.get("regularMarketPrice"))
        shares     = _safe(info.get("sharesOutstanding")) or 1
        total_debt = _safe(info.get("totalDebt")) or 0
        cash       = _safe(info.get("totalCash") or info.get("cash")) or 0

        # Historical share CAGR for forward share-count projection
        try:
            fin = tk.financials
            share_cagr = self._calc_share_cagr(fin, current_shares=shares)
        except Exception:
            share_cagr = 0.0
        # Hard clamp: max 15% annual buyback, max 10% annual dilution.
        # Prevents corrupted NI/EPS data from causing exponential blow-up.
        share_cagr = max(min(share_cagr, 0.10), -0.15)

        g1     = revenue_growth_1_5 / 100
        g2     = revenue_growth_6_10 / 100
        fcf_m  = fcf_margin / 100
        g_term = terminal_growth_rate / 100
        wacc   = discount_rate / 100
        mos    = margin_of_safety / 100

        yearly = []
        revenue = base_revenue
        pv_sum  = 0.0

        for year in range(1, 11):
            g       = g1 if year <= 5 else g2
            revenue = revenue * (1 + g)
            fcf     = revenue * fcf_m
            pv      = fcf / ((1 + wacc) ** year)
            pv_sum += pv
            yearly.append({
                "year": year,
                "revenue": round(revenue),
                "fcf": round(fcf),
                "pv": round(pv),
                "revenue_growth": g * 100,
            })

        # Terminal value (Gordon Growth on year-10 FCF)
        terminal_fcf   = yearly[-1]["fcf"] * (1 + g_term)
        terminal_value = terminal_fcf / max(wacc - g_term, 0.01)
        terminal_pv    = terminal_value / ((1 + wacc) ** 10)

        total_equity_value  = pv_sum + terminal_pv + cash - total_debt
        intrinsic_per_share = total_equity_value / shares
        mos_price           = intrinsic_per_share * (1 - mos)
        upside              = ((intrinsic_per_share / price) - 1) * 100 if price else None
        mos_upside          = ((mos_price / price) - 1) * 100 if price else None

        # ── Forward price estimates at year 1 / 5 / 10 ──────────────────
        # At horizon H, price = DCF value of remaining years H+1..10 + terminal,
        # measured from year H's vantage point.
        # Accounts for share buybacks reducing share count over time.
        forward_prices = {}
        for h in [1, 5, 10]:
            shares_h = shares * ((1 + share_cagr) ** h) if share_cagr else shares
            if shares_h <= 0:
                shares_h = shares
            if h >= 10:
                # Only terminal value remains
                equity_h = terminal_value + cash - total_debt
            else:
                # PV of years h+1..10 discounted to year h
                remaining = sum(
                    yearly[k - 1]["fcf"] / ((1 + wacc) ** (k - h))
                    for k in range(h + 1, 11)
                )
                # Terminal value at year h perspective
                term_at_h = terminal_value / ((1 + wacc) ** (10 - h))
                equity_h  = remaining + term_at_h + cash - total_debt
            forward_prices[h] = round(equity_h / shares_h, 2) if shares_h > 0 else None

        # ── Sensitivity: WACC rows × terminal growth cols ────────────────
        wacc_vals = [wacc - 0.02, wacc - 0.01, wacc, wacc + 0.01, wacc + 0.02]
        tgr_vals  = [max(g_term - 0.01, 0), g_term, g_term + 0.01, g_term + 0.02]
        sensitivity = []
        for w in wacc_vals:
            row = []
            for g in tgr_vals:
                if w <= g:
                    row.append(None)
                    continue
                try:
                    iv = self._intrinsic_per_share(
                        base_revenue, g1, g2, fcf_m, g, w, mos, total_debt, cash, shares
                    )
                    row.append(round(iv, 0) if iv is not None else None)
                except Exception:
                    row.append(None)
            sensitivity.append(row)

        # ── Smart presets based on this company's history ─────────────────
        smart_presets = self._build_smart_presets(tk, info, g_term, wacc)

        return {
            "ticker": ticker,
            "base_revenue": round(base_revenue),
            "net_debt": round(total_debt - cash),
            "shares_used": round(shares),
            "share_cagr_pct": round(share_cagr * 100, 2) if share_cagr else 0,
            "fcf_margin_used": fcf_margin,
            "yearly_projections": yearly,
            "pv_of_fcfs": round(pv_sum),
            "terminal_value": round(terminal_value),
            "terminal_pv": round(terminal_pv),
            "total_equity_value": round(total_equity_value),
            "intrinsic_value_per_share": round(intrinsic_per_share, 2),
            "margin_of_safety_price": round(mos_price, 2),
            "current_price": price,
            "upside_to_intrinsic": round(upside, 1) if upside is not None else None,
            "upside_to_mos_price": round(mos_upside, 1) if mos_upside is not None else None,
            "forward_prices": forward_prices,
            "sensitivity": {
                "wacc_labels": [f"{w * 100:.0f}%" for w in wacc_vals],
                "tgr_labels":  [f"{g * 100:.0f}%" for g in tgr_vals],
                "values":      sensitivity,
            },
            "smart_presets": smart_presets,
            "inputs": {
                "revenue_growth_1_5": revenue_growth_1_5,
                "revenue_growth_6_10": revenue_growth_6_10,
                "fcf_margin": fcf_margin,
                "terminal_growth_rate": terminal_growth_rate,
                "discount_rate": discount_rate,
                "margin_of_safety": margin_of_safety,
            },
        }

    # ── Helpers ──────────────────────────────────────────────────────────

    def _intrinsic_per_share(self, base_revenue, g1, g2, fcf_m, g_term, wacc, mos,
                              total_debt, cash, shares) -> Optional[float]:
        revenue = base_revenue
        pv_sum  = 0.0
        for year in range(1, 11):
            g       = g1 if year <= 5 else g2
            revenue = revenue * (1 + g)
            fcf     = revenue * fcf_m
            pv_sum += fcf / ((1 + wacc) ** year)
        terminal_fcf   = revenue * fcf_m * (1 + g_term)
        terminal_value = terminal_fcf / max(wacc - g_term, 0.001)
        terminal_pv    = terminal_value / ((1 + wacc) ** 10)
        equity_value   = pv_sum + terminal_pv + cash - total_debt
        return equity_value / shares if shares > 0 else None

    def _calc_share_cagr(self, fin, current_shares: float = None) -> float:
        """Annualized share count change from EPS/NI. Negative = buybacks."""
        try:
            if fin is None or fin.empty:
                return 0.0
            raw = []
            for col in reversed(fin.columns):  # oldest → newest
                ni  = _first(fin, ["Net Income", "Net Income Common Stockholders"], col)
                eps = _first(fin, ["Diluted EPS", "Basic EPS"], col)
                if ni and eps and abs(eps) > 0.01:
                    s = ni / eps
                    if s < 1e6:
                        continue
                    # Validate against current reported share count to reject outliers
                    # (near-zero EPS in one year creates phantom trillions of shares)
                    if current_shares and current_shares > 0:
                        ratio = s / current_shares
                        if ratio > 5.0 or ratio < 0.1:
                            continue
                    raw.append(s)
            if len(raw) < 2:
                return 0.0
            n = len(raw) - 1
            if raw[0] > 0 and raw[-1] > 0 and n > 0:
                cagr = (raw[-1] / raw[0]) ** (1 / n) - 1
                # Clamp: realistic range is −15% (aggressive buybacks) to +10% (dilution)
                return max(min(cagr, 0.10), -0.15)
        except Exception:
            pass
        return 0.0

    def _build_smart_presets(self, tk, info, default_tgr, default_wacc) -> dict:
        """Generate company-specific Bull/Base/Bear presets from historical data."""
        try:
            fin = tk.financials
            cf  = tk.cashflow
            if fin is None or fin.empty:
                return {}

            # Revenue growth series (oldest first)
            rev_growths = []
            rev_cols = list(reversed(fin.columns))
            for i in range(1, len(rev_cols)):
                r0 = _first(fin, ["Total Revenue"], rev_cols[i - 1])
                r1 = _first(fin, ["Total Revenue"], rev_cols[i])
                if r0 and r1 and r0 > 0:
                    rev_growths.append((r1 - r0) / r0 * 100)

            # FCF margin series
            fcf_margins = []
            for col in rev_cols:
                rev = _first(fin, ["Total Revenue"], col)
                if cf is not None and not cf.empty and col in cf.columns:
                    ocf   = _first(cf, ["Operating Cash Flow",
                                        "Cash Flow From Continuing Operating Activities"], col)
                    capex = _first(cf, ["Capital Expenditure", "Capital Expenditures"], col)
                    if ocf and rev and rev > 0:
                        fcf_m = (ocf - abs(capex or 0)) / rev * 100
                        if 0 < fcf_m < 90:
                            fcf_margins.append(fcf_m)

            if not rev_growths or not fcf_margins:
                return {}

            def avg(lst):
                return sum(lst) / len(lst) if lst else None

            rev_1yr = rev_growths[-1]        if rev_growths         else None
            rev_3yr = avg(rev_growths[-3:])  if len(rev_growths) >= 2 else rev_1yr
            rev_5yr = avg(rev_growths[-5:])  if len(rev_growths) >= 3 else rev_3yr
            fcf_avg = avg(fcf_margins[-3:])  if fcf_margins else None
            fcf_best = max(fcf_margins[-3:]) if fcf_margins else None
            fcf_worst= min(fcf_margins[-3:]) if fcf_margins else None

            def clamp(v, lo, hi):
                return None if v is None else max(lo, min(hi, round(v, 1)))

            base_g1 = clamp(rev_3yr * 0.85, -5, 50)  # slight regression to mean
            base_g2 = clamp(rev_5yr * 0.65 if rev_5yr else base_g1 * 0.65, -5, 30)

            return {
                "bull": {
                    "revenue_growth_1_5":  clamp(max(rev_1yr, rev_3yr or 0) * 1.1, 0, 50),
                    "revenue_growth_6_10": clamp(base_g1 * 0.75, 0, 30),
                    "fcf_margin":          clamp(fcf_best, 1, 80),
                    "terminal_growth_rate": round(default_tgr * 100 + 0.5, 2),
                    "discount_rate":        round(default_wacc * 100 - 1, 2),
                    "margin_of_safety":     15,
                },
                "base": {
                    "revenue_growth_1_5":  base_g1,
                    "revenue_growth_6_10": base_g2,
                    "fcf_margin":          clamp(fcf_avg, 1, 80),
                    "terminal_growth_rate": round(default_tgr * 100, 2),
                    "discount_rate":        round(default_wacc * 100, 2),
                    "margin_of_safety":     25,
                },
                "bear": {
                    "revenue_growth_1_5":  clamp((rev_5yr or rev_3yr or rev_1yr or 5) * 0.5, -5, 25),
                    "revenue_growth_6_10": clamp(base_g2 * 0.6 if base_g2 else 2, -5, 15),
                    "fcf_margin":          clamp(fcf_worst * 0.9, 1, 80),
                    "terminal_growth_rate": round(max(default_tgr * 100 - 1, 1), 2),
                    "discount_rate":        round(default_wacc * 100 + 1.5, 2),
                    "margin_of_safety":     40,
                },
            }
        except Exception:
            return {}

    def _get_base_revenue(self, tk: yf.Ticker, info: dict) -> Optional[float]:
        try:
            fin = tk.financials
            if fin is not None and not fin.empty and "Total Revenue" in fin.index:
                v = _safe(fin.loc["Total Revenue", fin.columns[0]])
                if v and v > 0:
                    return v
        except Exception:
            pass
        return _safe(info.get("totalRevenue"))
