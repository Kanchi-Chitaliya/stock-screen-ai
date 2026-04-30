import math
import yfinance as yf
import pandas as pd
import numpy as np
from typing import Optional
from cache import cache
from utils import retry_with_backoff, logger


def _safe(val) -> Optional[float]:
    """Convert any numeric to Python float, returning None for NaN/Inf/None."""
    if val is None:
        return None
    try:
        f = float(val)
        return None if (math.isnan(f) or math.isinf(f)) else f
    except (TypeError, ValueError):
        return None


def _first(df: pd.DataFrame, keys: list[str], col) -> Optional[float]:
    """Try multiple row keys in a DataFrame and return the first match."""
    for k in keys:
        if k in df.index:
            return _safe(df.loc[k, col])
    return None


class StockDataFetcher:

    # ------------------------------------------------------------------ #
    #  Sector classification                                              #
    # ------------------------------------------------------------------ #
    _FINANCIAL_SECTORS    = {"Financial Services", "Banks", "Insurance",
                             "Capital Markets", "Mortgage Finance"}
    _CAPITAL_INTENSIVE    = {"Utilities", "Real Estate"}

    # ------------------------------------------------------------------ #
    #  Derived-metric helpers (static, no yfinance calls)                #
    # ------------------------------------------------------------------ #

    @staticmethod
    def _calc_roic(fin, bs) -> Optional[float]:
        """NOPAT / Invested Capital.  Handles negative equity (buyback-heavy cos)."""
        try:
            cf, cb = fin.columns[0], bs.columns[0]
            oi = _first(fin, ["Operating Income", "Operating Income Loss", "Ebit"], cf)
            if not oi or oi <= 0:
                return None

            pretax = _first(fin, ["Pretax Income", "Income Before Tax"], cf)
            tax    = _first(fin, ["Income Tax Expense", "Tax Provision"], cf)
            if pretax and abs(pretax) > 0 and tax and tax > 0:
                tr = min(max(tax / pretax, 0.05), 0.40)
            else:
                tr = 0.21
            nopat = oi * (1 - tr)

            equity = _first(bs, ["Total Stockholder Equity", "Common Stock Equity"], cb) or 0
            debt   = _first(bs, ["Total Debt", "Long Term Debt And Capital Lease Obligation"], cb) or 0
            cash   = _first(bs, ["Cash And Cash Equivalents",
                                  "Cash Cash Equivalents And Short Term Investments"], cb) or 0
            ic = equity + debt - cash

            # Negative IC (e.g. AAPL's buybacks) → fall back to assets-based method
            if ic <= 0:
                assets = _first(bs, ["Total Assets"], cb)
                cl     = _first(bs, ["Current Liabilities", "Total Current Liabilities"], cb)
                if assets and cl:
                    ic = assets - cl + debt - cash
                if ic <= 0:
                    return None

            return nopat / ic
        except Exception:
            return None

    @staticmethod
    def _calc_roic_series(fin, bs) -> list[Optional[float]]:
        """ROIC for each annual period (oldest→newest)."""
        results = []
        try:
            for i, cf in enumerate(reversed(fin.columns)):
                cb_cols = list(reversed(bs.columns))
                cb = cb_cols[i] if i < len(cb_cols) else bs.columns[-1]

                oi     = _first(fin, ["Operating Income", "Operating Income Loss"], cf)
                pretax = _first(fin, ["Pretax Income", "Income Before Tax"], cf)
                tax    = _first(fin, ["Income Tax Expense", "Tax Provision"], cf)
                if not oi or oi <= 0:
                    results.append(None); continue

                tr = 0.21
                if pretax and abs(pretax) > 0 and tax and tax > 0:
                    tr = min(max(tax / pretax, 0.05), 0.40)
                nopat = oi * (1 - tr)

                equity = _first(bs, ["Total Stockholder Equity", "Common Stock Equity"], cb) or 0
                debt   = _first(bs, ["Total Debt", "Long Term Debt And Capital Lease Obligation"], cb) or 0
                cash   = _first(bs, ["Cash And Cash Equivalents",
                                      "Cash Cash Equivalents And Short Term Investments"], cb) or 0
                ic = equity + debt - cash
                if ic <= 0:
                    assets = _first(bs, ["Total Assets"], cb)
                    cl     = _first(bs, ["Current Liabilities", "Total Current Liabilities"], cb)
                    if assets and cl:
                        ic = assets - cl + debt - cash
                results.append(_safe(nopat / ic) if ic > 0 else None)
        except Exception:
            pass
        return results

    @staticmethod
    def _calc_gross_margin_trend(fin) -> tuple[Optional[float], Optional[float]]:
        """Returns (latest_gm, total_change_over_period).  Change > 0 = expanding."""
        try:
            if "Gross Profit" not in fin.index or "Total Revenue" not in fin.index:
                return None, None
            margins = []
            for col in reversed(fin.columns):          # oldest first
                gp  = _safe(fin.loc["Gross Profit",  col])
                rev = _safe(fin.loc["Total Revenue",  col])
                if gp is not None and rev and rev > 0:
                    margins.append(gp / rev)
            if not margins:
                return None, None
            change = (margins[-1] - margins[0]) if len(margins) >= 2 else None
            return margins[-1], change
        except Exception:
            return None, None

    @staticmethod
    def _calc_interest_coverage(fin) -> Optional[float]:
        """EBIT / Interest Expense."""
        try:
            col  = fin.columns[0]
            ebit = _first(fin, ["Operating Income", "Operating Income Loss", "Ebit"], col)
            ie   = _first(fin, ["Interest Expense", "Interest Expense Non Operating",
                                 "Net Non Operating Interest Income Expense"], col)
            if ie and ie < 0:
                ie = abs(ie)
            if not ebit or not ie or ie < 1e5:
                return None
            return ebit / ie
        except Exception:
            return None

    @staticmethod
    def _calc_share_trend(fin) -> Optional[float]:
        """Annual share-count CAGR derived from Net Income / EPS.
        Negative = buybacks (ownership concentrating).  Positive = dilution."""
        try:
            shares = []
            for col in reversed(fin.columns):          # oldest first
                ni  = _first(fin, ["Net Income", "Net Income Common Stockholders"], col)
                eps = _first(fin, ["Basic EPS", "Diluted EPS",
                                    "Basic Earnings Per Share",
                                    "Diluted Earnings Per Share"], col)
                if ni and eps and abs(eps) > 0.01:
                    s = ni / eps
                    if s > 1e6:
                        shares.append(s)
            if len(shares) < 2:
                return None
            n = len(shares) - 1
            if shares[0] > 0 and shares[-1] > 0 and n > 0:
                return (shares[-1] / shares[0]) ** (1 / n) - 1
            return None
        except Exception:
            return None

    # ------------------------------------------------------------------ #
    #  Ticker Fetching — with retry logic                                #
    # ------------------------------------------------------------------ #

    def _get_ticker(self, symbol: str) -> Optional[yf.Ticker]:
        """Fetch ticker with exponential backoff retry."""
        try:
            return retry_with_backoff(yf.Ticker, symbol, max_retries=3, base_delay=0.5)
        except Exception as e:
            logger.error(f"Failed to fetch ticker {symbol} after retries: {type(e).__name__}")
            return None

    # ------------------------------------------------------------------ #
    #  Metrics — current snapshot for screener                            #
    # ------------------------------------------------------------------ #

    def get_current_metrics(self, symbol: str) -> Optional[dict]:
        cached = cache.get(f"metrics:{symbol}")
        if cached is not None:
            return cached
        
        try:
            tk = self._get_ticker(symbol)
            if tk is None:
                logger.warning(f"Could not fetch ticker for {symbol}")
                return None
            
            info = tk.info or {}
            price = _safe(info.get("currentPrice") or info.get("regularMarketPrice"))
            if not price:
                logger.debug(f"No price data for {symbol}")
                return None

            market_cap = _safe(info.get("marketCap"))
            shares = _safe(info.get("sharesOutstanding")) or 1

            # FCF from cashflow statement
            p_fcf = None
            fcf_ttm = None
            try:
                cf = tk.cashflow
                if cf is not None and not cf.empty:
                    col = cf.columns[0]
                    ocf = _first(cf, ["Operating Cash Flow",
                                      "Cash Flow From Continuing Operating Activities"], col)
                    capex = _first(cf, ["Capital Expenditure", "Capital Expenditures"], col)
                    if ocf is not None:
                        fcf_ttm = ocf - abs(capex or 0)
                        if fcf_ttm and fcf_ttm > 0 and market_cap:
                            p_fcf = market_cap / fcf_ttm
            except Exception:
                pass

            # Revenue growth
            rev_growth = _safe(info.get("revenueGrowth"))
            if rev_growth is None:
                try:
                    fin = tk.financials
                    if fin is not None and not fin.empty and len(fin.columns) >= 2:
                        rev_key = "Total Revenue"
                        if rev_key in fin.index:
                            r0 = _safe(fin.loc[rev_key, fin.columns[0]])
                            r1 = _safe(fin.loc[rev_key, fin.columns[1]])
                            if r0 and r1 and r1 != 0:
                                rev_growth = (r0 - r1) / abs(r1)
                except Exception:
                    pass

            graham = self._graham_score(info, tk)

            # D/E: yfinance returns as percentage (54.6 means 0.546) — normalize to ratio
            de_raw = _safe(info.get("debtToEquity"))
            de_normalized = de_raw / 100 if (de_raw is not None and de_raw > 10) else de_raw

            # Additional computed fields
            total_cash_val = _safe(info.get("totalCash") or info.get("cash")) or 0
            total_debt_val = _safe(info.get("totalDebt")) or 0
            net_debt_val   = total_debt_val - total_cash_val if (total_debt_val or total_cash_val) else None
            fcf_per_share  = round(fcf_ttm / shares, 2) if (fcf_ttm and shares and shares > 1) else None

            # Buyback yield = annualized share reduction (only if actually buying back)
            share_cagr_pct = graham.get("_share_cagr")  # e.g. -2.75 means −2.75%/yr
            buyback_yield  = abs(share_cagr_pct) / 100 if (share_cagr_pct is not None and share_cagr_pct < -0.1) else 0.0
            div_yield_val  = _safe(info.get("dividendYield")) / 100 if _safe(info.get("dividendYield")) else 0.0
            total_sh_yield = div_yield_val + buyback_yield if (div_yield_val or buyback_yield) else None

            # Extended-hours pricing (only present outside regular session)
            regular_change     = _safe(info.get("regularMarketChange"))
            regular_change_pct = _safe(info.get("regularMarketChangePercent"))
            post_price         = _safe(info.get("postMarketPrice"))
            post_change        = _safe(info.get("postMarketChange"))
            post_change_pct    = _safe(info.get("postMarketChangePercent"))
            pre_price          = _safe(info.get("preMarketPrice"))
            pre_change         = _safe(info.get("preMarketChange"))
            pre_change_pct     = _safe(info.get("preMarketChangePercent"))

            result = {
                "symbol": symbol,
                "name": info.get("longName", symbol),
                "sector": info.get("sector", "N/A"),
                "industry": info.get("industry", "N/A"),
                "price": price,
                "regular_market_change": regular_change,
                "regular_market_change_pct": regular_change_pct,
                "post_market_price": post_price,
                "post_market_change": post_change,
                "post_market_change_pct": post_change_pct,
                "pre_market_price": pre_price,
                "pre_market_change": pre_change,
                "pre_market_change_pct": pre_change_pct,
                "market_cap": market_cap,
                "pe_ratio": _safe(info.get("trailingPE") or info.get("forwardPE")),
                "forward_pe": _safe(info.get("forwardPE")),
                "p_fcf": _safe(p_fcf),
                "fcf_ttm": _safe(fcf_ttm),
                "ev_ebitda": _safe(info.get("enterpriseToEbitda")),
                "price_to_book": _safe(info.get("priceToBook")),
                "price_to_sales": _safe(info.get("priceToSalesTrailing12Months")),
                "peg_ratio": _safe(info.get("trailingPegRatio")),
                "revenue_growth": _safe(rev_growth),
                "profit_margin": _safe(info.get("profitMargins")),
                "operating_margin": _safe(info.get("operatingMargins")),
                "gross_margin": _safe(info.get("grossMargins")),
                "total_debt": _safe(info.get("totalDebt")),
                "net_debt": net_debt_val,
                "debt_to_equity": de_normalized,
                "current_ratio": _safe(info.get("currentRatio")),
                "return_on_equity": _safe(info.get("returnOnEquity")),
                "return_on_assets": _safe(info.get("returnOnAssets")),
                "dividend_yield": div_yield_val if div_yield_val else None,
                "buyback_yield": buyback_yield if buyback_yield else None,
                "total_shareholder_yield": total_sh_yield,
                "fcf_per_share": fcf_per_share,
                "revenue_cagr": graham.get("_rev_cagr"),
                "eps_cagr": graham.get("_eps_cagr"),
                "beta": _safe(info.get("beta")),
                "fifty_two_week_high": _safe(info.get("fiftyTwoWeekHigh")),
                "fifty_two_week_low": _safe(info.get("fiftyTwoWeekLow")),
                # surfaced from graham_score for screener-level display
                "roic": graham.get("_roic"),
                "interest_coverage": graham.get("_interest_cov"),
                "gross_margin_trend": graham.get("_gm_change"),
                "share_count_cagr": graham.get("_share_cagr"),
                "graham_score": graham,
            }
            # ROIC fallback: _calc_roic skips financial-sector companies in graham scoring,
            # so attempt unconditionally if still None
            if result["roic"] is None:
                try:
                    fin_tmp = tk.financials
                    bs_tmp  = tk.balance_sheet
                    r = self._calc_roic(fin_tmp, bs_tmp)
                    if r is not None:
                        result["roic"] = round(r * 100, 1)
                except Exception:
                    pass
            cache.set(f"metrics:{symbol}", result)
            return result
        except Exception as e:
            logger.warning(f"Failed to get metrics for {symbol}: {type(e).__name__}: {str(e)[:80]}")
            return None

    # ------------------------------------------------------------------ #
    #  Detail — full data with historical financials                      #
    # ------------------------------------------------------------------ #

    def get_full_stock_data(self, symbol: str) -> Optional[dict]:
        cached = cache.get(f"detail:{symbol}")
        if cached is not None:
            return cached
        
        try:
            tk = self._get_ticker(symbol)
            if tk is None:
                logger.warning(f"Could not fetch ticker for {symbol}")
                return None
            
            info = tk.info or {}

            current = self.get_current_metrics(symbol)
            if not current:
                logger.debug(f"No current metrics for {symbol}")
                return None

            # 5-year weekly price history
            try:
                hist = tk.history(period="5y", interval="1wk")
                price_history = [
                    {"date": d.strftime("%Y-%m-%d"), "price": round(row["Close"], 2),
                     "volume": int(row["Volume"])}
                    for d, row in hist.iterrows()
                ] if not hist.empty else []
            except Exception as e:
                logger.warning(f"Failed to fetch price history for {symbol}: {type(e).__name__}")
                price_history = []

            financial_history = self._financial_history(tk)
            earnings_history  = self._earnings_history(tk)

            # Graham number
            eps = _safe(info.get("trailingEps"))
            bvps = _safe(info.get("bookValue"))
            graham_number = None
            if eps and eps > 0 and bvps and bvps > 0:
                graham_number = round(math.sqrt(22.5 * eps * bvps), 2)

            result = {
                **current,
                "description": info.get("longBusinessSummary", ""),
                "website": info.get("website", ""),
                "employees": info.get("fullTimeEmployees"),
                "eps": eps,
                "book_value_per_share": bvps,
                "graham_number": graham_number,
                "analyst_target": _safe(info.get("targetMeanPrice")),
                "analyst_rec_key": info.get("recommendationKey", ""),
                "price_history": price_history,
                "financial_history": financial_history,
                "earnings_history": earnings_history,
            }
            # ROIC fallback: use most recent historical ROIC if top-level is still None
            if result.get("roic") is None:
                hist_roics = [y.get("roic") for y in financial_history.get("annual", []) if y.get("roic")]
                if hist_roics:
                    result["roic"] = hist_roics[-1]

            cache.set(f"detail:{symbol}", result)
            logger.debug(f"Full stock data loaded for {symbol}")
            return result
        except Exception as e:
            logger.warning(f"Failed to get full stock data for {symbol}: {type(e).__name__}: {str(e)[:80]}")
            return None

    # ------------------------------------------------------------------ #
    #  Historical financials helper                                       #
    # ------------------------------------------------------------------ #

    # ------------------------------------------------------------------ #
    #  Financial history — shared row builder                           #
    # ------------------------------------------------------------------ #

    @staticmethod
    def _build_period_row(fin, cf, bs, col, period_label: str, bs_col=None) -> dict:
        """Build one period row from income / cashflow / balance-sheet DataFrames."""
        d: dict = {"period": period_label}

        rev    = _first(fin, ["Total Revenue"], col)
        net    = _first(fin, ["Net Income", "Net Income Common Stockholders"], col)
        gp     = _first(fin, ["Gross Profit"], col)
        oi     = _first(fin, ["Operating Income", "Operating Income Loss"], col)
        ebitda = _first(fin, ["EBITDA", "Normalized EBITDA"], col)

        d["revenue"]          = rev
        d["net_income"]       = net
        d["gross_profit"]     = gp
        d["operating_income"] = oi
        d["ebitda"]           = ebitda
        d["gross_margin"]     = round(gp / rev * 100, 1) if gp and rev else None
        d["operating_margin"] = round(oi / rev * 100, 1) if oi and rev else None
        d["net_margin"]       = round(net / rev * 100, 1) if net and rev else None

        eps_y = _first(fin, ["Diluted EPS", "Basic EPS"], col)
        d["eps"] = round(eps_y, 2) if eps_y is not None else None
        if eps_y and net and abs(eps_y) > 0.01:
            d["shares"] = round(net / eps_y / 1e6, 1)  # millions

        if cf is not None and not cf.empty and col in cf.columns:
            ocf   = _first(cf, ["Operating Cash Flow",
                                 "Cash Flow From Continuing Operating Activities"], col)
            capex = _first(cf, ["Capital Expenditure", "Capital Expenditures"], col)
            if ocf is not None:
                capex_abs = abs(capex) if capex is not None else 0
                d["operating_cashflow"] = ocf
                d["capex"]              = capex_abs
                d["fcf"]                = ocf - capex_abs
                d["fcf_margin"]         = round((ocf - capex_abs) / rev * 100, 1) if rev else None

        effective_bs_col = bs_col if bs_col is not None else col
        if bs is not None and not bs.empty and effective_bs_col in bs.columns:
            d["total_debt"] = _first(bs, ["Total Debt",
                                          "Long Term Debt And Capital Lease Obligation",
                                          "Long Term Debt"], effective_bs_col)
            d["cash"]       = _first(bs, ["Cash And Cash Equivalents",
                                          "Cash Cash Equivalents And Short Term Investments"], effective_bs_col)
            d["equity"]     = _first(bs, ["Total Stockholder Equity",
                                          "Stockholders Equity",
                                          "Common Stock Equity"], effective_bs_col)
            ca = _first(bs, ["Current Assets",      "Total Current Assets"],      effective_bs_col)
            cl = _first(bs, ["Current Liabilities", "Total Current Liabilities"], effective_bs_col)
            d["current_assets"]      = ca
            d["current_liabilities"] = cl
            d["current_ratio_hist"]  = round(ca / cl, 2) if ca and cl and cl != 0 else None

        return d

    def _financial_history(self, tk: yf.Ticker) -> dict:
        result = {"annual": [], "quarterly": []}

        # ── Annual ────────────────────────────────────────────────────────
        try:
            fin = tk.financials
            cf  = tk.cashflow
            bs  = tk.balance_sheet
            if fin is not None and not fin.empty:
                bs_cols_asc = list(reversed(bs.columns)) if bs is not None and not bs.empty else []
                for i, col in enumerate(reversed(fin.columns)):
                    label  = col.strftime("%Y")
                    bs_col = bs_cols_asc[i] if i < len(bs_cols_asc) else None
                    d      = self._build_period_row(fin, cf, bs, col, label, bs_col=bs_col)

                    # ROIC per year
                    if bs_col and bs is not None and not bs.empty and bs_col in bs.columns:
                        try:
                            oi_y  = _first(fin, ["Operating Income", "Operating Income Loss"], col)
                            if oi_y and oi_y > 0:
                                eq_y  = _first(bs, ["Total Stockholder Equity", "Common Stock Equity"], bs_col) or 0
                                dbt_y = _first(bs, ["Total Debt", "Long Term Debt And Capital Lease Obligation"], bs_col) or 0
                                csh_y = _first(bs, ["Cash And Cash Equivalents",
                                                     "Cash Cash Equivalents And Short Term Investments"], bs_col) or 0
                                ic_y  = eq_y + dbt_y - csh_y
                                if ic_y <= 1e6:
                                    ic_y = max(abs(eq_y) + dbt_y, 1e9)
                                roic_y = oi_y * 0.79 / ic_y * 100
                                if 0 < roic_y < 200:
                                    d["roic"] = round(roic_y, 1)
                        except Exception:
                            pass

                    result["annual"].append(d)
        except Exception as e:
            logger.error(f"annual_history error: {type(e).__name__}: {str(e)[:120]}")

        # ── Quarterly ─────────────────────────────────────────────────────
        try:
            qfin = tk.quarterly_financials
            qcf  = tk.quarterly_cashflow
            qbs  = tk.quarterly_balance_sheet
            if qfin is not None and not qfin.empty:
                for col in reversed(qfin.columns):  # oldest → newest
                    q_num = (col.month - 1) // 3 + 1
                    label = f"Q{q_num} {col.year}"
                    d     = self._build_period_row(qfin, qcf, qbs, col, label)
                    result["quarterly"].append(d)
        except Exception as e:
            logger.error(f"quarterly_history error: {type(e).__name__}: {str(e)[:120]}")

        return result

    def _earnings_history(self, tk: yf.Ticker) -> list:
        """EPS actual vs estimate from earnings_dates. Newest first, up to 12 entries."""
        history = []
        try:
            ed = tk.earnings_dates
            if ed is None or ed.empty:
                return history
            for dt, row in ed.head(12).iterrows():
                eps_est = _safe(row.get("EPS Estimate"))
                eps_act = _safe(row.get("Reported EPS"))
                surprise = _safe(row.get("Surprise(%)"))
                is_future = eps_act is None
                history.append({
                    "date":         dt.strftime("%Y-%m-%d"),
                    "eps_estimate": eps_est,
                    "eps_actual":   eps_act,
                    "surprise_pct": surprise,
                    "beat":         (eps_act > eps_est) if (eps_act is not None and eps_est is not None) else None,
                    "is_future":    is_future,
                })
        except Exception as e:
            logger.warning(f"earnings_history error: {type(e).__name__}: {str(e)[:80]}")
        return history

    # ------------------------------------------------------------------ #
    #  Fundamental scoring  (sector-aware, analyst-grade)                #
    # ------------------------------------------------------------------ #

    def _graham_score(self, info: dict, tk: yf.Ticker) -> dict:
        score    = 0.0
        criteria = []
        sector       = info.get("sector", "")
        is_financial = sector in self._FINANCIAL_SECTORS
        is_cap_heavy = sector in self._CAPITAL_INTENSIVE

        # ── Fetch statements once ────────────────────────────────────
        try:    fin = tk.financials
        except: fin = None
        try:    cf  = tk.cashflow
        except: cf  = None
        try:    bs  = tk.balance_sheet
        except: bs  = None

        def check(name, value, passed, threshold, weight=1.0, note=""):
            nonlocal score
            criteria.append(dict(name=name, value=value, threshold=threshold,
                                 passed=passed, weight=weight, note=note))
            if passed: score += weight

        # ── Pre-compute values used across multiple checks ────────────
        fcf_abs        = None
        p_fcf          = None
        net_income_abs = None
        rev_cagr       = None
        eps_cagr       = None

        if cf is not None and not cf.empty:
            try:
                _c  = cf.columns[0]
                ocf = _first(cf, ["Operating Cash Flow",
                                  "Cash Flow From Continuing Operating Activities"], _c)
                cpx = _first(cf, ["Capital Expenditure", "Capital Expenditures"], _c)
                if ocf is not None:
                    fcf_abs = ocf - abs(cpx or 0)
                    mc = _safe(info.get("marketCap"))
                    if mc and mc > 0 and fcf_abs:
                        p_fcf = mc / fcf_abs
            except Exception: pass

        if fin is not None and not fin.empty:
            try:
                _c = fin.columns[0]
                net_income_abs = _first(fin, ["Net Income",
                                              "Net Income Common Stockholders"], _c)
            except Exception: pass

            try:
                if "Total Revenue" in fin.index:
                    rv = [_safe(v) for v in fin.loc["Total Revenue"]]
                    rv = [v for v in rv if v is not None]
                    if len(rv) >= 2 and rv[-1] > 0 and rv[0] > 0:
                        rev_cagr = (rv[0] / rv[-1]) ** (1 / (len(rv) - 1)) - 1
            except Exception: pass

            try:
                for key in ["Basic EPS", "Diluted EPS"]:
                    if key in fin.index:
                        ev = [_safe(v) for v in fin.loc[key]]
                        ev = [v for v in ev if v is not None and v > 0]
                        if len(ev) >= 2:
                            eps_cagr = (ev[0] / ev[-1]) ** (1 / (len(ev) - 1)) - 1
                        break
            except Exception: pass

        # ════════════════════════════════════════════════════════════
        # TIER 1 — VALUATION
        # ════════════════════════════════════════════════════════════
        pe = _safe(info.get("trailingPE"))
        if pe:
            lim = 12 if is_financial else 15
            check("P/E Ratio", round(pe, 1), pe < lim, f"< {lim}", 1.5)

        pb = _safe(info.get("priceToBook"))
        if pb and not is_financial:
            check("Price / Book", round(pb, 2), pb < 3.0, "< 3", 0.5,
                  note="Many quality franchises trade above 1.5× — threshold relaxed")

        if pe and pb:
            check("P/E × P/Book", round(pe * pb, 1), pe * pb < 22.5, "< 22.5", 1.5,
                  note="Graham's compound valuation test — both cheap on price AND assets")

        if p_fcf is not None and not is_financial:
            check("P/FCF", round(p_fcf, 1), 0 < p_fcf < 25, "< 25  (yield > 4%)", 1.5,
                  note="Strips out non-cash earnings; harder to manipulate than P/E")

        # ════════════════════════════════════════════════════════════
        # TIER 2 — PROFITABILITY QUALITY
        # ════════════════════════════════════════════════════════════
        op_margin = _safe(info.get("operatingMargins"))
        if op_margin is not None:
            floor = 0.05 if is_cap_heavy else 0.10
            check("Operating Margin", f"{op_margin*100:.1f}%",
                  op_margin > floor, f"> {int(floor*100)}%", 1.0)

        roe = _safe(info.get("returnOnEquity"))
        if roe is not None:
            rf = 0.12 if is_financial else 0.10
            check(f"ROE > {int(rf*100)}%", f"{roe*100:.1f}%", roe > rf, f"> {int(rf*100)}%", 1.0,
                  note="Sustainable high ROE without excessive leverage = quality business")

        # FCF conversion (skip for banks — FCF is ill-defined for them)
        if not is_financial and fcf_abs is not None and net_income_abs and net_income_abs > 0:
            conv = fcf_abs / net_income_abs
            check("FCF Conversion > 75%", f"{conv*100:.0f}%", conv > 0.75, "> 75%", 1.0,
                  note="Earnings converting to real cash — hard to fake with accounting")

        # ── NEW: ROIC > 12% ──────────────────────────────────────────
        roic = None
        if fin is not None and bs is not None and not is_financial:
            roic = self._calc_roic(fin, bs)
            if roic is not None:
                check("ROIC > 12%", f"{roic*100:.1f}%", roic > 0.12, "> 12%", 2.0,
                      note="Return on Invested Capital > cost of capital = every $ reinvested creates value")

        # ── NEW: Gross margin trend ───────────────────────────────────
        gm, gm_change = (None, None)
        if fin is not None and not fin.empty:
            gm, gm_change = self._calc_gross_margin_trend(fin)
            if gm is not None:
                expanding = gm_change is not None and gm_change > 0.01
                contracting = gm_change is not None and gm_change < -0.01
                trend_str = "expanding" if expanding else ("contracting" if contracting else "stable")
                check("Gross Margin trend", f"{gm*100:.1f}% ({trend_str})",
                      gm > 0.30 and not contracting,
                      "> 30% & not contracting", 1.5,
                      note="Expanding margins = pricing power / widening moat. Contracting = competition winning")

        # ════════════════════════════════════════════════════════════
        # TIER 3 — FINANCIAL HEALTH
        # ════════════════════════════════════════════════════════════
        if is_financial:
            roa = _safe(info.get("returnOnAssets"))
            if roa is not None:
                check("ROA > 1% (banks)", f"{roa*100:.2f}%", roa > 0.01, "> 1%", 1.0,
                      note="D/E meaningless for banks — ROA measures asset productivity")
        else:
            if fin is not None and bs is not None and not fin.empty and not bs.empty:
                try:
                    ebitda = _first(fin, ["EBITDA", "Normalized EBITDA"], fin.columns[0])
                    debt   = _first(bs,  ["Total Debt",
                                          "Long Term Debt And Capital Lease Obligation"],
                                    bs.columns[0])
                    if debt is not None and ebitda and ebitda > 0:
                        de_ratio = debt / ebitda
                        lim = 5.0 if is_cap_heavy else 3.0
                        check("Debt / EBITDA", f"{de_ratio:.1f}×",
                              de_ratio < lim, f"< {lim}×", 1.0,
                              note="Years of operating profit needed to repay all debt")
                except Exception: pass

        # ── NEW: Interest coverage ────────────────────────────────────
        ic = None
        if fin is not None and not fin.empty:
            ic = self._calc_interest_coverage(fin)
            if ic is not None:
                check("Interest Coverage", f"{ic:.1f}×", ic > 5, "> 5×", 1.0,
                      note="EBIT / Interest Expense. Below 3× = fragile; above 10× = fortress")

        # ════════════════════════════════════════════════════════════
        # TIER 4 — GROWTH & EARNINGS QUALITY
        # ════════════════════════════════════════════════════════════
        if fin is not None and not fin.empty and "Net Income" in fin.index:
            try:
                ni_vals = [_safe(v) for v in fin.loc["Net Income"]]
                ni_vals = [v for v in ni_vals if v is not None]
                if ni_vals:
                    pos = sum(1 for v in ni_vals if v > 0)
                    check("Earnings Stability", f"{pos}/{len(ni_vals)} yrs positive",
                          pos == len(ni_vals), f"All {len(ni_vals)} years", 1.0)
                    if len(ni_vals) >= 2 and ni_vals[-1] > 0 and ni_vals[0] > 0:
                        ni_cagr = (ni_vals[0] / ni_vals[-1]) ** (1 / (len(ni_vals) - 1)) - 1
                        check("Earnings CAGR > 5%", f"{ni_cagr*100:.1f}%/yr",
                              ni_cagr > 0.05, "> 5%/yr", 1.0,
                              note="Compounding earnings = compounding intrinsic value")
            except Exception: pass

        if rev_cagr is not None:
            check("Revenue CAGR > 5%", f"{rev_cagr*100:.1f}%/yr",
                  rev_cagr > 0.05, "> 5%/yr", 0.5)

        # ── NEW: EPS growing faster than revenue (operating leverage) ─
        if eps_cagr is not None and rev_cagr is not None:
            check("EPS CAGR ≥ Rev CAGR",
                  f"{eps_cagr*100:.1f}% vs {rev_cagr*100:.1f}%",
                  eps_cagr >= rev_cagr - 0.01,
                  "EPS ≥ Revenue growth", 1.0,
                  note="Operating leverage: fixed costs spreading over more revenue = margin expansion")

        # ════════════════════════════════════════════════════════════
        # TIER 5 — CAPITAL ALLOCATION
        # ════════════════════════════════════════════════════════════

        # ── NEW: Share count direction ────────────────────────────────
        share_cagr = None
        if fin is not None and not fin.empty:
            share_cagr = self._calc_share_trend(fin)
            if share_cagr is not None:
                direction = "buybacks" if share_cagr < -0.005 else \
                            ("stable"  if share_cagr <  0.01  else "diluting")
                check("Share Count", f"{share_cagr*100:+.1f}%/yr ({direction})",
                      share_cagr < 0.01, "≤ +1%/yr", 1.0,
                      note="Declining share count concentrates your ownership. Dilution erodes it.")

        dy = _safe(info.get("dividendYield"))
        if dy: dy = dy / 100  # yfinance returns as percentage (e.g. 1.95 = 1.95%), convert to fraction
        if dy and dy > 0:
            check("Dividend", f"{dy*100:.2f}%", True, "> 0%", 0.5,
                  note="Bonus: mature cash-generative business returning capital")

        # ── Normalise to 0–10, guard for data gaps ────────────────────
        max_possible = sum(c["weight"] for c in criteria)
        normalized   = round((score / max_possible * 10), 1) if max_possible > 0 else 0.0
        insufficient = len(criteria) < 6
        if insufficient:
            normalized = min(normalized, 6.0)

        return {
            "score":            normalized,
            "raw_score":        round(score, 1),
            "max_possible":     round(max_possible, 1),
            "criteria_count":   len(criteria),
            "insufficient_data": insufficient,
            "sector_mode":      "financial" if is_financial else
                                ("capital_intensive" if is_cap_heavy else "standard"),
            # surface computed values for the detail view
            "_roic":            round(roic * 100, 1) if roic is not None else None,
            "_gross_margin":    round(gm * 100, 1)   if gm   is not None else None,
            "_gm_change":       round(gm_change * 100, 1) if gm_change is not None else None,
            "_interest_cov":    round(ic, 1)          if ic   is not None else None,
            "_share_cagr":      round(share_cagr * 100, 2) if share_cagr is not None else None,
            "_eps_cagr":        round(eps_cagr * 100, 1)   if eps_cagr  is not None else None,
            "_rev_cagr":        round(rev_cagr * 100, 1)   if rev_cagr  is not None else None,
            "criteria":         criteria,
        }
