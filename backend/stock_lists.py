NASDAQ_100 = [
    "AAPL", "MSFT", "NVDA", "AMZN", "META", "GOOGL", "GOOG", "TSLA", "AVGO", "COST",
    "ASML", "NFLX", "AMD", "QCOM", "INTU", "ADBE", "TXN", "AMGN", "CSCO", "ISRG",
    "CMCSA", "AMAT", "MU", "LRCX", "REGN", "KLAC", "PANW", "SNPS", "CDNS", "CRWD",
    "ADI", "MELI", "PYPL", "ORLY", "FTNT", "MDLZ", "MNST", "PCAR", "MRVL", "ON",
    "KDP", "GEHC", "EA", "DXCM", "EXC", "CSGP", "XEL", "IDXX", "VRSK", "DLTR",
    "ILMN", "BIIB", "TEAM", "ANSS", "ZS", "ABNB", "DDOG", "MCHP", "BKNG", "NXPI",
    "ROST", "MAR", "WDAY", "CPRT", "AEP", "CSX", "CTAS", "SBUX", "CHTR", "KHC",
    "LULU", "CDW", "GILD", "CEG", "DASH", "ROP", "PLTR", "TTD", "MRNA", "MSCI",
    "NTAP", "PAYX", "FAST", "CTSH", "BKR", "PDD", "FANG", "ODFL", "SPLK", "WBD",
    "TTWO", "EBAY", "ZM", "OKTA", "RIVN", "LCID", "SIRI", "NXST", "ALGN", "SMCI",
]

SP_100 = [
    "AAPL", "MSFT", "NVDA", "AMZN", "GOOGL", "META", "TSLA", "AVGO", "LLY", "UNH",
    "V", "XOM", "JPM", "PG", "MA", "JNJ", "HD", "MRK", "ABBV", "COST",
    "KO", "PEP", "ADBE", "WMT", "CVX", "BAC", "CRM", "PFE", "NFLX", "TMO",
    "ACN", "MCD", "NKE", "CSCO", "ABT", "ORCL", "DHR", "TXN", "INTU", "NEE",
    "PM", "AMGN", "IBM", "RTX", "CAT", "GS", "MS", "T", "HON", "BA",
    "VZ", "SBUX", "ISRG", "BLK", "SPGI", "AXP", "SYK", "MDLZ", "LIN", "CB",
    "DE", "ADP", "C", "GILD", "MO", "TGT", "NOW", "REGN", "BKNG", "ZTS",
    "CI", "SCHW", "CVS", "PLD", "SO", "DUK", "ETN", "ADI", "EOG", "SLB",
    "PGR", "COP", "FDX", "MCO", "WM", "CME", "ELV", "FISV", "NSC", "USB",
    "AON", "ITW", "BMY", "MET", "TFC", "APD", "EMR", "BRK-B", "MMM", "GE",
]


# Curated top 25 — most representative companies across sectors
TOP_25 = [
    # Big Tech & Software
    "AAPL", "MSFT", "GOOGL", "AMZN", "META", "NVDA",
    # Consumer & Retail
    "COST", "WMT", "HD", "MCD", "KO", "PG",
    # Healthcare & Pharma
    "JNJ", "LLY", "UNH", "ABBV",
    # Financials
    "JPM", "V",
    # Industrials & Energy
    "CAT", "XOM",
    # Semiconductors
    "AVGO", "TSLA",
    # Payments / Fintech
    "MA",
    # Diversified
    "BRK-B", "NFLX",
]


def get_combined_list() -> list[str]:
    seen = set()
    combined = []
    for t in NASDAQ_100 + SP_100:
        if t not in seen:
            seen.add(t)
            combined.append(t)
    return combined


INDEX_MAP = {
    "top_25":   TOP_25,
    "nasdaq_100": NASDAQ_100,
    "sp_100":   SP_100,
    "combined": get_combined_list(),
}
