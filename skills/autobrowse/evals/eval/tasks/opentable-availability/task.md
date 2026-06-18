# Task: Check OpenTable availability at Arquet (San Francisco)

Check OpenTable for available reservation time slots at Arquet in San Francisco for a party of 2 on 2026-08-15 around dinner time. Read-only — do not book. Based on the browse.sh `opentable.com/check-availability` skill definition.

## URL

https://www.opentable.com/r/arquet-san-francisco

## Inputs

- Restaurant: Arquet, San Francisco
- Date: 2026-08-15 (a Saturday)
- Party size: 2
- Time window: dinner (17:00–21:30)

## Steps

1. Navigate to the restaurant's OpenTable page (the URL accepts query params for date/party size; using them is fine)
2. Set the date to 2026-08-15 and party size to 2
3. Read the reservation widget's available time slots in the dinner window
4. Do NOT click any slot or book anything

## Output

Return a JSON object:

```json
{
  "success": true,
  "restaurant": "Arquet",
  "date": "2026-08-15",
  "party_size": 2,
  "has_availability": true,
  "slots": ["18:00", "18:15"],
  "error_reasoning": null
}
```

- `has_availability: false` with an empty `slots` array is a VALID successful result (the restaurant may simply be booked)
- Times in 24h HH:MM format
- If task fails (couldn't load the widget at all): `success: false` with `error_reasoning`
