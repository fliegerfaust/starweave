// Использование: в Playwright — `await page.evaluate(readFileSync("e2e/fit-audit.js", "utf8"))`;
// в браузере — вставить в консоль. Пустой список — всё на месте. Правило Дениса (15.10.2026):
// после любой правки вёрстки проверять, что текст и значки не вылезают из своих плашек.
// Проверка «ничего не вылезает из плашки»: для каждого видимого элемента с текстом или
// значком сравнивает его рамку с рамкой ближайшего «контейнера» (плашка, кнопка, панель,
// окно — всё, у чего есть фон, рамка или скругление) с учётом внутренних отступов.
// Плюс: текст, обрезанный по ширине (scrollWidth > clientWidth), и выход за экран.
// Возвращает список проблем — пустой список значит «всё внутри».
(() => {
  const out = [];
  const vw = innerWidth, vh = innerHeight;
  const boxy = (el) => {
    const s = getComputedStyle(el);
    return s.backgroundImage !== 'none' || (s.backgroundColor !== 'rgba(0, 0, 0, 0)' && s.backgroundColor !== 'transparent') ||
      s.boxShadow.includes('inset') || parseFloat(s.borderRadius) > 0 || parseFloat(s.borderTopWidth) > 0;
  };
  const name = (el) => `${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}${el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : ''}`;
  const visible = (el) => { const s = getComputedStyle(el); const r = el.getBoundingClientRect(); return s.visibility !== 'hidden' && s.display !== 'none' && +s.opacity > 0.05 && r.width > 0 && r.height > 0; };
  const leaves = [...document.querySelectorAll('body *')].filter((el) => visible(el) && !['CANVAS', 'SCRIPT', 'STYLE'].includes(el.tagName) &&
    ([...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()) || ['IMG', 'svg', 'SVG'].includes(el.tagName)));
  const boxes = [...document.querySelectorAll('body *')].filter((el) => visible(el) && boxy(el) && !['CANVAS'].includes(el.tagName));
  for (const el of new Set([...leaves, ...boxes])) {
    if (el.closest('.sys, .pop, .flash, .card, .sky')) continue;
    const r = el.getBoundingClientRect();
    if (r.right > vw + 1 || r.left < -1 || r.bottom > vh + 1) out.push(`за экраном: ${name(el)} «${el.textContent.trim().slice(0, 24)}»`);
    if (el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).overflow !== 'visible') out.push(`обрезан текст: ${name(el)}`);
    let p = el.parentElement;
    while (p && p !== document.body && !boxy(p)) p = p.parentElement;
    if (!p || p === document.body) continue;
    const pr = p.getBoundingClientRect(), s = getComputedStyle(p);
    const padL = Math.min(parseFloat(s.paddingLeft), 6), padR = Math.min(parseFloat(s.paddingRight), 6);
    if (r.left < pr.left + padL - 1 || r.right > pr.right - padR + 1 || r.top < pr.top - 1 || r.bottom > pr.bottom + 1)
      out.push(`вылезает: ${name(el)} «${el.textContent.trim().slice(0, 24)}» из ${name(p)} (${Math.round(r.right - pr.right)}px справа)`);
  }
  return [...new Set(out)];
})();
