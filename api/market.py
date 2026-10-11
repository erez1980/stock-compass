"""Read-only ticker endpoint. Never accepts or stores portfolio records."""
from http.server import BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs
from datetime import datetime, timezone
import json
import math
import re
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from scripts.update_market import fetch
import yfinance as yf

SYMBOL = re.compile(r'[A-Z0-9.^=-]{1,20}')


def normalize_currency(asset, fx_loader=None):
    currency = asset['info']['currency']
    if currency == 'USD':
        return asset
    unit = 0.01 if currency in ('GBp', 'GBX', 'ILA') else 1
    base = {'GBp': 'GBP', 'GBX': 'GBP', 'ILA': 'ILS'}.get(currency, currency)
    if not re.fullmatch(r'[A-Z]{3}', base):
        raise ValueError('Unsupported trading currency')
    fx = (fx_loader or (lambda symbol: yf.Ticker(symbol).history(period='5d', timeout=15)))(base + 'USD=X')
    if fx.empty:
        raise ValueError('Exchange rate unavailable')
    rate = float(fx.iloc[-1]['Close']) * unit
    if not math.isfinite(rate) or rate <= 0:
        raise ValueError('Invalid exchange rate')
    asset['fx'] = {'currency': currency, 'usdPerUnit': rate, 'date': fx.index[-1].strftime('%Y-%m-%d'), 'localClose': asset['history'][-1]['close']}
    # Constant conversion preserves the native-currency technical signal.
    for row in asset['history']:
        row['close'] *= rate
        row['adjusted'] *= rate
    asset['info']['currency'] = 'USD'
    return asset


class handler(BaseHTTPRequestHandler):
    def respond(self, status, payload):
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Access-Control-Allow-Origin', 'https://erez1980.github.io')
        self.send_header('Cache-Control', 'public, max-age=300, s-maxage=3600' if status == 200 else 'no-store')
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.end_headers()
        self.wfile.write(json.dumps(payload, ensure_ascii=False, allow_nan=False).encode())

    def do_GET(self):
        query = parse_qs(urlparse(self.path).query)
        # Only ticker lookup, never an arbitrary URL or portfolio payload.
        if set(query) != {'symbol'} or len(query['symbol']) != 1:
            return self.respond(400, {'error': 'יש לשלוח טיקר אחד בלבד.'})
        symbol = query['symbol'][0].strip().upper()
        if not SYMBOL.fullmatch(symbol):
            return self.respond(400, {'error': 'טיקר אינו תקין.'})
        try:
            asset = normalize_currency(fetch(symbol, require_usd=False))
            return self.respond(200, {'asset': asset, 'fetchedAt': datetime.now(timezone.utc).isoformat()})
        except ValueError:
            return self.respond(422, {'error': 'הטיקר לא נמצא או שאין עבורו מספיק היסטוריה, מטבע ושער חליפין תקינים. נסה טיקר עם סיומת הבורסה המתאימה.'})
        except Exception:
            return self.respond(502, {'error': 'ספק נתוני השוק לא החזיר נתונים תקינים כרגע. בדוק את הטיקר ונסה שוב בעוד מספר דקות.'})

    def do_POST(self):
        self.respond(405, {'error': 'השירות מקבל בקשות טיקר לקריאה בלבד.'})
