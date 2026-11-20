---
name: uscis-gov-fill-i539-application-form-b6dv4f
title: Fill USCIS Form I-539 PDF
description: >-
  Programmatically fill the USCIS I-539 (Application to Extend/Change
  Nonimmigrant Status) fillable PDF by AcroForm field name and save a completed
  copy. Read-only re the site; does not submit. Browser page.fill() does NOT
  work on this PDF.
website: uscis.gov
category: government-forms
tags:
  - uscis
  - immigration
  - pdf-form
  - acroform
  - i-539
  - form-filling
source: 'browserbase: agent-runtime 2026-08-01'
updated: '2026-08-01'
recommended_method: hybrid
alternative_methods:
  - method: cli
    rationale: >-
      The fill itself is a local Node step: load the PDF bytes into PDF.js and
      write values via annotationStorage.setValue(id,{value}) then
      saveDocument(). No site interaction beyond fetching the blank form.
  - method: fetch
    rationale: >-
      The blank PDF is a static asset retrievable with the Browserbase Fetch API
      (200 application/pdf). Note the CLI returns base64 that must be decoded to
      bytes.
  - method: browser
    rationale: >-
      CONFIRMED NOT VIABLE. Chrome renders the PDF in the PDFium plugin, not the
      DOM. browse snapshot returns an empty a11y tree (about:blank, 0 form
      nodes), the viewport is solid black in headless mode, and
      page.fill()/evaluate() have no selectors to target. Verified across a
      driven browse session and a 6-turn autobrowse run.
verified: false
proxies: false
---
# Fill USCIS Form I-539 PDF

## Purpose

Fill the USCIS **Form I-539, Application to Extend/Change Nonimmigrant Status** — a
660 KB, 7-page fillable PDF — with applicant data and save a completed copy. The
recommended path fetches the blank PDF and writes AcroForm field values
**programmatically with a PDF library**, because the form does **not** render as
DOM in a browser and therefore cannot be filled with `page.fill()` / `evaluate()`.
This skill produces a filled PDF file; it does **not** submit anything to USCIS
(there is no online submission surface for this form).

## When to Use

- An agent needs to pre-populate an I-539 with a client's biographic, address,
  status, and signature data before a human reviews/prints it.
- Batch-generating I-539 drafts from a structured applicant record.
- Any flow where you were told to "fill the I-539 PDF with Browserbase page.fill()"
  — read the Gotchas first: that approach cannot work and this skill is the
  correct replacement.

## Workflow

The blank form lives at
`https://www.uscis.gov/sites/default/files/document/forms/i-539.pdf`
(HTTP 200, `application/pdf`, PDF 1.7, **encrypted, hybrid AcroForm+XFA**, 176 form
fields). The reliable method is: **fetch the bytes → load in PDF.js → set values
via `annotationStorage` keyed by each field's annotation id → `saveDocument()`.**

### 1. Fetch the blank PDF bytes

The Browserbase Fetch API returns the PDF **base64-encoded**, so decode it:

```bash
browse cloud fetch \
  "https://www.uscis.gov/sites/default/files/document/forms/i-539.pdf" \
  --allow-redirects --output i-539.b64
node -e "const fs=require('fs');fs.writeFileSync('i-539.pdf',Buffer.from(fs.readFileSync('i-539.b64','utf8').trim(),'base64'))"
# Verify header is %PDF and size ~495 KB decoded
```

A residential proxy / `--verified` stealth is **not** required — uscis.gov serves
the static asset with no anti-bot (probe: none detected).

### 2. Enumerate fields and build a name → annotation-id map

`pdf-lib` **cannot open this file** (it is encrypted and uses compressed object
streams — `PDFDocument.load` throws `EncryptedPDFError`, and even with
`ignoreEncryption:true` the object streams fail to parse). Use **Mozilla PDF.js**
(`pdfjs-dist`), which decrypts with an empty password and reads the AcroForm:

```js
const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
const doc = await pdfjs.getDocument({ data, password: '' }).promise;
const fo  = await doc.getFieldObjects();   // { fieldName: [ { id, type, exportValues, page } ] }
```

