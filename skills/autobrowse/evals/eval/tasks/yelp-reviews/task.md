# Task: Extract Yelp reviews for Tartine Bakery (San Francisco)

Extract Tartine Bakery's rating, review count, and its 5 most recent reviews from Yelp. Read-only. Based on the browse.sh `yelp.com/extract-reviews` skill definition (simplified filter surface: sort = newest, limit = 5).

## URL

https://www.yelp.com/biz/tartine-bakery-san-francisco

## Inputs

- Business: Tartine Bakery, San Francisco
- Sort: newest
- Limit: 5 reviews

## Steps

1. Navigate to the business page (DataDome bot protection — use remote/stealth browsing)
2. Extract the overall rating and total review count
3. Sort reviews by newest and extract the top 5: reviewer name, rating, date, full text

## Output

Return a JSON object:

```json
{
  "success": true,
  "name": "Tartine Bakery",
  "rating": 4.0,
  "review_count": 0,
  "reviews": [
    { "reviewer": "...", "rating": 5, "date": "YYYY-MM-DD", "text": "..." }
  ],
  "error_reasoning": null
}
```

- If task fails: `success: false`, populate `error_reasoning`
