---
name: preicfes-gratis-com-resumen-xzlf6m
title: Resúmenes y simulacros ICFES SABER 11°
description: >-
  Explora preicfes-gratis.com y devuelve el catálogo completo de documentos
  gratuitos para ICFES SABER 11°: resúmenes PDF por materia (lectura crítica,
  filosofía, matemáticas, física, química, biología, sociales, inglés), bancos
  de simulacros y boletines oficiales del ICFES con URLs de previsualización y
  descarga directa.
website: preicfes-gratis.com
category: educacion
tags:
  - icfes
  - saber-11
  - colombia
  - preicfes
  - pdf
  - educacion
  - simulacros
source: 'browserbase: agent-runtime 2026-05-25'
updated: '2026-05-25'
recommended_method: hybrid
alternative_methods:
  - method: fetch
    rationale: >-
      Las páginas del sitio son HTML estático servido por Google Sites (servidor
      ESF). Un GET simple devuelve 200 con todo el HTML, pero los iframes con
      los PDFs no quedan en el markdown extraído — hay que parsear el DOM con un
      querySelector('iframe') para obtener los IDs Drive.
  - method: browser
    rationale: >-
      Camino más fiable: navega cada página de detalle y ejecuta
      document.querySelectorAll('iframe') para capturar los src de Drive. No
      requiere antibot ni stealth — Google Sites no bloquea.
  - method: api
    rationale: >-
      No existe: Google Sites no expone JSON estructurado, no hay sitemap.xml
      propio y el sitio no publica feed.
verified: true
proxies: true
---
# Explorar y extraer los documentos más útiles del ICFES SABER 11 en preicfes-gratis.com

## Purpose

Explora el sitio educativo gratuito **preicfes-gratis.com** (un Google Sites administrado por PREICFES GRATIS VIRTUAL) y extrae el catálogo completo de **documentos descargables** —los "resúmenes" en PDF por materia y los bancos de preguntas / simulacros— que el sitio recomienda para preparar la prueba **ICFES SABER 11°** colombiana. La operación es de solo lectura: devuelve una lista estructurada con el título, materia, ID de Google Drive, URL de previsualización y URL de descarga directa de cada documento. No requiere registro ni login.

## When to Use

- Un estudiante o tutor pide "los resúmenes / PDFs / cartillas gratis para el ICFES SABER 11°".
- Hay que armar un paquete de estudio por materia (lectura crítica, matemáticas, ciencias naturales, sociales, inglés, filosofía).
- Se necesitan **bancos de preguntas de simulacro** (200+ preguntas por materia, plus un consolidado de 1000 preguntas).
- Se quiere descargar los **boletines oficiales del ICFES "SABER AL DETALLE"** que el sitio enlaza (cómo se generan los puntajes, cómo se analizan los ítems, comparabilidad de resultados).
- Cualquier flujo de "dame los recursos gratuitos de preicfes-gratis.com" — el sitio no expone ni API ni descarga masiva, así que esta skill enumera el catálogo por inspección de iframes.

## Workflow

El sitio es un Google Sites estático sin antibot. **El camino óptimo es scraping muy ligero** de un puñado de páginas conocidas: los documentos están embebidos como `<iframe src="https://drive.google.com/file/d/{ID}/preview...">` o enlazados como `<a href="https://drive.google.com/...">`. Una vez extraídos los IDs de Drive, los documentos se pueden previsualizar o descargar directamente sin volver al sitio.

