// Structure probe — run via: browse eval "$(cat probes/harvest-structure.js)"
// Measures layout system, breakpoints, interaction states, motion, iconography,
// and contrast. Complements harvest-styles.js. Returns a JSON string.
(() => {
  const topEntries = (map, n) =>
    [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, n)
      .map(([value, count]) => ({ value, count }));
  const bump = (map, key, w = 1) => { if (key) map.set(key, (map.get(key) || 0) + w); };

  // ---------- stylesheet walk: breakpoints, state rules, keyframes ----------
  const mediaConditions = new Map();
  const stateRules = [];
  const keyframes = [];
  let reducedMotionHandled = false;
  let ruleBudget = 40000;
  const STATE_PROPS = ['background-color', 'color', 'border-color', 'box-shadow', 'outline',
    'outline-offset', 'text-decoration', 'transform', 'opacity', 'filter', 'text-decoration-line'];
  const walk = (rules, mediaCtx) => {
    for (const rule of rules) {
      if (ruleBudget-- <= 0) return;
      if (rule instanceof CSSMediaRule) {
        const cond = rule.conditionText || rule.media.mediaText;
        bump(mediaConditions, cond);
        if (/prefers-reduced-motion/.test(cond)) reducedMotionHandled = true;
        walk(rule.cssRules, cond);
        continue;
      }
      if (rule instanceof CSSKeyframesRule) {
        if (keyframes.length < 30) keyframes.push(rule.name);
        continue;
      }
      if (rule.cssRules) { walk(rule.cssRules, mediaCtx); continue; }
      if (!rule.selectorText || !rule.style) continue;
      if (/:(hover|focus|focus-visible|focus-within|active|disabled)\b/.test(rule.selectorText)) {
        if (stateRules.length >= 120) continue;
        const props = {};
        for (const p of STATE_PROPS) {
          const v = rule.style.getPropertyValue(p);
          if (v) props[p] = v;
        }
        if (Object.keys(props).length) {
          stateRules.push({ selector: rule.selectorText.slice(0, 120), media: mediaCtx || null, props });
        }
      }
    }
  };
  for (const sheet of document.styleSheets) {
    try { if (sheet.cssRules) walk(sheet.cssRules, null); } catch {}
  }

  // parse px breakpoints out of media conditions
  const bpCounts = new Map();
  for (const [cond, count] of mediaConditions) {
    for (const m of cond.matchAll(/(min|max)-width:\s*([\d.]+)(px|em|rem)/g)) {
      let px = parseFloat(m[2]);
      if (m[3] !== 'px') px = px * 16;
      bump(bpCounts, `${Math.round(px)}px (${m[1]})`, count);
    }
  }

  // ---------- layout: containers, grids, gaps ----------
  const maxWidths = new Map(), gridTemplates = new Map(), gaps = new Map(), displays = new Map();
  const els = [...document.querySelectorAll('body *')].slice(0, 5000);
  for (const el of els) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    const s = getComputedStyle(el);
    if (s.maxWidth && s.maxWidth !== 'none' && s.maxWidth.endsWith('px') && r.width > 400) {
      bump(maxWidths, s.maxWidth);
    }
    if (s.display === 'grid') {
      bump(displays, 'grid');
      const cols = s.gridTemplateColumns.split(' ').length;
      if (cols > 1) bump(gridTemplates, `${cols} cols (${s.gridTemplateColumns.slice(0, 80)})`);
      if (s.gap && s.gap !== 'normal') bump(gaps, s.gap);
    } else if (s.display === 'flex') {
      bump(displays, 'flex');
      if (s.gap && s.gap !== 'normal' && s.gap !== '0px') bump(gaps, s.gap);
    }
  }

  // ---------- motion: computed transitions ----------
  const durations = new Map(), easings = new Map();
  for (const el of els.slice(0, 2500)) {
    const s = getComputedStyle(el);
    if (s.transitionDuration && s.transitionDuration !== '0s') {
      for (const d of s.transitionDuration.split(', ')) bump(durations, d);
      for (const e of s.transitionTimingFunction.split(', ')) bump(easings, e);
    }
  }

  // ---------- iconography: inline SVGs ----------
  const iconSizes = new Map(), strokeWidths = new Map();
  let currentColorCount = 0, svgCount = 0;
  for (const svg of [...document.querySelectorAll('svg')].slice(0, 200)) {
    const r = svg.getBoundingClientRect();
    if (r.width === 0 || r.width > 100) continue; // icons, not illustrations/logos
    svgCount++;
    bump(iconSizes, `${Math.round(r.width)}x${Math.round(r.height)}`);
    const sw = svg.getAttribute('stroke-width') || svg.querySelector('[stroke-width]')?.getAttribute('stroke-width');
    if (sw) bump(strokeWidths, sw);
    const markup = svg.outerHTML.slice(0, 500);
    if (/currentColor/.test(markup)) currentColorCount++;
  }

  // ---------- contrast (WCAG) for key pairs ----------
  const lum = (hex) => {
    const c = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
      .map(v => v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  };
  const ratio = (a, b) => {
    const [l1, l2] = [lum(a), lum(b)].sort((x, y) => y - x);
    return Math.round(((l1 + 0.05) / (l2 + 0.05)) * 100) / 100;
  };
  const toHexQuick = (css) => {
    const m = css.match(/rgba?\((\d+)[,\s]+(\d+)[,\s]+(\d+)/);
    return m ? '#' + [m[1], m[2], m[3]].map(v => (+v).toString(16).padStart(2, '0')).join('') : null;
  };
  const contrastChecks = [];
  const seenPairs = new Set();
  const sampleEls = [document.querySelector('h1'), document.querySelector('p'),
    ...[...document.querySelectorAll('button, a[class*="btn" i]')].slice(0, 10)].filter(Boolean);
  for (const el of sampleEls) {
    const s = getComputedStyle(el);
    const fg = toHexQuick(s.color);
    let bgEl = el, bg = null;
    while (bgEl && !bg) {
      const bs = getComputedStyle(bgEl);
      if (bs.backgroundColor && !/rgba?\(\d+[,\s]+\d+[,\s]+\d+[,\s]+0\)/.test(bs.backgroundColor) && bs.backgroundColor !== 'transparent') {
        bg = toHexQuick(bs.backgroundColor);
      }
      bgEl = bgEl.parentElement;
    }
    if (fg && bg && fg !== bg) {
      const key = fg + bg;
      if (seenPairs.has(key)) continue;
      seenPairs.add(key);
      const rt = ratio(fg, bg);
      contrastChecks.push({
        element: el.tagName.toLowerCase() + (el.className && typeof el.className === 'string' ? '.' + el.className.split(/\s+/)[0] : ''),
        fg, bg, ratio: rt,
        passesAA: rt >= 4.5, passesAALarge: rt >= 3,
      });
    }
  }

  // fallback: CSS-in-JS sites often use nested rules the CSSOM walk misses —
  // parse raw <style> text when the object-model walk found nothing
  if (stateRules.length === 0) {
    const css = [...document.querySelectorAll('style')].map(s => s.textContent).join('\n');
    for (const m of css.matchAll(/([^{}]{1,100}):(hover|focus|focus-visible|active)([^{},]{0,60})\{([^{}]{1,250})\}/g)) {
      if (stateRules.length >= 60) break;
      const props = m[4].trim();
      if (/color|decoration|background|opacity|border|outline|transform|shadow/.test(props)) {
        stateRules.push({
          selector: (m[1].trim().split(',').pop() + ':' + m[2] + m[3]).slice(-100),
          media: null, props: { raw: props.slice(0, 200) }, source: 'text-parse',
        });
      }
    }
  }

  // focus ring style
  const focusRules = stateRules.filter(r => /:focus/.test(r.selector) &&
    (r.props['outline'] || r.props['box-shadow'] || /outline|shadow/.test(r.props.raw || '')));

  return JSON.stringify({
    viewport: { width: innerWidth, height: innerHeight },
    breakpoints: topEntries(bpCounts, 12),
    mediaConditionsTop: topEntries(mediaConditions, 10),
    layout: {
      containerMaxWidths: topEntries(maxWidths, 6),
      gridTemplates: topEntries(gridTemplates, 8),
      gaps: topEntries(gaps, 10),
      displayCounts: topEntries(displays, 2),
    },
    states: {
      rules: stateRules.slice(0, 60),
      focusRingExamples: focusRules.slice(0, 5),
    },
    motion: {
      transitionDurations: topEntries(durations, 8),
      easings: topEntries(easings, 6),
      keyframes: keyframes,
      reducedMotionHandled,
    },
    iconography: {
      inlineSvgCount: svgCount,
      commonSizes: topEntries(iconSizes, 6),
      strokeWidths: topEntries(strokeWidths, 4),
      currentColorRatio: svgCount ? Math.round((currentColorCount / svgCount) * 100) / 100 : null,
    },
    contrastChecks,
  });
})()
