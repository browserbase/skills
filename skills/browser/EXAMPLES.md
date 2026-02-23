# Browser Automation Examples

Common browser automation workflows using the CLI tool. Each example demonstrates a distinct pattern.

## Example 1: Extract Structured Data

**User request**: "Go to example.com/product/123 and extract the product details"

```bash
browse navigate https://example.com/product/123
browse extract "Extract the product information" '{"productName": "string", "price": "number", "currency": "string", "inStock": "boolean", "rating": "number"}'
browse close
```

## Example 2: Fill and Submit a Form

**User request**: "Fill out the contact form on example.com with my information"

```bash
browse navigate https://example.com/contact
browse act "Fill in the name field with 'John Doe'"
browse act "Fill in the email field with 'john.doe@example.com'"
browse act "Fill in the message field with 'I would like to inquire about your services'"
browse act "Click the Submit button"
browse screenshot
browse close
```

## Example 3: Debug a Page Issue

**User request**: "Check why the submit button isn't working on example.com/form"

This example shows how to combine `observe` and `screenshot` for page inspection.

```bash
browse navigate https://example.com/form
browse screenshot
browse observe "Find all buttons and their states"
browse observe "Find all form input fields and their required status"
browse act "Fill in all required fields with test data"
browse screenshot
browse observe "Check if the submit button is now enabled"
browse close
```

Analyze the screenshots and observations to determine the issue.

## Example 4: Multi-Page Data Collection

**User request**: "Extract product information from the first 3 pages of results on example.com/products"

```bash
browse navigate https://example.com/products
browse extract "Extract all products on this page" '{"name": "string", "price": "number", "imageUrl": "string"}'
browse act "Click the Next Page button"
browse extract "Extract all products on this page" '{"name": "string", "price": "number", "imageUrl": "string"}'
browse act "Click the Next Page button"
browse extract "Extract all products on this page" '{"name": "string", "price": "number", "imageUrl": "string"}'
browse close
```

Combine and process all extracted data.

## Tips for Success

- **Be specific with natural language**: "Click the blue Submit button in the footer" is better than "click submit". This is **extremely important** because there's much ambiguity in many websites.
- **Wait when needed**: After navigation or actions that trigger page changes, explicitly wait
- **Use observe for discovery**: When unsure what elements exist, use observe first
- **Take screenshots for debugging**: Visual confirmation helps understand what the browser sees
- **Handle errors gracefully**: If an action fails, try breaking it into smaller steps
- **Clean up resources**: Always close the browser when done to free up system resources