1. **Recorre las páginas de detalle de cada materia** (todas siguen el patrón `/{categoria}/virtual-icfes-saber-11-{tema}`):

   | Materia | URL |
   |---|---|
   | Lectura crítica | `https://www.preicfes-gratis.com/icfes-saber-11-lectura-critica-y-filosofia/virtual-icfes-saber-11-lectura-critica` |
   | Filosofía | `https://www.preicfes-gratis.com/icfes-saber-11-lectura-critica-y-filosofia/virtual-icfes-saber-11-filosofia` |
   | Matemáticas | `https://www.preicfes-gratis.com/icfes-saber-11-matematicas/virtual-icfes-saber-11-matematicas` |
   | Física | `https://www.preicfes-gratis.com/icfes-saber-11-ciencias-naturales/virtual-icfes-saber-11-fisica` |
   | Química | `https://www.preicfes-gratis.com/icfes-saber-11-ciencias-naturales/virtual-icfes-saber-11-quimica` |
   | Biología | `https://www.preicfes-gratis.com/icfes-saber-11-ciencias-naturales/virtual-icfes-saber-11-biologia` |
   | Geografía | `https://www.preicfes-gratis.com/icfes-saber-11-sociales-y-competencias-ciudadanas/virtual-icfes-saber-11-geografia` |
   | Historia | `https://www.preicfes-gratis.com/icfes-saber-11-sociales-y-competencias-ciudadanas/virtual-icfes-saber-11-historia` |
   | Competencias Ciudadanas | `https://www.preicfes-gratis.com/icfes-saber-11-sociales-y-competencias-ciudadanas/virtual-icfes-saber-11-competencias-ciudadanas` |
   | Inglés | `https://www.preicfes-gratis.com/icfes-saber-11-ingles/virtual-icfes-saber-11-ingles` |

2. **En cada página, extrae el iframe del resumen** ejecutando este JS (vía `browse eval --remote` o `page.evaluate()` en Playwright):

   ```js
   JSON.stringify({
     title: document.title,
     iframes: Array.from(document.querySelectorAll('iframe'))
       .map(f => f.src)
       .filter(s => s && s.includes('drive.google.com/file/d/')),
     drive_links: Array.from(document.querySelectorAll('a'))
       .map(a => a.href)
       .filter(h => h && (h.includes('drive.google.com') || h.includes('docs.google.com')))
   })
   ```

   El iframe tiene la forma `https://drive.google.com/file/d/{FILE_ID}/preview?resourcekey={RKEY}` (los PDFs antiguos requieren `resourcekey`; los nuevos no). Guarda `FILE_ID` + `RKEY` opcional.

3. **Visita la página de simulacros** `https://www.preicfes-gratis.com/simulacros-icfes-saber-11-gratis/preguntas-simulacro-icfes-saber-11` y recolecta enlaces a `drive.google.com/drive/folders/{FOLDER_ID}` (carpetas con bancos de preguntas por materia) y archivos individuales `drive.google.com/file/d/{FILE_ID}/view` (boletines oficiales). El texto del `<a>` o del párrafo padre contiene el rótulo descriptivo (`"204 PREGUNTAS ICFES SABER 11"`, `"LECTURA CRÍTICA"`, `"boletín 01 SABER AL DETALLE"`).

4. **Para cada documento, construye dos URLs accionables**:
   - **Previsualización web** (sin descarga): `https://drive.google.com/file/d/{FILE_ID}/view?usp=sharing` (añade `&resourcekey={RKEY}` si aplica).
   - **Descarga directa del PDF** (binario): `https://drive.google.com/uc?export=download&id={FILE_ID}` (añade `&resourcekey={RKEY}` si aplica). El response incluye `Content-Disposition: attachment; filename="{Materia}_WWW.PREICFES-GRATIS.COM.pdf"` y `Content-Type: application/octet-stream`. Tamaños típicos: 400 KB – 5 MB.
   - **Para carpetas de simulacros**: `https://drive.google.com/drive/folders/{FOLDER_ID}` — abre la UI de Drive; no hay descarga masiva sin login, pero el agente puede listar contenido haciendo scraping del HTML de Drive si es necesario.

5. **Devuelve la lista catalogada** (ver "Expected Output").

**No hay método API ni endpoint oficial** — Google Sites no expone el contenido como JSON estructurado y el sitio no publica `sitemap.xml` ni feed. El scraping ligero de 11 páginas estáticas es la vía óptima y completa en < 30 segundos.

## Site-Specific Gotchas