`annotationStorage.setValue()` is keyed by the widget **annotation id** (e.g.
`"183R"`), not the field name — resolve it from `fo[name][0].id`.

### 3. Set values (text, combobox, checkbox)

```js
const idByName = {};
for (const [name, arr] of Object.entries(fo)) idByName[name] = arr[0].id;
const set = (name, value) => doc.annotationStorage.setValue(idByName[name], { value });

// text + numeric fields (numeric fields are TEXT — always pass strings)
set('form1[0].#subform[0].P1Line1a_FamilyName[0]', 'DOE');
set('form1[0].#subform[0].Pt1Line2_AlienNumber[0]', '123456789'); // A-Number, digits only
set('form1[0].#subform[1].P1_Line8_DateOfBirth[0]', '01/15/1990'); // dates MM/DD/YYYY
// combobox: pass the option's export value
set('form1[0].#subform[0].Part2_Item11_State[0]', 'TX');           // 2-letter state code
set('form1[0].#subform[1].Pt2Line2a_NewStatus[0]', 'B-2');         // requested status code
// checkbox: pass boolean true (the stored export value is written automatically)
set('form1[0].#subform[0].Part1_Item4_Unit[0]', true);             // -> "APT"
set('form1[0].#subform[1].P3_checkbox2a[1]', true);                // Extension "Yes" -> "Y"
```

### 4. Field-name map (verified; the core value of this skill)

All names are prefixed `form1[0].#subform[N].` (N = the subform index shown). The
internal `P#`/`Pt#`/`Part#` prefixes do **not** line up with the printed Part
numbers — **always resolve names from `getFieldObjects()`, never assume `Part N =
subform N`.** Key fields:

| Task field | Field name (suffix after `form1[0].`) | Type |
|---|---|---|
| Last / First / Middle name | `#subform[0].P1Line1a_FamilyName[0]`, `P1_Line1b_GivenName[0]`, `P1_Line1c_MiddleName[0]` | text |
| A-Number | `#subform[0].Pt1Line2_AlienNumber[0]` | text (digits) |
| USCIS Online Account # | `#subform[0].Pt1Line2_USCISOnlineAcctNumber[0]` | text |
| Mailing addr (Item 3) street/unit#/city/zip | `#subform[0].Part2_Item11_StreetName[0]`, `Part1_Item4_Number[0]`, `Part2_Item11_City[0]`, `Part2_Item11_ZipCode[0]` | text |
| Mailing addr state | `#subform[0].Part2_Item11_State[0]` | combobox (2-letter) |
| Mailing addr unit type | `#subform[0].Part1_Item4_Unit[0..2]` → `"APT"/"STE"/"FLR"` | checkbox |
| Physical addr (Item 6) | `#subform[0].Part1_Item6_StreetName[0]`, `Part1_Item6_Number[0]`, `Part1_Item6_City[0]`, `Part1_Item6_State[0]`(combo), `Part1_Item6_ZipCode[0]`, `Part1_Item6_Unit[0..2]` | text/combo/check |
| Country of Birth / Citizenship | `#subform[1].P1_Line6_CountryOfBirth[0]`, `P1_Line7_CountryOfCitizenship[0]` | text |
| Date of Birth | `#subform[1].P1_Line8_DateOfBirth[0]` | text (MM/DD/YYYY) |
| SSN | `#subform[1].P1_Line9_SSN[0]` | text (digits) |
| Last arrival date | `#subform[1].SupA_Line1i_DateOfArrival[0]` | text |
| I-94 # | `#subform[1].SupA_Line1j_ArrivalDeparture[0]` | text |
| Passport # / Travel Doc # | `#subform[1].SupA_Line1k_Passport[0]`, `SupA_Line1l_TravelDoc[0]` | text |
| Passport issuing country / expiry | `#subform[1].SupA_Line1m_CountryOfIssuance[0]`, `SupA_Line1n_ExpDate[0]` | text |
| Current status / expiry | `#subform[1].Pt1Line15a_NewStatus[0]`(combo), `SupA_Line1p_DateExpires[0]` | combo/text |
| D/S ("duration of status") box | `#subform[1].P1_Checkbox12c[0]` → `"Y"` | checkbox |
| Part 2 requested status | `#subform[1].Pt2Line2a_NewStatus[0]` | combobox |
| Part 2 effective date | `#subform[1].Pt2Line2b_EffectiveDate[0]` | text |
| Part 2 applicant-count group | `#subform[1].P2_checkbox[2]`=`"A"` (I am the only applicant), `[0]`=`"B"`, `[1]`=`"C"` (family group) | checkbox |
| Part 2 total number | `#subform[1].P2_Line5b_TotalNumber[0]` | text |
| Part 3 requested end date | `#subform[1].P3_Line1a_DateExtended[0]` | text |
| Part 3 spouse/parent-status Y/N | `#subform[1].P3_checkbox2a[1]`=`"Y"` / `[0]`=`"N"` | checkbox |
| Part 3 pending-petition petitioner / date / receipt | `#subform[2].P3_Line4_NameofPetitioner[0]`, `P3_Line5_DateFiled[0]`, `P3_Line5_ReceiptNumber[0]` | text |
| Applicant signature / date | `#subform[4].P6_Line7_SignatureApplicant[0]`, `P6_Line7_DateofSignature[0]` | text |
| Applicant phone(s) / email | `#subform[4].P5_Line3_DaytimePhoneNumber[0]`, `P5_Line4_MobilePhoneNumber[0]`, `P5_Line5_EmailAddress[0]` | text |
| Interpreter (family/given/org/lang) | `#subform[4].P6_Line*` and `P7_Line6_Language[0]` | text |
| Preparer (family/given/business/phone/sig/date) | `#subform[5].P7_Line1a_PreparerFamilyName[0]`, `P7_Line1b_PreparerGivenName[0]`, `P7_Line2_BusinessName[0]`, `P7_Line4_PreparerDaytimePhoneNumber[0]`, `P7_Line8a_SignatureofPreparer[0]`, `P7_Line8b_DateofSignature[0]` | text |
| Additional-info supplement (page 7) | `#subform[6].P8_Line*` + repeated name/A-Number | text |

