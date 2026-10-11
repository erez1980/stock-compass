import unittest
import pandas as pd
from api.market import normalize_currency

class CurrencyTests(unittest.TestCase):
    def asset(self, currency):
        return {'info': {'currency': currency}, 'history': [{'close': 100, 'adjusted': 90}]}

    def fx(self, symbol):
        self.symbol = symbol
        return pd.DataFrame({'Close': [1.25]}, index=pd.to_datetime(['2026-10-09']))

    def test_usd_does_not_fetch_fx(self):
        asset = self.asset('USD')
        self.assertIs(normalize_currency(asset, lambda _: self.fail('unexpected FX request')), asset)

    def test_pence_convert_to_dollar_share_price(self):
        asset = normalize_currency(self.asset('GBp'), self.fx)
        self.assertEqual(self.symbol, 'GBPUSD=X')
        self.assertEqual(asset['history'][0]['close'], 1.25)
        self.assertEqual(asset['fx']['localClose'], 100)
        self.assertEqual(asset['fx']['date'], '2026-10-09')

    def test_currency_conversion_preserves_technical_ratio(self):
        asset = normalize_currency(self.asset('EUR'), self.fx)
        self.assertEqual(asset['history'][0]['adjusted'] / asset['history'][0]['close'], .9)
        self.assertEqual(asset['info']['currency'], 'USD')

    def test_missing_or_invalid_exchange_rate_rejects(self):
        with self.assertRaises(ValueError):
            normalize_currency(self.asset('EUR'), lambda _: pd.DataFrame())
        with self.assertRaises(ValueError):
            normalize_currency(self.asset('unknown'), self.fx)

if __name__ == '__main__':
    unittest.main()
