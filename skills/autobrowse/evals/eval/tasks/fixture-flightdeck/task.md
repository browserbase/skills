# Task: Find the cheapest nonstop SFO → JFK flight on FlightDeck

Search the local FlightDeck fixture for flights from SFO to JFK and return the cheapest NONSTOP option.

## URL

http://localhost:4173/flightdeck/

## Inputs

- From: SFO
- To: JFK
- Constraint: nonstop flights only

## Steps

1. Navigate to the URL
2. Select SFO as origin and JFK as destination
3. Restrict results to nonstop flights (the "Nonstop only" checkbox, or filter the results yourself)
4. Search and wait for results to load
5. Identify the cheapest nonstop flight (note: results are NOT sorted by price by default)

## Output

Return a JSON object:

```json
{
  "success": true,
  "airline": "...",
  "flight_number": "XX 123",
  "price_usd": 0,
  "depart_time": "HH:MM",
  "nonstop": true,
  "error_reasoning": null
}
```

- If task succeeds: `success: true`, populate fields exactly as displayed
- If task fails: `success: false`, populate `error_reasoning`
