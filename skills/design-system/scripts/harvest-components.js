// Component-contract probe — run via: browse eval "$(cat probes/harvest-components.js)"
// Measures role-classifiable component ingredients: every interactive element with
// its accessible name (so carousel arrows are distinguishable from CTAs), named
// regions, section titles, repeated labels (kickers/badges), and typography by
// structural context. Returns a JSON string.
(() => {
  const toHex = (css) => {
    const m = css.match(/rgba?\((\d+)[,\s]+(\d+)[,\s]+(\d+)(?:[,\s/]+([\d.]+))?/);
    if (!m) return null;
    if (m[4] !== undefined && parseFloat(m[4]) === 0) return null;
    return '#' + [m[1], m[2], m[3]].map(v => (+v).toString(16).padStart(2, '0')).join('');
  };
  const vis = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  const styleOf = (el) => {
    const s = getComputedStyle(el);
    return {
      background: toHex(s.backgroundColor) || 'transparent',
      color: toHex(s.color) || s.color,
      fontFamily: s.fontFamily.split(',')[0].trim().replace(/["']/g, ''),
      fontSize: s.fontSize, fontWeight: s.fontWeight, lineHeight: s.lineHeight,
      borderRadius: s.borderRadius, padding: s.padding,
      border: s.borderTopWidth !== '0px' ? `${s.borderTopWidth} solid ${toHex(s.borderTopColor) || ''}` : 'none',
    };
  };

  // ---------- interactive elements with accessible names ----------
  const interactives = [];
  for (const el of [...document.querySelectorAll('a, button, [role="button"], input[type="submit"]')].slice(0, 400)) {
    if (!vis(el) || interactives.length >= 80) continue;
    const r = el.getBoundingClientRect();
    const text = el.textContent.trim().replace(/\s+/g, ' ').slice(0, 50);
    const aria = el.getAttribute('aria-label') || el.getAttribute('title') || '';
    const s = styleOf(el);
    // keep only elements that look styled (bg, border, or radius) OR have aria/text
    if (s.background === 'transparent' && s.border === 'none' && s.borderRadius === '0px' && !aria) continue;
    interactives.push({
      tag: el.tagName.toLowerCase(),
      text: text || null, ariaLabel: aria || null,
      hasOnlySvg: !text && !!el.querySelector('svg'),
      rect: { w: Math.round(r.width), h: Math.round(r.height) },
      ...s,
    });
  }

  // ---------- named regions ----------
  const regions = {};
  for (const [name, sel] of [['header', 'header'], ['nav', 'nav'], ['footer', 'footer']]) {
    const els = [...document.querySelectorAll(sel)].filter(vis);
    const el = els.sort((a, b) => (b.getBoundingClientRect().width * b.getBoundingClientRect().height) -
                                   (a.getBoundingClientRect().width * a.getBoundingClientRect().height))[0];
    if (!el) continue;
    const r = el.getBoundingClientRect();
    const link = el.querySelector('a');
    regions[name] = {
      rect: { y: Math.round(r.top + scrollY), w: Math.round(r.width), h: Math.round(r.height) },
      ...styleOf(el),
      linkStyle: link ? styleOf(link) : null,
    };
  }

  // ---------- section titles (repeated h2-level headings) ----------
  const titleGroups = new Map();
  for (const el of [...document.querySelectorAll('main h2, section > h2, [class*="section" i] h2')].slice(0, 60)) {
    if (!vis(el)) continue;
    const s = styleOf(el);
    const key = `${s.fontFamily}|${s.fontSize}|${s.fontWeight}|${s.color}`;
    if (!titleGroups.has(key)) titleGroups.set(key, { ...s, samples: [], count: 0 });
    const g = titleGroups.get(key);
    g.count++;
    if (g.samples.length < 3) g.samples.push(el.textContent.trim().slice(0, 40));
  }

  // ---------- repeated small labels: kickers, badges, tags ----------
  const labelGroups = new Map();
  for (const el of [...document.querySelectorAll('main span, main div, main b, main strong')].slice(0, 3000)) {
    const t = el.textContent.trim();
    if (!t || t.length > 28 || el.children.length > 1) continue;
    if (!vis(el)) continue;
    const s = getComputedStyle(el);
    const fs = parseFloat(s.fontSize);
    if (fs > 18) continue;
    const color = toHex(s.color), bg = toHex(s.backgroundColor);
    const bold = parseInt(s.fontWeight) >= 600;
    const NEUTRAL = /^#(ffffff|000000|121212|1a1a1a|333333|545454|707070)/;
    const colored = (color && !NEUTRAL.test(color)) || (bg && !NEUTRAL.test(bg));
    if (!bold && !colored) continue;
    const key = `${color}|${bg}|${s.fontSize}|${s.fontWeight}|${s.textTransform}`;
    if (!labelGroups.has(key)) {
      labelGroups.set(key, { color, background: bg, fontSize: s.fontSize, fontWeight: s.fontWeight,
        textTransform: s.textTransform, borderRadius: s.borderRadius, samples: [], count: 0 });
    }
    const g = labelGroups.get(key);
    g.count++;
    if (g.samples.length < 4 && !g.samples.includes(t)) g.samples.push(t);
  }

  // ---------- typography by structural context ----------
  const typeRoles = {};
  const sample = (name, sel) => {
    const el = [...document.querySelectorAll(sel)].find(vis);
    if (el) typeRoles[name] = { ...styleOf(el), sample: el.textContent.trim().slice(0, 60), selector: sel };
  };
  sample('headline.lead', 'main h1, main section:first-of-type h2 a, main h3 a');
  sample('headline.card', 'main li h3, main [class*="card" i] h3, main ul h2');
  sample('body.standfirst', 'main h1 ~ p, main [class*="standfirst" i], main [class*="trail" i] p');
  sample('body.paragraph', 'main p');
  sample('metadata.time', 'main time, [datetime]');
  sample('label.sectionLink', 'nav a, header nav a');

  return JSON.stringify({
    interactives,
    regions,
    sectionTitles: [...titleGroups.values()].sort((a, b) => b.count - a.count).slice(0, 6),
    labels: [...labelGroups.values()].sort((a, b) => b.count - a.count).slice(0, 12),
    typeRoles,
  });
})()
