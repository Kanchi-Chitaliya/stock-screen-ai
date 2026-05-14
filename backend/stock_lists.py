# S&P 500 constituents (~500 stocks, as of mid-2025; updated quarterly by index provider)
SP_500 = [
    # Information Technology
    "AAPL", "MSFT", "NVDA", "AVGO", "ORCL", "ADBE", "CRM", "AMD", "QCOM", "TXN",
    "INTU", "CSCO", "IBM", "ACN", "AMAT", "LRCX", "ADI", "MU", "KLAC", "SNPS",
    "CDNS", "NOW", "PANW", "CRWD", "FTNT", "CTSH", "CDW", "HPE", "HPQ", "NTAP",
    "STX", "WDC", "KEYS", "JNPR", "GLW", "VRSN", "AKAM", "PTC", "TYL", "LDOS",
    "TRMB", "SWKS", "MPWR", "GEN", "FFIV", "JKHY", "TEL", "TER", "ANSS", "NXPI",
    "ON", "ENPH", "EPAM", "DXC", "BR", "IT", "ZBRA", "INTC", "MCHP", "QRVO",
    "PLTR", "DELL", "GDDY", "NET", "DDOG", "ZS",
    # Communication Services
    "GOOGL", "GOOG", "META", "NFLX", "TMUS", "VZ", "T", "CMCSA", "DIS", "CHTR",
    "WBD", "IPG", "OMC", "PARA", "FOXA", "FOX", "LYV", "MTCH", "EA", "TTWO",
    "NWSA", "NWS",
    # Consumer Discretionary
    "AMZN", "TSLA", "HD", "MCD", "NKE", "SBUX", "BKNG", "LOW", "TJX", "MAR",
    "CMG", "ORLY", "AZO", "DHI", "LEN", "NVR", "PHM", "GRMN", "RCL", "CCL",
    "HLT", "MGM", "WYNN", "LVS", "RL", "PVH", "HAS", "MAT", "WHR", "MHK",
    "APTV", "BWA", "F", "GM", "LKQ", "TSCO", "ROST", "DLTR", "DG", "BBY",
    "EBAY", "ETSY", "UBER", "ABNB", "DASH", "DECK", "TPR", "NWL", "CZR", "GPC",
    "VFC", "YUM", "DRI", "EXPE", "NCLH", "H",
    # Consumer Staples
    "WMT", "PG", "KO", "PEP", "COST", "PM", "MO", "MDLZ", "KHC", "CL",
    "CLX", "EL", "MNST", "STZ", "KMB", "SYY", "CAG", "CPB", "GIS", "HRL",
    "HSY", "K", "MKC", "SJM", "TAP", "TSN", "WBA", "KR", "BF-B", "CHD",
    "CELH", "COTY", "SPB",
    # Healthcare
    "UNH", "LLY", "JNJ", "ABBV", "MRK", "TMO", "ABT", "AMGN", "ISRG", "GILD",
    "REGN", "VRTX", "CI", "ELV", "HUM", "CNC", "MOH", "BIIB", "ILMN", "DXCM",
    "MRNA", "ZTS", "SYK", "BSX", "MDT", "EW", "BDX", "HOLX", "IDXX", "IQV",
    "A", "BAX", "PODD", "ALGN", "MTD", "DGX", "LH", "HCA", "THC", "UHS",
    "DVA", "VTRS", "PFE", "BMY", "MCK", "ABC", "CAH", "GEHC", "RMD", "COO",
    "STE", "HSIC", "TECH", "WAT", "RVTY", "SOLV", "INCY", "EXAS", "NTRA",
    # Financials
    "BRK-B", "JPM", "V", "MA", "BAC", "GS", "MS", "C", "WFC", "AXP",
    "BLK", "SCHW", "SPGI", "MCO", "CB", "PGR", "TRV", "ALL", "AFL", "MET",
    "PRU", "AIG", "HIG", "LNC", "CINF", "GL", "IVZ", "BEN", "FLT", "CBOE",
    "ICE", "CME", "MSCI", "USB", "TFC", "FITB", "KEY", "CFG", "HBAN", "MTB",
    "ZION", "RF", "STT", "BK", "NTRS", "ALLY", "SYF", "DFS", "COF", "WRB",
    "AJG", "BRO", "MMC", "AON", "RJF", "SEIC", "TROW", "NDAQ", "MKTX",
    "RE", "ACGL", "EG", "PFG", "LPLA", "WTW", "CINF",
    # Industrials
    "HON", "CAT", "GE", "RTX", "LMT", "NOC", "GD", "BA", "MMM", "EMR",
    "ETN", "PH", "ITW", "ROK", "FTV", "SWK", "AME", "IR", "XYL", "CARR",
    "OTIS", "TT", "JCI", "CTAS", "FAST", "PAYX", "ADP", "VRSK", "NSC", "CSX",
    "UNP", "WAB", "CHRW", "EXPD", "GXO", "XPO", "JBHT", "LSTR", "URI", "RSG",
    "WM", "CWST", "SRCL", "AOS", "DE", "AGCO", "TDG", "AXON", "LHX", "HII",
    "TXT", "SAIC", "BAH", "RHI", "MAN", "J", "PWR", "ACM", "FLR", "MTZ",
    "NVT", "GNRC", "HUBB", "GEV", "BLDR", "MAS", "ALLE", "NDSN", "ROP", "IEX",
    # Energy
    "XOM", "CVX", "COP", "SLB", "EOG", "MPC", "PSX", "VLO", "OXY", "HES",
    "DVN", "FANG", "APA", "MRO", "BKR", "HAL", "NOV", "CTRA", "EQT", "OKE",
    "WMB", "KMI", "LNG", "TRGP",
    # Materials
    "LIN", "APD", "ECL", "SHW", "PPG", "VMC", "MLM", "NEM", "FCX", "NUE",
    "STLD", "RS", "CMC", "AA", "ALB", "MOS", "CF", "FMC", "IFF", "EMN",
    "CE", "HUN", "OLN", "AXTA", "RPM", "TREX", "SON", "PKG", "SEE", "BERY",
    "AMCR", "ATI",
    # Real Estate
    "AMT", "PLD", "EQIX", "CCI", "SPG", "PSA", "DLR", "O", "VICI", "AVB",
    "EQR", "MAA", "UDR", "ESS", "IRM", "SBAC", "EXR", "CUBE", "ARE", "BXP",
    "KIM", "REG", "FRT", "VTR", "WELL", "PEAK", "HST", "SUI", "ELS", "AMH",
    "INVH", "NNN", "GLPI", "STAG", "FR", "EGP", "REXR", "WY",
    # Utilities
    "NEE", "DUK", "SO", "D", "AEP", "EXC", "SRE", "XEL", "ED", "EIX",
    "PEG", "DTE", "FE", "PPL", "NI", "CMS", "ES", "AES", "ETR", "WEC",
    "LNT", "EVRG", "AWK", "SWX", "UGI", "SR",
]

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


def _dedup(*lists) -> list[str]:
    seen = set()
    out = []
    for lst in lists:
        for t in lst:
            if t not in seen:
                seen.add(t)
                out.append(t)
    return out


INDEX_MAP = {
    "top_25":     TOP_25,
    "nasdaq_100": NASDAQ_100,
    "sp_100":     SP_100,
    "sp_500":     _dedup(SP_500),
    "combined":   get_combined_list(),
}
