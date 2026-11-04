// Tanda 3, trabajador C: interfaz de incursiones aéreas, bombardeos de artillería/misiles, drones y bases.
// API usada por otros módulos (mantener firmas):
//   strikeButtons(pid)  -> elemento con los botones «Bombardear/Incursión» disponibles contra la provincia pid, o null
//   airPanel()          -> panel de la pantalla Ejército con aeronaves, bases, radio y estado de recarga, o null
import { h } from '../util.js';

export function strikeButtons(pid) { void pid; void h; return null; }
export function airPanel() { return null; }