- **Hospedaje Google Sites (servidor `ESF`)**: el sitio responde HTML completo sin requerir JS, pero los **iframes de Google Drive con los PDFs no aparecen en el texto plano** del body. `browse get markdown body` te devolverá el texto descriptivo (p. ej. "puedes leer el resumen virtual en línea o descargarlo gratis en formato PDF con el icono de ventana emergente que aparece en la esquina") pero **no** el `src` del iframe. **Debes** extraer iframes con `document.querySelectorAll('iframe')` vía CDP/Playwright `evaluate`. Confiar solo en el markdown te dejará con 4 materias "vacías" (geografía, historia, competencias ciudadanas, lectura crítica) cuando sí tienen documento embebido.
- **Sin antibot ni captcha**: la primera fetch funcionó con configuración mínima. `--verified --proxies` siguen siendo razonables por inercia, pero no son obligatorios.
- **Geografía e Historia comparten un único PDF consolidado de Sociales** (file ID `0B8dm_wzVerxhaWFsT3BjTG9DQXc`, titulado `Sociales_WWW.PREICFES-GRATIS.COM.pdf`). La página de **Competencias Ciudadanas** no tiene iframe propio — sólo enlaza al mismo PDF de Sociales mediante texto y la nav lateral. No es un bug: el sitio cubre las 3 sub-materias sociales con un solo resumen.
- **`resourcekey` legacy de Google Drive**: los PDFs subidos antes de septiembre 2021 (todos los IDs que empiezan por `0B8dm_wzVerxh...`) **requieren el parámetro `?resourcekey=` o `&resourcekey=`** para ser accesibles públicamente, incluso con el archivo marcado "anyone with the link". Si pierdes el `resourcekey` en la URL final, Drive te devolverá un 403. Los IDs nuevos (los que empiezan por `1...`, como `1aoLKAoh...` para Lectura crítica o `1Gzua...` para Biología) **no** lo requieren.
- **El endpoint `/uc?export=download&id={ID}` funciona sin autenticación** para los archivos públicos del sitio — devuelve `Content-Disposition: attachment` con el PDF binario directamente. Verificado con `Lectura_WWW.PREICFES-GRATIS.COM.pdf` (396 KB). No hay confirmación intersticial "Google no puede analizar antivirus este archivo" porque los PDFs son < 100 MB.
- **Cada resumen está acompañado de un deep-link de Gemini Guided Learning** (`https://gemini.google.com/guided-learning?query=...`) preconstruido por el sitio: la query lleva instrucciones en español pidiendo "abre y analiza este PDF" + el URL Drive del propio resumen. Útil para devolver al usuario como "abre este resumen con un tutor de IA", pero **no extraigas el iframe Drive de la URL Gemini** — es la misma referencia al mismo archivo, no un PDF distinto.
- **Lectura crítica embebe un `<iframe>` de Gemini Gem** (`gemini.google.com/gem/1loKy-...`) en lugar de un PDF en Drive. El PDF de Lectura crítica sí existe (file ID `1aoLKAoh9Wc67fIs_7bE-xB7aZ_HbVkj8`, `Lectura_WWW.PREICFES-GRATIS.COM.pdf`), pero está enlazado en el iframe Drive separado debajo del Gem — ambos deben capturarse.
- **Página de simulacros tiene 3 PDFs sueltos + 7 carpetas** con etiquetas en español ("204 PREGUNTAS ICFES SABER 11: LECTURA CRÍTICA", "1000 PREGUNTAS ICFES SABER 11°", "boletín 01 SABER AL DETALLE", etc.). Las carpetas requieren UI de Drive para listar contenido — no devolverán una API JSON. Si necesitas el inventario de cada carpeta, navega manualmente a `drive.google.com/drive/folders/{ID}` y scrapea con un browser headless.
- **El sitio referencia constantemente la fuente oficial** `icfes.gov.co/caja-de-herramientas-saber-11/` y `icfes.gov.co/evaluaciones-icfes/saber-11/` — si la skill devuelve además esos enlaces como "documentación oficial complementaria" es una mejora razonable; el ICFES publica sus propias guías y cuadernillos de prueba ahí.
- **No hay versionado**: los IDs Drive del sitio están fijos desde 2022 (último `Last-Modified` confirmado: `Fri, 29 Jul 2022 21:30:11 GMT` para Lectura crítica). El contenido no se rotó para la cohorte 2026; los resúmenes son del programa 2022+ y siguen siendo relevantes porque el marco SABER 11 no cambia.
- **No hay rate-limit observado** en 11 navegaciones consecutivas en una misma sesión. El sitio es estático cacheado por la edge de Google.

## Expected Output

