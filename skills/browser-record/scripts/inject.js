// Injected into every page/frame of the recording session (via addInitScript).
// Captures human interactions as SEMANTIC steps (not raw x/y) and buffers them in
// window.__rr_events (mirrored to localStorage so they survive same-origin
// navigations). The Node side polls + drains this buffer via page.evaluate.
// (We avoid page.exposeBinding because it does not wire up over Browserbase CDP.)
(() => {
  if (window.__rr_installed) return;
  window.__rr_installed = true;
  const KEY = '__rr_buf';

  // restore anything buffered before a navigation
  window.__rr_events = window.__rr_events || (() => {
    try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { return []; }
  })();

  const send = (ev) => {
    window.__rr_events.push(ev);
    try { localStorage.setItem(KEY, JSON.stringify(window.__rr_events)); } catch (_) {}
  };
  const now = () => Date.now();
  const esc = (s) => { try { return CSS.escape(s); } catch { return s; } };

  function cssPath(el) {
    if (!(el instanceof Element)) return '';
    const parts = [];
    while (el && el.nodeType === 1 && parts.length < 6) {
      if (el.id) { parts.unshift('#' + esc(el.id)); break; }
      let nth = 1, sib = el;
      while ((sib = sib.previousElementSibling)) if (sib.nodeName === el.nodeName) nth++;
      parts.unshift(el.nodeName.toLowerCase() + ':nth-of-type(' + nth + ')');
      el = el.parentElement;
    }
    return parts.join(' > ');
  }

  function xPath(el) {
    if (el.id) return '//*[@id="' + el.id + '"]';
    const parts = [];
    while (el && el.nodeType === 1) {
      let i = 1, sib = el;
      while ((sib = sib.previousElementSibling)) if (sib.nodeName === el.nodeName) i++;
      parts.unshift(el.nodeName.toLowerCase() + '[' + i + ']');
      el = el.parentElement;
    }
    return '/' + parts.join('/');
  }

  function accName(el) {
    const g = (a) => (el.getAttribute && el.getAttribute(a)) || '';
    return (g('aria-label') || g('placeholder') || g('name') || g('title') || '').trim();
  }

  // The INTENT signal: the human-meaningful name of what was acted on, recovered
  // ungated (not limited to certain tags) so an autocomplete suggestion ("New
  // York") is captured even when its only selector is a dynamic id. Priority:
  // explicit aria > labelledby > placeholder/title/alt > value > visible text.
  function nameOf(el) {
    const g = (a) => (el.getAttribute && el.getAttribute(a)) || '';
    let lbl = '';
    const lb = g('aria-labelledby');
    if (lb) lbl = lb.split(/\s+/).map((id) => (document.getElementById(id) || {}).innerText || '').join(' ').trim();
    const text = (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim();
    const cand = g('aria-label') || lbl || g('placeholder') || g('title') || g('alt')
      || (el.tagName === 'INPUT' ? el.value : '') || text;
    return (cand || '').slice(0, 120);
  }
  function roleOf(el) {
    return ((el.getAttribute && el.getAttribute('role')) || el.tagName || '').toLowerCase();
  }

  // Chrome DevTools Recorder format: selectors is an array of selector-groups,
  // tried in priority order during replay. This list IS the healing.
  function selectorsFor(el) {
    const out = [];
    if (el.id) out.push('#' + esc(el.id));
    const an = accName(el);
    if (an) out.push('aria/' + an.slice(0, 80));
    const txt = (el.innerText || el.textContent || '').trim();
    if (txt && txt.length <= 60 && ['BUTTON', 'A', 'SUMMARY', 'LABEL', 'SPAN'].includes(el.tagName)) {
      out.push('text/' + txt);
    }
    out.push(cssPath(el));
    out.push('xpath/' + xPath(el));
    return out.filter(Boolean).map((s) => [s]);
  }

  document.addEventListener('click', (e) => {
    const el = e.target;
    if (!el || el.nodeType !== 1) return;
    send({ type: 'click', name: nameOf(el), role: roleOf(el), selectors: selectorsFor(el), url: location.href, ts: now() });
  }, true);

  // 'change' fires on commit/blur -> captures the final field value, not keystrokes.
  document.addEventListener('change', (e) => {
    const el = e.target;
    if (!el || el.nodeType !== 1) return;
    const value = ('value' in el) ? el.value : '';
    send({ type: 'change', name: nameOf(el), role: roleOf(el), selectors: selectorsFor(el), value, url: location.href, ts: now() });
  }, true);

  document.addEventListener('keydown', (e) => {
    if (['Enter', 'Tab', 'Escape'].includes(e.key)) {
      send({ type: 'keyDown', key: e.key, url: location.href, ts: now() });
    }
  }, true);

  let st;
  window.addEventListener('scroll', () => {
    clearTimeout(st);
    st = setTimeout(() => send({ type: 'scroll', x: window.scrollX, y: window.scrollY, url: location.href, ts: now() }), 400);
  }, true);
})();
