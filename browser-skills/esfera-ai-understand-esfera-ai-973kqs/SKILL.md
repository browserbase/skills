---
name: esfera-ai-understand-esfera-ai-973kqs
title: Understand Esfera AI (Construction ERP)
description: >-
  Navigate esfera.ai and docs.esfera.ai to understand Esfera AI, a
  Latin-American construction ERP with native AI; extract positioning, modules,
  onboarding flows, documentation links, and contact/demo paths for commercial
  or implementation briefings.
website: esfera.ai
category: product-research
tags:
  - esfera
  - construction-erp
  - documentation
  - product-research
  - ai-chat
  - latam
  - navigation
source: 'browserbase: agent-runtime 2026-06-12'
updated: '2026-06-12'
recommended_method: browser
alternative_methods:
  - method: fetch
    rationale: >-
      A raw HTTP GET of esfera.ai returns useful <meta>/og tags but an empty
      React shell (#root); docs.esfera.ai returns a Next.js __next_error__ shell
      with no readable copy. Use fetch only to grab SEO meta from the homepage —
      all body content requires a rendering browser.
verified: false
proxies: true
---
# Understand Esfera AI (Construction ERP)

## Purpose

Read-only research skill for understanding **Esfera AI** (`esfera.ai`), a construction ERP with native AI built for Latin-American construction companies. It teaches an agent how to navigate the marketing site (`esfera.ai`) and the documentation site (`docs.esfera.ai`), enumerate the product modules, and extract positioning, value proposition, target users, pricing, onboarding flows, documentation links, the AI-chat capability, and contact/demo paths. The output is a structured product/navigation briefing usable for commercial or implementation material. It never registers, logs in, submits forms, or clicks purchase/subscribe buttons — the application itself (`sistema.esfera.ai`) is login-gated and out of scope.

## When to Use

- Preparing commercial, sales-enablement, or competitive material about Esfera AI.
- Preparing implementation, configuration, migration, or training material for a construction company adopting Esfera.
- Answering questions about what Esfera does, which modules exist, how onboarding works, what the AI chat can do, or where a specific guide lives.
- Building a link map of the documentation for an internal knowledge base.

## Workflow

Both web surfaces are **client-rendered single-page apps**, so a rendering browser is required — a raw HTTP fetch returns empty shells (see Gotchas). Use a remote Browserbase session **with residential proxies** (the homepage sits behind Cloudflare; `--proxies` is enough, `--verified` was not needed). The site language is Spanish (LatAm).

There is **no public data API** and no `sitemap.xml` (it 404s). The fast, cheap path is: render each page, then `browse get markdown body` and parse the Markdown — do not rely on `browse snapshot` accessibility refs for content.

### Step 1 — Start a session
```bash
browse open https://esfera.ai/ --remote          # remote session created with --proxies
browse wait load
```

### Step 2 — Read the marketing homepage (one page, anchored landing)
```bash
browse get markdown body
browse screenshot --path home.png
```
`esfera.ai` is a single anchored landing page (`#producto`, `#modulos`, `#flujo`, `#ia`, `#precios`). From the Markdown you can extract everything below in one shot:
- **Positioning / category:** "Construction ERP with AI" / "Construction Management Software" / *"ERP de construcción con IA"*. Tagline: *"Controla tu obra desde el presupuesto hasta el almacén."*
- **Value prop:** centralizes presupuesto, APU/análisis de precio unitario, compras, almacén, administración de proyecto, obra, usuarios/proveedores/contratistas, reportes, and an AI chat connected to real project data.
- **6 obra modules:** Presupuesto (cómputo + presupuesto), APU, Compras, Almacén, Administración de Proyecto, Obra. Plus operational features: Usuarios/permisos, Directorio (comitentes/contratistas/proveedores), Reportes gerenciales, Alertas, and the **Cartera** (real-estate sales) module surfaced in the docs.
- **Target users:** arquitectos, constructoras, ingenieros, gerentes de proyecto.
- **5-step flow:** (1) Configurar empresa y proyecto → (2) Modelar presupuesto y APUs → (3) Ejecutar compras y almacén → (4) Controlar obra y finanzas → (5) Consultar IA y reportes.
- **Key links:** Docs `https://docs.esfera.ai/`, Login `https://sistema.esfera.ai/Usuario/Login`, Register/free-trial `https://sistema.esfera.ai/Usuario/RegistrarPago?IdPlan=5`, contact `info@esfera.ai`.
- **Pricing as displayed on the site** (see Gotchas re: stated commercial direction): Free trial (2 months, 1 obra, 3 users, budget ≤ $100k, no card) · Emprendedor $30/mo/obra · Constructor $120/mo/obra (most popular) · Empresarial $300/mo/obra. All tiers include all modules + Esfera AI.

### Step 3 — Map the documentation site
```bash
browse open https://docs.esfera.ai/    # 302 → /introduccion
browse wait load
browse get markdown body                # the left sidebar lists the full route tree
```
The docs sidebar is the canonical site map. Full route tree (prefix `https://docs.esfera.ai`):
- `/introduccion`, `/flujo-trabajo` (7-minute end-to-end video tutorial / "manual de uso")
- **Primeros pasos:** `/primeros-pasos/registro`, `/primeros-pasos/verificacion`, `/primeros-pasos/suscripcion`, `/primeros-pasos/olvido-contrasena`, `/primeros-pasos/crear-empresa`, `/primeros-pasos/crear-primer-proyecto`
- **Usuarios y permisos:** `/usuarios/agregar`, `/usuarios/permisos`
- **Personas:** `/personas/comitentes`, `/personas/contratistas`, `/personas/proveedores`
- **Análisis de precio unitario (APU):** `/analisis-precio-unitario/items`, `/mano-de-obra`, `/materiales-y-servicios`, `/equipos-maquinarias-herramientas`, `/unidades-de-medida`, `/grupos`, `/categorias`
- **Presupuesto:** `/presupuesto/computo`, `/presupuesto/presupuesto`, `/presupuesto/ejecucion`, `/presupuesto/cronograma`
- **Obra:** `/obra/avances`, `/obra/planillas`, `/obra/retenciones`
- **Compras:** `/compras/pedidos`, `/compras/cotizaciones`, `/compras/autorizaciones`, `/compras/ordenes-de-compra`
- **Almacén:** `/almacen/entradas`, `/almacen/salidas`, `/almacen/stock`
- **Cartera (real-estate sales):** `/cartera/inmuebles`, `/cartera/clientes`, `/cartera/ventas`, `/cartera/galeria`
- `/ia-chat` (Asistente IA), `/recursos-visuales` (video tutorials), `/faq`

### Step 4 — Drill into specific module/onboarding/FAQ pages
Open any route above and `browse get markdown body`. Each doc page repeats the full sidebar first — **strip everything up to and including the last `[FAQ→](/faq)` link, then the real content follows** (header label + version date + `## headings` with step-by-step text and screenshots). High-value pages:
- `/flujo-trabajo` — the recommended 7-minute orientation; covers configuración general, project management, financial planning, execution control, resource management, team collaboration, and AI usage.
- `/primeros-pasos/registro` → `/verificacion` → `/suscripcion` → `/crear-empresa` → `/crear-primer-proyecto` — the full self-service onboarding sequence.
- `/ia-chat` — documents the AI chat's tool catalog (see Expected Output) and an example prompt bank.
- `/faq` — grouped Q&A (Inicio/Configuración, Presupuesto y APU, Obra y Avances, Almacén, Compras, Cartera). Notes: setup takes ~15–30 min; exports to PDF/Excel; unlimited projects per plan.

### Step 5 — Assemble the briefing
Emit the JSON briefing in Expected Output. To answer a targeted question, map the topic to its module route in Step 3 and read that page.

### Browser fallback / non-render shortcut
Only the homepage's `<head>` (title, `meta description`, `og:*`, keywords) is readable from a raw `browse cloud fetch https://esfera.ai/ --proxies` without rendering — useful for a one-line positioning grab. Everything else (homepage body, all docs) needs a rendered session.

## Site-Specific Gotchas

- **Both surfaces are SPAs — raw fetch is useless for content.** `esfera.ai` is a Vite/React app (`<div id="root"></div>` + JS bundle); a raw fetch returns only the HTML head. `docs.esfera.ai` is a Next.js app whose root fetch returns an `id="__next_error__"` shell. Always render with `browse open ... --remote` + `browse wait load` (+ a ~1.5–3s settle) before extracting.
- **Cloudflare + proxies.** The homepage is behind Cloudflare. The successful run used `--proxies` (residential) and did **not** need `--verified`. Going fully bare was not attempted; keep proxies on.
- **`docs.esfera.ai/` redirects to `/introduccion`.** Don't treat `/introduccion` as a separate "home" — it is the docs landing.
- **The docs Markdown repeats the entire sidebar nav at the top of every page.** When parsing a specific page, slice off everything up to and including the last occurrence of `[FAQ→](/faq)`; the page's real content starts after it. The sidebar itself is the most reliable site map.
- **`sitemap.xml` 404s** and no public/JSON data API exists — enumerate routes from the docs sidebar, not a sitemap.
- **The actual application lives at `sistema.esfera.ai`** (an ASP.NET-style app: `/Usuario/Login`, `/Usuario/RegistrarPago?IdPlan=5`). It is login-gated; this skill stops at the public marketing + docs surfaces. Do not attempt to register, log in, or scrape behind the auth wall.
- **Spanish-language (LatAm) content.** Module names, headings, and FAQ are in Spanish; positioning bilingually states the English category "Construction ERP with AI."
- **Pricing on the site vs. stated commercial direction.** As observed (2026-06), the site still advertises paid per-obra plans ($30/$120/$300 per month per obra) plus a 2-month free trial. The product's stated commercial direction is a free, self-assisted platform where revenue comes from consulting, implementation, configuration, data migration, training, corporate support, and customer success for medium/large firms. Report the plans you actually see, and treat human support as a **paid/consulting** offering — do **not** assume free/self-assisted users get human support.
- **Support channel.** Docs surface a WhatsApp support link (`https://wa.me/15557021023`). Per the commercial direction above, frame human support as part of paid services, not a free-tier guarantee.
- **Doc images are real product screenshots** served from `docs.esfera.ai/...` (and referenced on the marketing "Pantallas reales" section, e.g. `docs.esfera.ai/presupuesto/tabla-presupuesto.png`) — useful as proof-of-UI assets.
- **Docs version:** "Versión 1.0 · Actualizado Feb 2026," with a banner noting the system is under continuous update so content may vary slightly.

## Expected Output

```json
{
  "success": true,
  "positioning": "Construction ERP with AI / Construction Management Software — 'ERP de construcción con IA' for Latin-American construction companies",
  "tagline": "Controla tu obra desde el presupuesto hasta el almacén.",
  "value_proposition": "Centralizes budget, APU/unit-price analysis, purchases, warehouse/inventory, project administration, field/obra execution, real-estate (cartera) sales, reports, and an AI chat connected to real project data.",
  "target_users": ["arquitectos", "constructoras", "ingenieros", "gerentes de proyecto"],
  "language": "es",
  "modules": {
    "presupuesto": ["computo", "presupuesto", "ejecucion", "cronograma"],
    "apu": ["items", "mano-de-obra", "materiales-y-servicios", "equipos-maquinarias-herramientas", "unidades-de-medida", "grupos", "categorias"],
    "compras": ["pedidos", "cotizaciones", "autorizaciones", "ordenes-de-compra"],
    "almacen": ["entradas", "salidas", "stock"],
    "obra": ["avances", "planillas", "retenciones"],
    "proyecto_admin": ["usuarios/agregar", "usuarios/permisos", "personas/comitentes", "personas/contratistas", "personas/proveedores"],
    "cartera": ["inmuebles", "clientes", "ventas", "galeria"],
    "ia_chat": "ia-chat",
    "reportes": "Reportes gerenciales (budget, execution, balance, payroll, progress)"
  },
  "onboarding_flow": [
    "1. Configurar empresa y proyecto",
    "2. Modelar presupuesto y APUs",
    "3. Ejecutar compras y almacén",
    "4. Controlar obra y finanzas",
    "5. Consultar IA y reportes"
  ],
  "ia_chat_tools": [
    "get_avance_resumen", "get_cronograma_fechas", "get_presupuesto_resumen",
    "get_planillas_pago", "get_ordenes_compra", "get_inventario_stock",
    "get_almacen_movimientos", "get_items_list", "get_item_components",
    "get_personas_contacto", "manage_ai_training_data"
  ],
  "pricing_as_displayed": {
    "free_trial": "2 months, 1 obra, 3 users, budget <= $100k, no card",
    "emprendedor": "$30/mo per obra (8 users, 100MB, budget <= 500k)",
    "constructor": "$120/mo per obra (12 users, 1GB, budget <= 2M, most popular)",
    "empresarial": "$300/mo per obra (16 users, 10GB, unlimited budget)"
  },
  "commercial_direction_note": "Stated move to a free, self-assisted platform; paid revenue = consulting, implementation, configuration, migration/data loading, training, corporate support, customer success. Do not assume free users get human support.",
  "links": {
    "marketing": "https://esfera.ai/",
    "docs_base": "https://docs.esfera.ai",
    "docs_intro": "https://docs.esfera.ai/introduccion",
    "workflow_tutorial": "https://docs.esfera.ai/flujo-trabajo",
    "video_tutorials": "https://docs.esfera.ai/recursos-visuales",
    "faq": "https://docs.esfera.ai/faq",
    "app_base": "https://sistema.esfera.ai",
    "login": "https://sistema.esfera.ai/Usuario/Login",
    "register_free_trial": "https://sistema.esfera.ai/Usuario/RegistrarPago?IdPlan=5"
  },
  "contact": {
    "email": "info@esfera.ai",
    "support_whatsapp": "https://wa.me/15557021023",
    "company": "ESFERA SOLUTIONS LLC, 33131 Miami, Florida",
    "social": {
      "instagram": "https://www.instagram.com/esfera.ai/",
      "linkedin": "https://linkedin.com/company/esferasolutions",
      "youtube": "https://www.youtube.com/@esfera-ai",
      "x": "https://x.com/esfera_ai"
    }
  },
  "docs_version": "1.0 · Actualizado Feb 2026",
  "error_reasoning": null
}
```

If a surface fails to render or is blocked, return `success: false` with `error_reasoning` describing the wall (e.g. Cloudflare challenge, empty `#root` after wait) and which surface failed.
