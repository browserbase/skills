---
name: reducto-ai-extract-document-data
title: "Reducto Document Data Extractor"
description: "Use Reducto's hosted MCP server to parse documents, extract schema-backed fields with citations, split packets, classify document types, and fetch job results from public URLs or Reducto-hosted files."
website: "reducto.ai"
category: "document-intelligence"
tags: ["reducto", "mcp", "documents", "pdf", "ocr", "extraction", "classification", "hosted-mcp", "api"]
status: "draft"
partner: true
source: "first-party-customer-skill-spike"
updated: "2026-05-12"
recommended_method: "mcp"
---

# Reducto Document Data Extractor

## Purpose

Use Reducto's hosted MCP server to turn messy documents into agent-ready structured data: parse PDFs, extract fields with citations, split large packets into constituent documents, classify document types, edit supported documents, and retrieve complete job results.

This skill intentionally uses Reducto's hosted MCP server so agents can get started without Python, `uv`, or a local install.

## When to Use

Use this skill when the user asks to:

- Pull structured fields from invoices, contracts, insurance claims, financial filings, medical records, mortgage packets, or forms.
- Parse a PDF into text, tables, figures, bounding boxes, and layout-aware blocks.
- Split a multi-document packet into named sections.
- Classify scanned documents by type.
- Chain document operations through Reducto job IDs.
- Inspect or retrieve a previous Reducto job result.

## Hosted MCP Setup

Use the hosted server at `https://mcp.reducto.ai/mcp` with a Reducto API key in the `Authorization` header.

```json
{
  "mcpServers": {
    "reducto": {
      "type": "http",
      "url": "https://mcp.reducto.ai/mcp",
      "headers": {
        "Authorization": "Bearer $REDUCTO_API_KEY"
      }
    }
  }
}
```

Get API keys from `https://studio.reducto.ai/api-keys`.

Important hosted-server constraint: the hosted server runs in Reducto's cloud and cannot read the user's local filesystem. For `upload_file`, pass a public `https://` URL. For local files, either pre-upload through the Reducto API and pass the returned `reducto://` URL, or switch to the local MCP server.

## Input URL Rules

Reducto document tool parameters accept these URL schemes:

- `https://` or `http://`: public document URL Reducto can fetch.
- `reducto://`: temporary Reducto file reference returned by upload/pre-upload.
- `jobid://`: reference to a previous processing job, useful for chaining parse into extract, split, classify, or get-job calls.

Do not pass raw local paths, `file://`, or private URLs to the hosted server. If the document is private, ask the user for a public signed URL or use a local/server-side pre-upload path.

## Workflow

### 1. Clarify the document task

Pick the narrowest operation that satisfies the user:

| User intent | Reducto tool |
|---|---|
| "Read this PDF" / "OCR this packet" | `parse_document` |
| "Pull these fields into JSON" | `extract_data` |
| "Split this packet by document type" | `split_document` |
| "Tell me what kind of document this is" | `classify_document` |
| "Fill or modify this form/document" | `edit_document` |
| "Fetch the full result" / "This result is truncated" | `get_job` |
| "Show recent processing jobs" | `list_jobs` |
| "What params should I use?" | `get_documentation` |

Prefer `get_documentation` before using an unfamiliar endpoint, option, schema, or result field.

### 2. Validate access to the document

Before starting a job, confirm:

- The document URL is public, signed, or Reducto-hosted.
- The document contains no data the user is not allowed to process through Reducto.
- The user understands Reducto usage may consume pages/credits.
- For private documents, the signed URL expiration is long enough for processing.

### 3. Parse once, chain by job ID

For multi-step workflows, parse once and reuse `jobid://<job_id>`.

```text
parse_document("https://example.com/contract.pdf") -> job_id="abc123"
extract_data("jobid://abc123", schema={...})
split_document("jobid://abc123", ...)
get_job(job_id="abc123")
```

This avoids re-uploading or reparsing the same document.

### 4. Extract with explicit schemas

For structured extraction, ask for or draft a schema with clear field names, types, and descriptions. Include citation requirements when the user needs auditability.

For invoices, a good starting schema is:

```json
{
  "vendor_name": "string",
  "invoice_number": "string",
  "invoice_date": "string",
  "due_date": "string",
  "currency": "string",
  "subtotal": "number",
  "tax": "number",
  "total": "number",
  "line_items": [
    {
      "description": "string",
      "quantity": "number",
      "unit_price": "number",
      "amount": "number"
    }
  ]
}
```

For contracts, collect the user's target fields first, such as parties, effective date, term, renewal, termination rights, payment terms, governing law, and unusual obligations.

### 5. Handle large, async, or truncated results

Reducto results can include:

- `job_id`: save this for follow-up calls.
- `studio_link`: use this for visual inspection/debugging.
- `usage`: pages and credits consumed.
- `next_steps`: Reducto's suggested next operation.
- `result_type: "url"`: call `get_job(job_id=...)` before reading the result.
- `truncated: true`: call `get_job(job_id=...)` or rerun with a narrower `page_range`.

Do not summarize a truncated or URL-backed result as complete until `get_job` has retrieved the full materialized result.

## Safety

- Never put `REDUCTO_API_KEY` in committed files, prompts, logs, or screenshots.
- Do not send local private files to the hosted server unless the user explicitly authorizes a public/signed upload path.
- Do not claim extracted values are authoritative unless the output includes citations or the user accepts best-effort extraction.
- Preserve document provenance: return source URL, job ID, Studio link, page ranges, and citations when available.
- If the user asks for medical, legal, financial, or compliance conclusions, return extracted evidence and suggest human review rather than making final determinations.

## Demo Prompt

> Use Reducto's hosted MCP server to extract vendor, invoice number, date, total, and line items from this public invoice PDF. Return JSON with citations and the Reducto Studio link. If the result is URL-backed or truncated, call `get_job` before answering.

## Expected Output

```json
{
  "success": true,
  "source_url": "https://example.com/invoice.pdf",
  "job_id": "abc123",
  "studio_link": "https://studio.reducto.ai/jobs/abc123",
  "usage": {
    "num_pages": 3,
    "credits": 3
  },
  "extracted_data": {
    "vendor_name": "Example Vendor",
    "invoice_number": "INV-1001",
    "total": 1234.56,
    "line_items": []
  },
  "citations": [],
  "next_steps": "Use jobid://abc123 for follow-up extraction, split, classify, or get_job."
}
```
