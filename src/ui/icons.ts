/**
 * Линейные значки интерфейса: один штрих 1.5 на сетке 24×24, цвет — currentColor.
 * Рисуем кодом, как и всю графику игры.
 */
const PATHS = {
  guide: '<path d="M4 5.5C4 4.7 4.7 4 5.5 4H11v15.5H5.5A1.5 1.5 0 0 1 4 18Z"/><path d="M20 5.5c0-.8-.7-1.5-1.5-1.5H13v15.5h5.5c.8 0 1.5-.7 1.5-1.5Z"/><path d="M11 19.5h2"/>',
  archive: '<rect x="3.5" y="5" width="17" height="15" rx="2.5"/><path d="M3.5 9.5h17M8 3v4M16 3v4"/><path d="m12 12.2.9 1.8 2 .3-1.45 1.4.35 2-1.8-.95-1.8.95.35-2-1.45-1.4 2-.3Z"/>',
  codex: '<circle cx="12" cy="12" r="8.5"/><path d="M12 3.5v17M3.5 12h17"/><circle cx="12" cy="12" r="3.2"/>',
  settings: '<path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/>',
  learn: '<path d="M12 4 3 8.5l9 4.5 9-4.5Z"/><path d="M7 10.8V15c0 1.4 2.2 3 5 3s5-1.6 5-3v-4.2"/>',
  play: '<path d="M8 5.5v13l10.5-6.5Z"/>',
  daily: '<path d="M15.5 4.5a7.5 7.5 0 1 0 4 11.6A6 6 0 0 1 15.5 4.5Z"/>',
  astrolabe: '<circle cx="12" cy="13" r="7"/><circle cx="12" cy="13" r="3.5"/><path d="M4.5 16.5 19.5 9.5M12 6V3.5"/><circle cx="12" cy="3" r="1"/>',
  // Карта главы: ночи, колода, пройдено, звёздность
  midnight: '<path d="M12 3c.6 4.6 2.4 6.4 7 7-4.6.6-6.4 2.4-7 7-.6-4.6-2.4-6.4-7-7 4.6-.6 6.4-2.4 7-7Z"/><path d="M18.5 3.5v3M17 5h3"/>',
  deck: '<rect x="8" y="4" width="11" height="15" rx="2"/><path d="M5 7.5V18a2 2 0 0 0 2 2h8"/>',
  check: '<path d="m6 12.5 4 4 8-9"/>',
  back: '<path d="M19 12H6M11 6l-6 6 6 6"/>',
  star: '<path d="m12 4 2.3 4.9 5.2.6-3.9 3.6 1.1 5.2L12 15.6l-4.7 2.7 1.1-5.2-3.9-3.6 5.2-.6Z"/>',
} as const;

export type IconName = keyof typeof PATHS;

export function icon(name: IconName, className = 'icon'): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('class', className);
  svg.setAttribute('aria-hidden', 'true');
  svg.innerHTML = PATHS[name];
  return svg;
}
