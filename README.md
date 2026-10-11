# Stock Compass

Hebrew RTL stock & ETF research and portfolio action planner, built for GitHub Pages.

## Features

- USD ticker analysis from daily market snapshots: split/dividend-adjusted 3/5/10-year log regression channels, MA50/MA200, 52-week distance, Wilder RSI, six-month momentum and volume.
- Transparent technical score and conditional buy/wait decisions with exact dollar budgets, approximate units, timing and recheck triggers.
- Fund fees, PE and top holdings only when actually provided by the source; missing fundamentals are explicitly shown.
- Portfolio editor with current values, cost basis, user-defined allocation targets, new cash, tax estimate, horizon and drawdown tolerance.
- External pension/training-fund holdings count toward allocation and stay locked from sales.
- New-money-only or sale-funded rebalance mode. No fabricated exact ETF overlap.
- Browser-local persistence, portfolio JSON import/export, price-history CSV import and print/PDF output.
- Open ticker lookup via the read-only `/api/market?symbol=...` service. Yahoo-supported stocks, ETFs and funds require at least 210 valid daily observations. Non-USD quotes use a dated FX conversion for USD budgets and share estimates; technical signals remain in the native currency. Stale FX blocks execution.
- 60 initial USD securities in `universe.json`. Add any supported USD symbol there for recurring refreshes, or supply extra symbols in workflow dispatch for one deployment. The initial universe is a daily cache and shortcut list, not a restriction. Other symbols load on demand; exchange suffixes such as `.TA`, `.L` or `.DE` may be required. CSV import remains available.

## Publish on GitHub Pages

Create a **public** GitHub repository named `stock-compass` (public source contains no personal holdings).

With GitHub CLI installed and authenticated:

```bash
git init -b main
git add .
git commit -m "Build Stock Compass ETF and portfolio planner"
gh repo create stock-compass --public --source=. --remote=origin --push
gh api --method POST repos/{owner}/stock-compass/pages -f build_type=workflow
gh workflow run pages.yml
```

Alternatively upload this repository, then Settings → Pages → Source → **GitHub Actions** and run **Refresh market data and deploy Pages**.

The workflow runs after pushes, on demand, and at 23:25 UTC Monday–Friday. GitHub schedules may be delayed or disabled after inactivity. It downloads market data before deployment; the repository's initial `market.json` is deliberately empty. A run with no real data fails rather than publishing invented prices. No API key is required. Yahoo may throttle requests; refresh errors retain previous data only if it exists locally, preserving price dates. Because the workflow does not commit snapshots, a fresh hosted run cannot reuse prior deployment data; failure leaves the previous Pages deployment intact.

## On-demand service

`api/market.py` is a Vercel Python function using the same yfinance fetcher. Set `web/data/service.json` to `{ "marketEndpoint": "https://YOUR-PROJECT.vercel.app/api/market" }`. This endpoint accepts one symbol, never a URL or a portfolio body. Successful responses are cached for an hour on the CDN; no portfolio database exists. GitHub Pages serves the frontend while Vercel serves ticker data. Source failures are shown explicitly; an existing snapshot retains its original date and stale execution stays blocked.

## Local use and checks

```bash
npm test
npm run check
python -m pip install -r requirements.txt
python scripts/update_market.py
python -m http.server 8000 --directory web
```

Open `http://localhost:8000`. Serve via HTTP: opening `index.html` with `file://` does not support the module/data fetches.

History CSV: `date,close,adjusted,volume`, sorted ascending, at least 210 valid trading days, USD. `adjusted` must reflect corporate actions. Portfolio values are USD; convert external ILS amounts yourself.

## Methodology and limits

This implements the visible ETF & Stock Analyzer framework, with an explicit action summary. It is a deterministic research tool, **not a language-model agent** or personal investment adviser. The score is technical only: it is not a probability, expected return or backtested performance guarantee. Fundamental metadata does not silently change that score. Full valuation analysis, news, exact full-holdings overlap, geographic breakdown and 50-ETF ranking require additional data/research and are not claimed here.

Channels require approximately 85% of expected trading sessions plus coverage of the start date. Log-price regression has bands ±2 residual standard deviations, not support/resistance guarantees. Adjusted prices drive indicators; latest raw close drives approximate share quantities. Data older than 5 calendar days or future-dated is barred from execution suggestions. A buying signal is not a selling signal; sales in the portfolio are driven by user-defined allocation targets, with a 1%-of-total deviation tolerance.

Targets must sum to 100%, including locked external assets. Eligible buy deficits share available cash proportionally. Unallocated funds stay in cash. Sales reserve a simple user-input tax estimate using proportional cost basis. Actual taxes, lot selection, transaction costs and FX must be verified with the broker. Short horizons or low drawdown tolerance block automatic portfolio transaction plans. All recommendations are conditional on the input data and targets.

Your actual holdings are stored **only in this browser's localStorage**. They are not committed, sent to GitHub or collected by the app. On-demand lookups send only the requested tradable ticker to the Vercel market service and Yahoo; holdings values, cost bases, targets and external account details remain in the browser. Provider/host connection logs may include the requested ticker. Shared devices can access localStorage. The optional Google Fonts request sends normal connection metadata, not portfolio holdings. There are no analytics scripts and no brokerage connection. JSON exports may contain financial information; keep them private.

Sources: [yfinance documentation](https://ranaroussi.github.io/yfinance/) and [GitHub Pages documentation](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages). Yahoo Finance data access is unofficial; verify data and comply with applicable source terms, especially before commercial use.
