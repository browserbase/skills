# Task: Complete the Acme Store checkout

Complete the multi-step checkout flow on the local fixture store and return the confirmation code.

## URL

http://localhost:4173/checkout/

## Inputs

- Full name: Ada Lovelace
- Email: ada@example.com
- Street address: 123 Bridge St
- City: San Francisco
- ZIP code: 94107
- Shipping speed: Express

## Steps

1. Navigate to the URL
2. Fill in the contact step (name, email) and continue
3. Fill in the shipping step (address, city, ZIP), select **Express** shipping, and continue
4. On the review step, confirm the order details and place the order
5. Extract the confirmation code and the total charged from the confirmation screen

## Output

Return a JSON object:

```json
{
  "success": true,
  "confirmation_code": "BB-12345",
  "total_usd": 47.48,
  "shipping": "express",
  "error_reasoning": null
}
```

- If task succeeds: `success: true`, populate all fields exactly as displayed
- If task fails: `success: false`, populate `error_reasoning` with what blocked you