There is no "read English" checkbox in this revision — the applicant statement is
selected via `#subform[3].P4_checkbox6_Yes[0]` / `..._No[0]` style radio pairs
(each has export value `"Y"`; set the intended one to `true`).

### 5. Validate mandatory fields, then save

Before saving, confirm required fields are non-empty by re-reading
`getFieldObjects()` values (Family Name, A-Number or DOB, Part 2 type + status,
signature + date). Then:

```js
const outBytes = await doc.saveDocument();   // returns Uint8Array
fs.writeFileSync('i-539-filled.pdf', outBytes);
```

Re-open the saved file with `getFieldObjects()` and assert each value round-trips
(this skill verified DOE/JANE/TX/B-2/APT/01-15-1990 etc. all persist).

### Browser fallback

**There is no working browser fallback for filling this PDF.** For completeness,
if you only need to *view* it, `browse open <pdf-url> --remote` loads it, but the
form is not fillable through the DOM (see Gotchas). Do not spend turns trying
selectors — enumerate `browse snapshot`, observe zero form refs, and switch to the
PDF.js path above.

## Site-Specific Gotchas

- **`page.fill()` / `evaluate()` cannot fill this PDF — confirmed dead end.** Chrome
  renders it in the PDFium plugin, not the DOM. A driven session showed
  `browse snapshot` returning only `RootWebArea > scrollable, html` with `urlMap:
  about:blank` and **0** textbox/checkbox/combobox nodes; the CDP trace shows one
  `200 application/pdf` response handed straight to the plugin. An independent
  6-turn autobrowse run reached the same conclusion.
- **Headless viewport is solid black.** After `browse open` + 15 s wait + scroll the
  screenshot is entirely black — headless PDFium does not paint this XFA form, so
  even a "screenshot then OCR" approach fails. To rasterize the filled result,
  render with PDF.js (`getPage().render`) or a real desktop PDF viewer, not
  headless Chrome.
