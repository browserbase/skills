# Task: Find cheapest nonstop SFO → JFK on Google Flights

Search Google Flights for one-way nonstop flights from SFO to JFK on 2026-08-12 and return the cheapest options. Based on the browse.sh `google.com/search-flights` skill definition.

## URL

https://www.google.com/travel/flights

## Inputs

- From: SFO (San Francisco)
- To: JFK (New York)
- Date: 2026-08-12 (one-way)
- Passengers: 1 adult, economy
- Stops filter: nonstop only

## Steps

1. Navigate to Google Flights
2. Set up the one-way search SFO → JFK on 2026-08-12
3. Apply the "Nonstop only" stops filter
4. Wait for results, then extract the top nonstop options sorted by price

## Output

Return a JSON object:

```json
{
  "success": true,
  "date": "2026-08-12",
  "flights": [
    { "airline": "...", "depart_time": "HH:MM", "arrive_time": "HH:MM", "price_usd": 0, "nonstop": true }
  ],
  "cheapest_price_usd": 0,
  "error_reasoning": null
}
```

- Include at least the 3 cheapest nonstop options (fewer only if fewer exist)
- If task fails: `success: false`, populate `error_reasoning`
