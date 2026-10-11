"""Fetch real EOD history; never create synthetic or zero-price market data."""
from __future__ import annotations
import json
import math
import os
import re
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timedelta, timezone
from pathlib import Path
import yfinance as yf

ROOT = Path(__file__).resolve().parents[1]
DEST = ROOT / 'web/data/market.json'

def number(value):
    try:
        n = float(value)
        return n if math.isfinite(n) else None
    except (TypeError, ValueError):
        return None

def fetch(symbol, require_usd=True):
    ticker = yf.Ticker(symbol)
    history = ticker.history(start=(datetime.now(timezone.utc)-timedelta(days=365.25*11)).strftime('%Y-%m-%d'), auto_adjust=False, raise_errors=True, timeout=15)
    if history.empty or 'Adj Close' not in history:
        raise ValueError('No adjusted daily price history')
    rows = []
    for date, row in history.iterrows():
        close, adjusted, volume = (number(row.get(k)) for k in ('Close', 'Adj Close', 'Volume'))
        if close and adjusted and close > 0 and adjusted > 0:
            rows.append({'date': date.strftime('%Y-%m-%d'), 'close': round(close, 6), 'adjusted': round(adjusted, 6), 'volume': int(volume or 0)})
    if len(rows) < 210:
        raise ValueError('Fewer than 210 valid trading days')
    info, holdings, warning = {}, [], None
    try:
        raw = ticker.info or {}
        info = {k: raw.get(k) for k in ('quoteType','currency','category','sector') if raw.get(k)}
        for key in ('trailingPE', 'forwardPE'):
            info[key] = number(raw.get(key))
        info['expenseRatio'] = number(raw.get('annualReportExpenseRatio'))
        name = raw.get('longName') or raw.get('shortName') or symbol
        if info.get('quoteType') == 'ETF':
            try:
                top = ticker.funds_data.top_holdings
                for holding_symbol, row in top.iterrows():
                    weight = number(row.get('Holding Percent'))
                    if weight is not None and 0 <= weight <= 1:
                        holdings.append({'symbol': str(holding_symbol), 'name': str(row.get('Name') or holding_symbol), 'weight': weight})
            except Exception:
                pass
    except Exception:
        name, warning = symbol, 'Fundamental metadata unavailable'
    currency = info.get('currency') or ticker.history_metadata.get('currency')
    if not currency:
        raise ValueError('Trading currency unavailable')
    if require_usd and currency != 'USD':
        raise ValueError(f'Only USD securities supported; currency={currency}')
    info['currency'] = currency
    return {'symbol':symbol,'name':name,'info':info,'holdings':holdings,'history':rows,'metadataAsOf':datetime.now(timezone.utc).date().isoformat(),'source':'Yahoo Finance via yfinance (unofficial EOD source)','warning':warning}

def main():
    symbols = json.loads((ROOT/'universe.json').read_text())
    symbols += re.split(r'[\s,]+',os.environ.get('EXTRA_TICKERS','').upper().strip())
    symbols = sorted({s for s in symbols if s})
    if len(symbols)>150 or any(not re.fullmatch(r'[A-Z0-9.^=-]{1,20}',s) for s in symbols):
        raise ValueError('Universe contains invalid symbols or more than 150 tickers')
    old = json.loads(DEST.read_text()) if DEST.exists() else {'assets':{}}
    assets, errors = {}, {}
    with ThreadPoolExecutor(max_workers=4) as executor:
        jobs = {executor.submit(fetch,s):s for s in symbols}
        for job in as_completed(jobs):
            symbol=jobs[job]
            try:
                assets[symbol]=job.result()
                print(f'{symbol}: {assets[symbol]["history"][-1]["date"]}')
            except Exception as exc:
                errors[symbol]=str(exc)[:180]
                if symbol in old.get('assets',{}):
                    assets[symbol]=old['assets'][symbol]
                    assets[symbol]['warning']='Refresh failed; original data dates preserved'
                print(f'{symbol}: unavailable')
    if not assets:
        raise RuntimeError('No market data available. Deployment stopped instead of publishing invented prices.')
    payload={'generatedAt':datetime.now(timezone.utc).isoformat(),'source':'Yahoo Finance via yfinance','assets':assets,'errors':errors}
    DEST.parent.mkdir(parents=True,exist_ok=True)
    temp=DEST.with_suffix('.tmp')
    temp.write_text(json.dumps(payload,ensure_ascii=False,allow_nan=False,separators=(',',':')))
    temp.replace(DEST)

if __name__ == '__main__':
    main()
