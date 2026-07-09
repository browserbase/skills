# Task: Get the StockX resale price for the Jordan 1 "Chicago Lost and Found"

Look up the Air Jordan 1 Retro High OG "Chicago Lost and Found" on StockX and return its current market data. Read-only — never place a bid or buy. Based on the browse.sh `stockx.com/get-resale-price` skill definition.

## URL

https://stockx.com

## Inputs

- Product: Air Jordan 1 Retro High OG "Chicago Lost and Found" (style DZ5485-612)

## Steps

1. Navigate to StockX (bot-protected — use remote/stealth browsing)
2. Search for the product and open its product page
3. Extract: full product name, lowest ask or last sale price (USD), and the style code if shown

## Output

Return a JSON object:

```json
{
  "success": true,
  "product": "...",
  "style_code": "DZ5485-612",
  "last_sale_usd": 0,
  "lowest_ask_usd": 0,
  "error_reasoning": null
}
```

- At least one of `last_sale_usd` / `lowest_ask_usd` must be populated
- If task fails: `success: false`, populate `error_reasoning`
