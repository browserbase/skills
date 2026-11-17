# Task: Extract Travel-category book stats from Books to Scrape

List every book in the "Travel" category of books.toscrape.com and report the count plus the cheapest and most expensive books.

## URL

https://books.toscrape.com/catalogue/category/books/travel_2/index.html

## Inputs

- Category: Travel

## Steps

1. Navigate to the URL
2. Extract every book in the category with its full title and price (watch for pagination — include all pages if any)
3. Compute the count, the cheapest book, and the most expensive book

## Output

Return a JSON object:

```json
{
  "success": true,
  "count": 0,
  "cheapest": { "title": "...", "price_gbp": 0.0 },
  "most_expensive": { "title": "...", "price_gbp": 0.0 },
  "error_reasoning": null
}
```

- Prices are in GBP (the £ amounts shown on the site); report them as numbers
- Use the book's full title (the listing truncates some titles — the full title is in the link's title attribute or on the detail page)
- If task fails: `success: false`, populate `error_reasoning`
