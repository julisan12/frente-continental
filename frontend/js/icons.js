// Iconos SVG en linea (sin librerias externas). Viewbox 24x24, trazo.
import { h } from './util.js';

const P = {
  map: 'M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2z M9 4v14 M15 6v14',
  flag: 'M5 21V4 M5 4h11l-2 4 2 4H5',
  coins: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z M12 7v10 M9.5 9.5C9.5 8.5 10.5 8 12 8s2.5.6 2.5 1.6-1 1.4-2.5 1.8-2.5.7-2.5 1.8S10.5 16 12 16s2.5-.5 2.5-1.5',
  chart: 'M4 20V4 M4 20h16 M8 16v-5 M12 16V8 M16 16v-3',
  shield: 'M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z',
  rings: 'M2 12a5 5 0 0 1 10 0 5 5 0 0 1-10 0z M12 12a5 5 0 0 1 10 0 5 5 0 0 1-10 0z',
  menu: 'M4 7h16 M4 12h16 M4 17h16',
  star: 'M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z',
  plus: 'M12 5v14 M5 12h14',
  minus: 'M5 12h14',
  target: 'M12 3v4 M12 17v4 M3 12h4 M17 12h4 M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z',
  undo: 'M9 7 4 12l5 5 M4 12h10a6 6 0 0 1 0 8h-3',
  trash: 'M5 7h14 M9 7V4h6v3 M7 7l1 13h8l1-13',
  close: 'M6 6l12 12 M18 6 6 18',
  check: 'M5 12l5 5 9-10',
  swords: 'M5 19 19 5 M14 5h5v5 M19 19 5 5 M10 5H5v5',
  factory: 'M3 21V11l6 4v-4l6 4V6h4v15z',
  road: 'M8 21l2-18 M16 21l-2-18 M12 5v3 M12 11v3 M12 17v3',
  port: 'M12 3a2 2 0 1 0 0 4 2 2 0 0 0 0-4z M12 7v14 M6 13a6 6 0 0 0 12 0 M8 11h8',
  school: 'M2 9l10-5 10 5-10 5z M6 11v5c3 2 9 2 12 0v-5',
  barracks: 'M3 20 12 4l9 16z M12 20v-6',
  hourglass: 'M6 3h12 M6 21h12 M7 3c0 5 5 6 5 9s-5 4-5 9 M17 3c0 5-5 6-5 9s5 4 5 9',
  globe: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z M3 12h18 M12 3c3 3 3 15 0 18 M12 3c-3 3-3 15 0 18',
  alert: 'M12 3 22 21H2z M12 10v5 M12 18v.01',
  info: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z M12 11v6 M12 7v.01',
  up: 'M6 15l6-6 6 6',
  down: 'M6 9l6 6 6-6',
  news: 'M4 5h13v14H4z M17 8h3v9a2 2 0 0 1-2 2 M7 9h7 M7 12h7 M7 15h5',
  settings: 'M4 7h10 M18 7h2 M4 17h2 M10 17h10 M16 5v4 M8 15v4',
  heart: 'M12 21s-7-4.5-7-10a4 4 0 0 1 7-2 4 4 0 0 1 7 2c0 5.5-7 10-7 10z',
  helmet: 'M4 14a8 8 0 0 1 16 0z M3 14h18 M4 18h16',
  people: 'M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M3 20c0-3.5 2.7-6 6-6s6 2.5 6 6 M17 8a2.5 2.5 0 0 1 0 5 M18 14c2 .6 3 2.5 3 5',
  tank: 'M3 15h18l-2 4H5z M7 15v-4h8l3 2 M15 11V9h5',
  plane: 'M12 3v18 M12 8 3 14v2l9-3 9 3v-2z',
  play: 'M7 4l13 8-13 8z',
  infantry: 'M12 3a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5z M8 21l1.5-7L7 12l2-3h6l2 3-2.5 2L16 21 M15 9l4-5',
  artillery: 'M3 18a2.5 2.5 0 1 0 5 0 2.5 2.5 0 0 0-5 0z M10 18a2.5 2.5 0 1 0 5 0 2.5 2.5 0 0 0-5 0z M5 15l6-3 10-6 M11 12l3 4',
  base: 'M3 21h18 M5 21V10l7-5 7 5v11 M9 21v-5h6v5 M12 5V2l4 1.5L12 5',
  refinery: 'M3 21h18 M5 21V11h4v10 M11 21V7h4v14 M17 21v-6h3v6 M7 11V8 M13 7V4 M16 3c1 1 1 2 0 3',
  mine: 'M3 21h18 M5 21l3-9h8l3 9 M8 12V8h8v4 M12 8V4 M9 16h6',
  oil: 'M12 3s-6 7-6 11a6 6 0 0 0 12 0c0-4-6-11-6-11z M9.5 14a2.5 2.5 0 0 0 2.5 2.5',
  gas: 'M12 3c1 3 5 5 5 10a5 5 0 0 1-10 0c0-3 2-4 2-7 1.5 1 2 2.5 2 4 1-1 1-4 1-7z',
  minerals: 'M6 9l3-5h6l3 5-6 11z M6 9h12 M9 4l3 5 3-5 M12 9v11',
  agri: 'M12 21V9 M12 9c0-3 2-5 5-5 0 3-2 5-5 5z M12 13c0-3-2-5-5-5 0 3 2 5 5 5z M12 17c0-2.5 2-4 4.5-4 0 2.5-2 4-4.5 4z M4 21h16',
  crane: 'M6 21V4h1 M6 4h14 M6 7l3-3 M17 4v5 M15.5 9h3v3h-3z M3 21h8',
  derrick: 'M3 21h18 M7 21l5-18 5 18 M8.5 15h7 M10 9h4 M12 3v2',
  // Tanda 1: infraestructura, recursos, unidades y noticias
  lab: 'M9 3h6 M10 3v6l-5 9a2 2 0 0 0 2 3h10a2 2 0 0 0 2-3l-5-9V3 M8 15h8',
  rail: 'M6 21 10 3 M18 21 14 3 M7 9h10 M6 14h12 M5 18h14',
  fort: 'M4 21V8h3V5h3v3h4V5h3v3h3v13z M10 21v-5h4v5',
  trench: 'M3 17c3 0 3-4 6-4s3 4 6 4 3-4 6-4 M3 12c3 0 3-4 6-4s3 4 6 4 3-4 6-4 M4 21h16',
  truck: 'M3 7h11v9H3z M14 10h4l3 3v3h-7 M6 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4z M17 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4z',
  mountain: 'M3 20 10 7l3 5 2-3 6 11z M8 11l2 2 2-2',
  anchor: 'M12 3a2 2 0 1 0 0 4 2 2 0 0 0 0-4z M12 7v14 M5 13a7 7 0 0 0 14 0 M3 13h4 M17 13h4',
  wheat: 'M12 21V9 M12 9c-3 0-5-2-5-5 3 0 5 2 5 5z M12 9c3 0 5-2 5-5-3 0-5 2-5 5z M12 14c-3 0-5-2-5-5 3 0 5 2 5 5z M12 14c3 0 5-2 5-5-3 0-5 2-5 5z',
  box: 'M3 8l9-5 9 5v9l-9 5-9-5z M3 8l9 5 9-5 M12 13v9',
  ingot: 'M3 17 6 7h12l3 10z M7 12h10',
  fire: 'M12 3c1 4 5 6 5 11a5 5 0 0 1-10 0c0-3 2-4 2-6 1 1 2 2 2 3 1-2 1-5 1-8z',
  platoon: 'M4 4h6v6H4z M14 4h6v6h-6z M4 14h6v6H4z M14 14h6v6h-6z',
  tv: 'M3 5h18v12H3z M8 21h8 M12 17v4',
  shortage: 'M12 3 22 21H2z M12 10v4 M12 17v.01 M4 4l16 16',
  cart: 'M3 4h3l2 11h11l2-7H7 M9 20a1 1 0 1 0 0-2 1 1 0 0 0 0 2z M17 20a1 1 0 1 0 0-2 1 1 0 0 0 0 2z',
  loot: 'M4 8h16v12H4z M4 8l2-4h12l2 4 M12 8v12 M9 14h6',
  sword: 'M14 4l6 6-9 9-6-6z M5 13l-2 2 2 2 2 2 2-2 M19 5l-1 1',
};
export const ICON_PATHS = P;

export function icon(name, cls) {
  const d = P[name] || P.info;
  const span = h('span', { class: 'ico' + (cls ? ' ' + cls : ''), 'aria-hidden': 'true' });
  span.innerHTML = '<svg viewBox="0 0 24 24" focusable="false"><path d="' + d + '"/></svg>';
  return span;
}
export const iconNames = Object.keys(P);

export function emblem() {
  const d = h('div', { class: 'emblem', 'aria-hidden': 'true' });
  d.innerHTML =
    '<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">' +
    '<path d="M24 6l12 5v11c0 8-5 14-12 17-7-3-12-9-12-17V11z"/>' +
    '<path d="M24 14l2.6 5.4 5.9.8-4.3 4.1 1 5.9L24 27.5 18.8 30.2l1-5.9-4.3-4.1 5.9-.8z" fill="currentColor" fill-opacity=".25"/>' +
    '<path d="M8 20c-3 6-2 14 4 20 M40 20c3 6 2 14-4 20" stroke-opacity=".7"/></svg>';
  return d;
}
