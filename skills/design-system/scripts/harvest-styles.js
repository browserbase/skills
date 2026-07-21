// Measurement probe — run via: browse eval "$(cat probes/harvest-styles.js)"
// Deterministic bulk harvest of computed styles. It MEASURES; it does not decide.
// Component selection, logo choice, semantic naming, and navigation are the
// agent's job. Returns a JSON string.
(() => {
  const MAX_ELEMENTS = 5000;

  const _cvs = document.createElement('canvas');
  _cvs.width = _cvs.height = 1;
  const _ctx = _cvs.getContext('2d', { willReadFrequently: true });
  const _colorCache = new Map();
  // canvas normalizes ANY css color (rgb, lab, oklch, color()...) to RGBA
  const toHex = (cssColor) => {
    if (!cssColor || cssColor === 'transparent') return null;
    if (_colorCache.has(cssColor)) return _colorCache.get(cssColor);
    let out = null;
    const m = cssColor.match(/^rgba?\(([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,\s/]+([\d.]+%?))?\)$/);
    if (m) {
      const [r, g, b] = [m[1], m[2], m[3]].map(v => Math.round(parseFloat(v)));
      let a = m[4] === undefined ? 1 : parseFloat(m[4]);
      if (m[4] && m[4].endsWith('%')) a = a / 100;
      if (a > 0) out = '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
    } else {
      _ctx.clearRect(0, 0, 1, 1);
      _ctx.fillStyle = cssColor;
      _ctx.fillRect(0, 0, 1, 1);
      const [r, g, b, a255] = _ctx.getImageData(0, 0, 1, 1).data;
      if (a255 > 0) out = '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
    }
    _colorCache.set(cssColor, out);
    return out;
  };

  const isVisible = (el) => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };
  const bump = (map, key, weight = 1) => { if (key) map.set(key, (map.get(key) || 0) + weight); };
  const topEntries = (map, n) =>
    [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, n)
      .map(([value, count]) => ({ value, count: Math.round(count) }));

  // CSS custom properties + @font-face, recursive through @media/@layer/@supports
  const cssVariables = {};
  const fontFaces = [];
  const stylesheets = [];
  let ruleBudget = 30000;
  const walkRules = (rules) => {
    for (const rule of rules) {
      if (ruleBudget-- <= 0) return;
      if (rule.cssRules) { walkRules(rule.cssRules); continue; }
      if (rule instanceof CSSFontFaceRule) {
        fontFaces.push({
          family: rule.style.getPropertyValue('font-family').replace(/["']/g, '').trim(),
          weight: rule.style.getPropertyValue('font-weight') || null,
          style: rule.style.getPropertyValue('font-style') || null,
          src: (rule.style.getPropertyValue('src').match(/url\(["']?([^"')]+)["']?\)/) || [])[1] || null,
        });
        continue;
      }
      if (!rule.style) continue;
      for (const prop of rule.style) {
        if (prop.startsWith('--')) cssVariables[prop] = rule.style.getPropertyValue(prop).trim();
      }
    }
  };
  for (const sheet of document.styleSheets) {
    if (sheet.href) stylesheets.push(sheet.href);
    try { if (sheet.cssRules) walkRules(sheet.cssRules); } catch {} // cross-origin
  }

  const bgColors = new Map(), textColors = new Map(), borderColors = new Map();
  const fontFamilies = new Map(), radii = new Map(), shadows = new Map();
  const typeScale = new Map(), spacing = new Map(), bgImages = new Map();

  for (const el of [...document.querySelectorAll('body *')].slice(0, MAX_ELEMENTS)) {
    if (!isVisible(el)) continue;
    const s = getComputedStyle(el);
    const rect = el.getBoundingClientRect();
    const area = Math.min(rect.width * rect.height, 500000);

    const bg = toHex(s.backgroundColor);
    if (bg) bump(bgColors, bg, Math.sqrt(area));
    if (s.backgroundImage && s.backgroundImage !== 'none') {
      const u = (s.backgroundImage.match(/url\(["']?([^"')]+)["']?\)/) || [])[1];
      if (u && !u.startsWith('data:')) bump(bgImages, u);
    }
    const hasText = [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim());
    if (hasText) {
      const fg = toHex(s.color);
      if (fg) bump(textColors, fg, el.textContent.trim().length);
      const fam = s.fontFamily.split(',')[0].trim().replace(/["']/g, '');
      bump(fontFamilies, fam);
      bump(typeScale, `${fam} ${s.fontSize}/${s.lineHeight} w${s.fontWeight}`);
    }
    for (const v of [s.paddingTop, s.paddingBottom, s.paddingLeft, s.paddingRight,
                     s.marginTop, s.marginBottom, s.rowGap, s.columnGap]) {
      if (v && v !== '0px' && v !== 'normal' && v.endsWith('px')) bump(spacing, v);
    }
    if (s.borderTopWidth !== '0px') { const bc = toHex(s.borderTopColor); if (bc) bump(borderColors, bc); }
    if (s.borderRadius && s.borderRadius !== '0px') bump(radii, s.borderRadius);
    if (s.boxShadow && s.boxShadow !== 'none') bump(shadows, s.boxShadow);
  }

  const typography = {};
  for (const tag of ['h1', 'h2', 'h3', 'h4', 'p', 'a']) {
    const el = [...document.querySelectorAll(tag)].find(isVisible);
    if (!el) continue;
    const s = getComputedStyle(el);
    typography[tag] = {
      fontFamily: s.fontFamily.split(',')[0].trim().replace(/["']/g, ''),
      fontSize: s.fontSize, fontWeight: s.fontWeight, lineHeight: s.lineHeight,
      letterSpacing: s.letterSpacing, color: toHex(s.color) || s.color,
    };
  }

  const buttonStyles = new Map();
  for (const el of [...document.querySelectorAll(
    'button, [role="button"], a[class*="btn" i], a[class*="button" i], input[type="submit"]'
  )].filter(isVisible).slice(0, 40)) {
    const s = getComputedStyle(el);
    const key = JSON.stringify({
      background: toHex(s.backgroundColor) || 'transparent',
      color: toHex(s.color) || s.color,
      borderRadius: s.borderRadius, fontSize: s.fontSize, fontWeight: s.fontWeight,
      padding: s.padding,
      border: s.borderTopWidth !== '0px' ? `${s.borderTopWidth} solid ${toHex(s.borderTopColor) || ''}` : 'none',
    });
    if (!buttonStyles.has(key)) {
      buttonStyles.set(key, { ...JSON.parse(key), sampleText: el.textContent.trim().slice(0, 40), count: 0, html: el.outerHTML.slice(0, 2000) });
    }
    buttonStyles.get(key).count++;
  }

  // logo CANDIDATES only — the agent looks at them and picks
  const logoCandidates = [];
  for (const sel of [
    'header a[href="/"] svg', 'nav a[href="/"] svg', 'header a[href="/"] img', 'nav a[href="/"] img',
    'header [class*="logo" i] svg', 'header [class*="logo" i] img',
    'header img[src*="logo" i]', 'header svg', '[class*="logo" i] svg', 'img[alt*="logo" i]',
  ]) {
    const el = document.querySelector(sel);
    if (!el || !isVisible(el)) continue;
    const r = el.getBoundingClientRect();
    logoCandidates.push({
      selector: sel,
      type: el.tagName.toLowerCase() === 'svg' ? 'svg' : 'img',
      rect: { x: Math.round(r.left), y: Math.round(r.top), width: Math.round(r.width), height: Math.round(r.height) },
      src: el.src || null,
      markup: el.tagName.toLowerCase() === 'svg' ? el.outerHTML.slice(0, 5000) : null,
    });
    if (logoCandidates.length >= 3) break;
  }

  const images = [...document.querySelectorAll('img')]
    .filter(el => isVisible(el) && el.src && !el.src.startsWith('data:'))
    .slice(0, 20)
    .map(el => {
      const r = el.getBoundingClientRect();
      return { src: el.src, alt: el.alt || null, width: Math.round(r.width), height: Math.round(r.height) };
    });

  const bodyStyle = getComputedStyle(document.body);
  const pageBg = toHex(bodyStyle.backgroundColor) || toHex(getComputedStyle(document.documentElement).backgroundColor);

  return JSON.stringify({
    url: location.href,
    title: document.title,
    viewport: { width: innerWidth, height: innerHeight, pageHeight: document.documentElement.scrollHeight },
    page: {
      backgroundColor: pageBg || 'transparent',
      textColor: toHex(bodyStyle.color) || bodyStyle.color,
      baseFontFamily: bodyStyle.fontFamily,
      baseFontSize: bodyStyle.fontSize,
    },
    colors: {
      backgrounds: topEntries(bgColors, 10),
      text: topEntries(textColors, 8),
      borders: topEntries(borderColors, 5),
    },
    typography,
    typeScale: topEntries(typeScale, 15),
    fontFamilies: topEntries(fontFamilies, 6),
    fontFaces: fontFaces.slice(0, 20),
    spacingScale: topEntries(spacing, 12),
    buttons: [...buttonStyles.values()].sort((a, b) => b.count - a.count).slice(0, 6),
    borderRadii: topEntries(radii, 6),
    shadows: topEntries(shadows, 4),
    cssVariables,
    stylesheets: stylesheets.slice(0, 15),
    images,
    backgroundImages: topEntries(bgImages, 10).map(e => e.value),
    logoCandidates,
  });
})()
