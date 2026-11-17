# Task: Look up US Patent 11,000,000

Search the USPTO patent database (or USPTO Patent Public Search at ppubs.uspto.gov) for US patent number 11,000,000 and extract its bibliographic details. Based on the browse.sh `uspto.gov/search-patents` skill definition.

## URL

https://ppubs.uspto.gov/pubwebapp/

## Inputs

- Patent number: 11000000

## Steps

1. Navigate to USPTO Patent Public Search (or another official USPTO search surface)
2. Search for patent number 11000000
3. Open the patent record and extract: title, inventors, assignee, grant date

## Output

Return a JSON object:

```json
{
  "success": true,
  "patent_number": "11000000",
  "title": "...",
  "inventors": ["..."],
  "assignee": "...",
  "grant_date": "YYYY-MM-DD",
  "error_reasoning": null
}
```

- If task fails: `success: false`, populate `error_reasoning`