- **The PDF is encrypted.** `pdf-lib` throws `EncryptedPDFError`; with
  `ignoreEncryption:true` its parser then fails on the compressed object streams
  (`Invalid object ref`, `Expected instance of PDFDict`). Use **PDF.js with
  `password: ''`**, or pre-decrypt with `qpdf --decrypt in.pdf out.pdf` and then
  `pdf-lib` will open the decrypted copy.
- **Hybrid AcroForm + XFA.** `getMetadata()` reports `IsXFAPresent:true` and
  `IsAcroFormPresent:true`. `saveDocument()` prints benign
  `Warning: Node not found for path: ...` for a handful of XFA-only / barcode nodes
  (e.g. the page-6 supplement fields, `PDF417BarCode1`, `P1_Checkbox12c`) — the
  **AcroForm values are still written and round-trip correctly**. Standard viewers
  (Chrome, macOS Preview, Acrobat) read the AcroForm layer, so the fill shows up.
- **`annotationStorage.setValue` is keyed by annotation id, not field name.** Map
  `name → getFieldObjects()[name][0].id` first. Passing the field name as the key
  silently no-ops.
- **Numeric fields are text fields.** A-Number, USCIS Online Account #, SSN, I-94 #,
  ZIP, phone — all `text` type. Pass **strings**; never numbers (a JS number can
  drop leading zeros and throws in some libs).
- **Dates are free-text `MM/DD/YYYY`.** No date picker/validation in the field;
  supply the formatted string exactly.
- **Checkboxes carry meaningful export values, not "On".** `Part1_Item4_Unit` →
  `APT/STE/FLR`; Yes/No pairs → `Y/N`; Part 2 applicant-count `P2_checkbox` →
  `A/B/C`. In PDF.js set the widget to boolean `true`; in `pdf-lib` call
  `field.check()`. Only one member of each radio-style group should be set.
- **Two confusingly-named status comboboxes.** `Pt1Line15a_NewStatus[0]` is the
  applicant's **current** status (Part 1); `Pt2Line2a_NewStatus[0]` is the
  **requested/target** status (Part 2). Both contain "NewStatus" — do not swap them.
- **Internal part prefixes are offset from printed Parts.** The applicant signature
  is `P6_Line7_*`, preparer is `P7_*`, the biographic questions are `P4_*` on
  `#subform[3]`. Resolve everything by enumerating fields; never assume `Part N`
  equals subform `N` or prefix `P N`.
- **The Browserbase Fetch API returns base64.** `browse cloud fetch --output` writes
  a base64 string (starts `JVBERi0x` = "%PDF-1"), not raw bytes — decode before
  loading (a raw-bytes load will report the file as ~660 KB vs the true ~495 KB).
- **Form revision drift.** USCIS periodically reissues the I-539 with a new edition
  date and can rename/re-index fields. Re-run the enumeration step against the
  freshly fetched file each run rather than hardcoding ids across editions.

## Expected Output

```json
{
  "success": true,
  "method": "pdfjs-annotationStorage",
  "source_pdf": "https://www.uscis.gov/sites/default/files/document/forms/i-539.pdf",
  "output_pdf": "i-539-filled.pdf",
  "fields_set": 27,
  "fields_verified_roundtrip": 27,
  "missing_fields": [],
  "save_warnings": ["Node not found for path: form1[0].#subform[6].P8_Line4_A_PageNumber[0]"],
  "notes": "AcroForm values persisted and re-read correctly; XFA 'Node not found' warnings are benign."
}
```

Browser-attempt outcome shape (why the naive path is rejected):

```json
{
  "success": false,
  "method": "browser-page-fill",
  "form_fields_visible_in_dom": 0,
  "error_reasoning": "Chrome renders the I-539 in the PDFium plugin. browse snapshot returned RootWebArea + scrollable html only (urlMap about:blank), zero form refs; viewport is solid black. page.fill()/evaluate() have no DOM targets. Use the PDF.js annotationStorage method instead."
}
```