```json
{
  "site": "preicfes-gratis.com",
  "site_title": "PREICFES GRATIS VIRTUAL ICFES SABER 11° 2026",
  "captured_at": "2026-05-25",
  "resumenes": [
    {
      "materia": "Lectura crítica",
      "drive_file_id": "1aoLKAoh9Wc67fIs_7bE-xB7aZ_HbVkj8",
      "filename": "Lectura_WWW.PREICFES-GRATIS.COM.pdf",
      "preview_url": "https://drive.google.com/file/d/1aoLKAoh9Wc67fIs_7bE-xB7aZ_HbVkj8/preview",
      "view_url":    "https://drive.google.com/file/d/1aoLKAoh9Wc67fIs_7bE-xB7aZ_HbVkj8/view?usp=sharing",
      "download_url":"https://drive.google.com/uc?export=download&id=1aoLKAoh9Wc67fIs_7bE-xB7aZ_HbVkj8",
      "source_page": "https://www.preicfes-gratis.com/icfes-saber-11-lectura-critica-y-filosofia/virtual-icfes-saber-11-lectura-critica",
      "resourcekey_required": false
    },
    {
      "materia": "Filosofía",
      "drive_file_id": "0B8dm_wzVerxhbUJDanB0Tm1XQlE",
      "resourcekey": "0-yrOADYFkeLT98SG4C4l9-g",
      "preview_url": "https://drive.google.com/file/d/0B8dm_wzVerxhbUJDanB0Tm1XQlE/preview?resourcekey=0-yrOADYFkeLT98SG4C4l9-g",
      "view_url":    "https://drive.google.com/file/d/0B8dm_wzVerxhbUJDanB0Tm1XQlE/view?usp=sharing&resourcekey=0-yrOADYFkeLT98SG4C4l9-g",
      "download_url":"https://drive.google.com/uc?export=download&id=0B8dm_wzVerxhbUJDanB0Tm1XQlE&resourcekey=0-yrOADYFkeLT98SG4C4l9-g",
      "source_page": "https://www.preicfes-gratis.com/icfes-saber-11-lectura-critica-y-filosofia/virtual-icfes-saber-11-filosofia",
      "resourcekey_required": true
    },
    {
      "materia": "Matemáticas",
      "drive_file_id": "0B8dm_wzVerxhQ3RUTjA0TE82c1U",
      "resourcekey": "0-01OIMmXgsboUWNXcUo4Xtg",
      "preview_url": "https://drive.google.com/file/d/0B8dm_wzVerxhQ3RUTjA0TE82c1U/preview?resourcekey=0-01OIMmXgsboUWNXcUo4Xtg",
      "view_url":    "https://drive.google.com/file/d/0B8dm_wzVerxhQ3RUTjA0TE82c1U/view?usp=sharing&resourcekey=0-01OIMmXgsboUWNXcUo4Xtg",
      "download_url":"https://drive.google.com/uc?export=download&id=0B8dm_wzVerxhQ3RUTjA0TE82c1U&resourcekey=0-01OIMmXgsboUWNXcUo4Xtg",
      "source_page": "https://www.preicfes-gratis.com/icfes-saber-11-matematicas/virtual-icfes-saber-11-matematicas",
      "resourcekey_required": true
    },
    {
      "materia": "Física",
      "drive_file_id": "0B8dm_wzVerxhNVh2eUU3Mi1LaGs",
      "resourcekey": "0-nvwFcjqY0FrFBzpldL0tFw",
      "preview_url": "https://drive.google.com/file/d/0B8dm_wzVerxhNVh2eUU3Mi1LaGs/preview?resourcekey=0-nvwFcjqY0FrFBzpldL0tFw",
      "download_url":"https://drive.google.com/uc?export=download&id=0B8dm_wzVerxhNVh2eUU3Mi1LaGs&resourcekey=0-nvwFcjqY0FrFBzpldL0tFw",
      "source_page": "https://www.preicfes-gratis.com/icfes-saber-11-ciencias-naturales/virtual-icfes-saber-11-fisica",
      "resourcekey_required": true
    },
    {
      "materia": "Química",
      "drive_file_id": "0B8dm_wzVerxhb01XZGY1VkN6MlU",
      "resourcekey": "0-pNUP9Z6LJqpKbe9CA6ng2w",
      "preview_url": "https://drive.google.com/file/d/0B8dm_wzVerxhb01XZGY1VkN6MlU/preview?resourcekey=0-pNUP9Z6LJqpKbe9CA6ng2w",
      "download_url":"https://drive.google.com/uc?export=download&id=0B8dm_wzVerxhb01XZGY1VkN6MlU&resourcekey=0-pNUP9Z6LJqpKbe9CA6ng2w",
      "source_page": "https://www.preicfes-gratis.com/icfes-saber-11-ciencias-naturales/virtual-icfes-saber-11-quimica",
      "resourcekey_required": true
    },
    {
      "materia": "Biología",
      "drive_file_id": "1GzuaPLSpxx9W2ra1W2nX8zy9buSWkUHn",
      "preview_url": "https://drive.google.com/file/d/1GzuaPLSpxx9W2ra1W2nX8zy9buSWkUHn/preview",
      "download_url":"https://drive.google.com/uc?export=download&id=1GzuaPLSpxx9W2ra1W2nX8zy9buSWkUHn",
      "source_page": "https://www.preicfes-gratis.com/icfes-saber-11-ciencias-naturales/virtual-icfes-saber-11-biologia",
      "resourcekey_required": false
    },
    {
      "materia": "Sociales (Geografía + Historia + Competencias Ciudadanas)",
      "filename": "Sociales_WWW.PREICFES-GRATIS.COM.pdf",
      "drive_file_id": "0B8dm_wzVerxhaWFsT3BjTG9DQXc",
      "resourcekey": "0-n_5UZaVSneM2pdqzTo8Ynw",
      "preview_url": "https://drive.google.com/file/d/0B8dm_wzVerxhaWFsT3BjTG9DQXc/preview?resourcekey=0-n_5UZaVSneM2pdqzTo8Ynw",
      "download_url":"https://drive.google.com/uc?export=download&id=0B8dm_wzVerxhaWFsT3BjTG9DQXc&resourcekey=0-n_5UZaVSneM2pdqzTo8Ynw",
      "source_pages": [
        "https://www.preicfes-gratis.com/icfes-saber-11-sociales-y-competencias-ciudadanas/virtual-icfes-saber-11-geografia",
        "https://www.preicfes-gratis.com/icfes-saber-11-sociales-y-competencias-ciudadanas/virtual-icfes-saber-11-historia",
        "https://www.preicfes-gratis.com/icfes-saber-11-sociales-y-competencias-ciudadanas/virtual-icfes-saber-11-competencias-ciudadanas"
      ],
      "resourcekey_required": true,
      "covers_subjects": ["Geografía", "Historia", "Competencias Ciudadanas"]
    },
    {
      "materia": "Inglés",
      "drive_file_id": "0B8dm_wzVerxhaFhlSG9sOE1iRFk",
      "resourcekey": "0-jFG3Ii7TMb3bCpl4G6Mfgw",
      "preview_url": "https://drive.google.com/file/d/0B8dm_wzVerxhaFhlSG9sOE1iRFk/preview?resourcekey=0-jFG3Ii7TMb3bCpl4G6Mfgw",
      "download_url":"https://drive.google.com/uc?export=download&id=0B8dm_wzVerxhaFhlSG9sOE1iRFk&resourcekey=0-jFG3Ii7TMb3bCpl4G6Mfgw",
      "source_page": "https://www.preicfes-gratis.com/icfes-saber-11-ingles/virtual-icfes-saber-11-ingles",
      "extras": {
        "audio_folders": [
          "https://drive.google.com/drive/folders/1AxuEDk7ID_z1S0kQALU0rY0iph0rAuQL?usp=share_link",
          "https://drive.google.com/drive/folders/1feBpI-QdeSxF0LL_c1Ybfvu_9Gieqd7s"
        ]
      },
      "resourcekey_required": true
    }
  ],
  "simulacros": {
    "source_page": "https://www.preicfes-gratis.com/simulacros-icfes-saber-11-gratis/preguntas-simulacro-icfes-saber-11",
    "preguntas_por_materia": [
      { "label": "204 PREGUNTAS — LECTURA CRÍTICA",        "drive_folder_id": "1rgXHTeMKryfbx0Xm2Z-5gBBbo3d9Jqbv" },
      { "label": "202 PREGUNTAS — MATEMÁTICAS (banco A)",  "drive_folder_id": "1v5U8fNkimk4sihvh4hELRnLrQcpW0esQ" },
      { "label": "MATEMÁTICAS (banco B)",                  "drive_folder_id": "1S7mM_TxSY_dOHbEII84fDcnldJ6E1yro" },
      { "label": "201 PREGUNTAS — CIENCIAS NATURALES (banco A)", "drive_folder_id": "1KCqj0hrwk4IQkCZMpa-ToAxOFPb2YNf5" },
      { "label": "CIENCIAS NATURALES (banco B)",           "drive_folder_id": "1PuyM_AXUZX6D-5td3WvL1_5Jrxp6VRFs" },
      { "label": "200 PREGUNTAS — SOCIALES Y CIUDADANAS (banco A)", "drive_folder_id": "1UuVKPEmtDWzrGNZvTNG_LXdWaskY_Qsa" },
      { "label": "SOCIALES Y COMPETENCIAS CIUDADANAS (banco B)", "drive_folder_id": "1FFmh-rBYM7WacjsGl4uSJkVXPy1FL8Eu" },
      { "label": "228 PREGUNTAS — INGLÉS (banco A)",       "drive_folder_id": "1rNuC-qFp2JOyWyBkIcdEPm03Sp3pJoXt" },
      { "label": "INGLÉS (banco B)",                       "drive_folder_id": "1xcVtdpQF7XmuuFTebHsyWZpbDGt7o7kg" },
      { "label": "1000 PREGUNTAS ICFES SABER 11° (consolidado)", "drive_folder_id": "1dmqq4sleEG-cHAaIdSRL69i533qsIpYm" }
    ],
    "boletines_oficiales_icfes": [
      {
        "label": "boletín 01 SABER AL DETALLE — ¿Cómo se generan los puntajes en las pruebas SABER?",
        "drive_file_id": "1At-czFowDzOyL7o87huLQWGOTWJ1Uo95",
        "download_url": "https://drive.google.com/uc?export=download&id=1At-czFowDzOyL7o87huLQWGOTWJ1Uo95"
      },
      {
        "label": "boletín 03 SABER AL DETALLE — ¿Qué garantiza la comparabilidad de los resultados?",
        "drive_file_id": "1zwdZob8YgQYiB6EnthRky8DcHDQ0yj3M",
        "download_url": "https://drive.google.com/uc?export=download&id=1zwdZob8YgQYiB6EnthRky8DcHDQ0yj3M"
      },
      {
        "label": "boletín 09 SABER AL DETALLE — ¿Cómo se analizan los ítems de las pruebas SABER? (p.5)",
        "drive_file_id": "1s9sYYwJDuw16L9u2zJ1xqnYfxEQSMQJG",
        "download_url": "https://drive.google.com/uc?export=download&id=1s9sYYwJDuw16L9u2zJ1xqnYfxEQSMQJG"
      }
    ]
  },
  "official_complementary_sources": [
    "https://www.icfes.gov.co/caja-de-herramientas-saber-11/",
    "https://www.icfes.gov.co/evaluaciones-icfes/saber-11/",
    "https://blog.icfes.gov.co/estudiantes/",
    "https://resultadossaber11.icfes.gov.co/login",
    "https://citacion.icfes.edu.co/citacion-web/pages/citacion/reportes/consultarCitacionIndividual.jsf",
    "https://prisma.icfes.edu.co/prisma-web/pages/administracion/autenticacion/autenticacionIcfes.jsf"
  ]
}
```

**Outcome shapes**:

- **`success`** — el agente devolvió la estructura completa de arriba con los 8 resúmenes + 10 carpetas de preguntas + 3 boletines.
- **`partial`** — alguna materia falló (p. ej. el iframe Drive no se renderizó porque la página tardó en cargar). Reintenta esa página específicamente con espera adicional (`waitUntil: 'networkidle'`) antes del `evaluate`.
- **`resourcekey_missing`** — devolviste una URL Drive sin `resourcekey` para un file ID `0B8dm_...`. Drive responderá 403. Re-extrae el iframe original y conserva el query string completo.
- **`drive_blocked`** — si Google Drive ha movido el archivo a "solicitar acceso", el response del `/uc?export=download&id=...` será HTML en vez de PDF (`Content-Type: text/html`). Reporta el ID afectado y deja constancia.
