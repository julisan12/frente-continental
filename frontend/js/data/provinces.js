// Divisiones politicas internas (provincias/estados/departamentos) con centroide aproximado y tipo de terreno.
// Terreno: S selva, M montana, D desierto, P pampa, V sabana, B bosque, E estepa, T tropical, A altiplano
const RAW = {
  Argentina: 'Buenos Aires,-36.7,-60,P;Catamarca,-27.3,-67,D;Chaco,-26.4,-60.8,B;Chubut,-43.8,-68.5,E;Córdoba,-32.1,-63.8,P;Corrientes,-28.8,-57.8,V;Entre Ríos,-32,-59.2,P;Formosa,-24.9,-59.9,B;Jujuy,-23.3,-65.8,A;La Pampa,-37.1,-65.4,P;La Rioja,-29.7,-67.2,D;Mendoza,-34.6,-68.6,D;Misiones,-26.9,-54.6,S;Neuquén,-38.6,-70.1,M;Río Negro,-40.4,-67.2,E;Salta,-24.3,-64.8,M;San Juan,-30.9,-68.9,D;San Luis,-33.8,-66,E;Santa Cruz,-48.8,-69.9,E;Santa Fe,-30.7,-60.9,P;Santiago del Estero,-27.8,-63.3,B;Tierra del Fuego,-54.3,-67.7,E;Tucumán,-27,-65.4,B',
  Chile: 'Arica y Parinacota,-18.5,-69.6,D;Tarapacá,-20.2,-69.4,D;Antofagasta,-23.6,-69.1,D;Atacama,-27.4,-69.9,D;Coquimbo,-30.6,-70.9,E;Valparaíso,-32.9,-71,B;Metropolitana,-33.6,-70.6,P;O\'Higgins,-34.4,-71,P;Maule,-35.5,-71.5,P;Ñuble,-36.6,-72,B;Biobío,-37.5,-72.4,B;Araucanía,-38.7,-72.5,B;Los Ríos,-40,-72.6,B;Los Lagos,-41.9,-72.9,B;Aysén,-46.4,-73,M;Magallanes,-52.5,-71.5,E',
  Mexico: 'Aguascalientes,21.9,-102.3,E;Baja California,30.5,-115.4,D;Baja California Sur,25.9,-111.9,D;Campeche,18.8,-90.4,S;Chiapas,16.5,-92.5,S;Chihuahua,28.8,-106.1,D;Coahuila,27.3,-102,D;Colima,19.1,-103.9,T;Ciudad de México,19.4,-99.1,M;Durango,24.6,-104.7,M;Guanajuato,21,-101,E;Guerrero,17.6,-99.9,M;Hidalgo,20.5,-98.9,M;Jalisco,20.6,-103.6,B;México,19.3,-99.7,M;Michoacán,19.2,-101.9,B;Morelos,18.7,-99.1,T;Nayarit,21.8,-104.9,T;Nuevo León,25.6,-99.9,E;Oaxaca,17,-96.5,M;Puebla,19,-97.9,M;Querétaro,20.8,-99.9,E;Quintana Roo,19.6,-88,S;San Luis Potosí,22.6,-100.4,E;Sinaloa,25,-107.5,T;Sonora,29.6,-110.6,D;Tabasco,17.9,-92.6,S;Tamaulipas,24,-98.6,V;Tlaxcala,19.4,-98.2,M;Veracruz,19.4,-96.4,T;Yucatán,20.7,-89,S;Zacatecas,23.3,-102.7,E',
  Brazil: 'Acre,-9,-70.5,S;Alagoas,-9.6,-36.6,T;Amapá,1.4,-51.8,S;Amazonas,-4.2,-64.6,S;Bahia,-12.5,-41.7,V;Ceará,-5.3,-39.3,D;Distrito Federal,-15.8,-47.8,V;Espírito Santo,-19.6,-40.6,T;Goiás,-16,-49.6,V;Maranhão,-5,-45.3,V;Mato Grosso,-13,-56.1,V;Mato Grosso do Sul,-20.5,-54.8,V;Minas Gerais,-18.5,-44.6,M;Pará,-4,-52.5,S;Paraíba,-7.1,-36.7,D;Paraná,-24.6,-51.6,B;Pernambuco,-8.3,-37.9,D;Piauí,-7.7,-42.7,D;Rio de Janeiro,-22.3,-42.6,T;Rio Grande do Norte,-5.8,-36.6,D;Rio Grande do Sul,-29.7,-53.2,P;Rondônia,-10.9,-62.8,S;Roraima,2.1,-61.4,S;Santa Catarina,-27.2,-50.5,B;São Paulo,-22.2,-48.7,B;Sergipe,-10.6,-37.4,T;Tocantins,-10.2,-48.3,V',
  Bolivia: 'Pando,-11.3,-67.5,S;Beni,-14.4,-65,S;La Paz,-15.5,-68.3,A;Oruro,-18.3,-67.5,A;Potosí,-20.5,-66.6,A;Cochabamba,-17.5,-65.8,M;Chuquisaca,-20,-64.2,M;Tarija,-21.6,-64,B;Santa Cruz,-17.5,-61.5,V',
  Peru: 'Amazonas,-5.1,-78,S;Áncash,-9.4,-77.6,M;Apurímac,-14,-73,M;Arequipa,-15.8,-72.5,D;Ayacucho,-13.6,-74.1,M;Cajamarca,-6.5,-78.6,M;Cusco,-13.2,-72,M;Huancavelica,-12.9,-75,M;Huánuco,-9.4,-75.9,M;Ica,-14.2,-75.5,D;Junín,-11.5,-75,M;La Libertad,-8,-78.4,D;Lambayeque,-6.4,-79.8,D;Lima,-11.8,-76.6,D;Loreto,-4.3,-75,S;Madre de Dios,-11.8,-70.8,S;Moquegua,-16.9,-70.9,D;Pasco,-10.4,-75.3,M;Piura,-5.1,-80.3,D;Puno,-15,-70,A;San Martín,-7,-76.8,S;Tacna,-17.7,-70.4,D;Tumbes,-3.8,-80.5,T;Ucayali,-9.6,-73.5,S',
  Colombia: 'Amazonas,-1.5,-71.5,S;Antioquia,7,-75.5,M;Arauca,6.6,-71,V;Atlántico,10.7,-74.9,T;Bolívar,8.6,-74.3,T;Boyacá,5.5,-73.3,M;Caldas,5.3,-75.3,M;Caquetá,0.9,-73.8,S;Casanare,5.3,-71.6,V;Cauca,2.4,-76.8,M;Cesar,9.3,-73.6,T;Chocó,5.7,-76.7,S;Córdoba,8.4,-75.8,T;Cundinamarca,4.9,-74,M;Guainía,2.6,-68.5,S;Guaviare,2,-72.3,S;Huila,2.5,-75.5,M;La Guajira,11.4,-72.5,D;Magdalena,10.2,-74.2,T;Meta,3.3,-73,V;Nariño,1.3,-77.6,M;Norte de Santander,8,-72.9,M;Putumayo,0.5,-76,S;Risaralda,5,-75.9,M;Santander,6.7,-73.3,M;Sucre,9,-75.1,T;Tolima,4,-75.2,M;Valle del Cauca,3.8,-76.5,T;Vaupés,0.6,-70.5,S;Vichada,4.7,-69.4,V',
  Venezuela: 'Amazonas,3.4,-65.9,S;Anzoátegui,8.6,-64.2,V;Apure,7,-68.7,V;Aragua,10,-67.3,M;Barinas,8.3,-70.2,V;Bolívar,6.4,-63.5,S;Carabobo,10.1,-68,T;Cojedes,9.4,-68.3,V;Delta Amacuro,8.9,-61.4,S;Falcón,11.2,-69.8,D;Guárico,8.8,-66.4,V;Lara,10.1,-69.7,D;Mérida,8.4,-71.2,M;Miranda,10.2,-66.4,T;Monagas,9.3,-63.2,V;Nueva Esparta,11,-63.9,T;Portuguesa,9.1,-69.3,V;Sucre,10.4,-63.4,T;Táchira,7.9,-72,M;Trujillo,9.4,-70.4,M;Yaracuy,10.3,-68.7,T;Zulia,10,-72.1,T',
  Ecuador: 'Esmeraldas,0.9,-79.4,S;Manabí,-0.9,-80.2,T;Santa Elena,-2.2,-80.6,D;Guayas,-2,-79.9,T;Los Ríos,-1.4,-79.5,T;El Oro,-3.5,-79.8,T;Santo Domingo,-0.25,-79.2,T;Carchi,0.7,-78,M;Imbabura,0.35,-78.4,M;Pichincha,-0.2,-78.6,M;Cotopaxi,-0.8,-78.8,M;Tungurahua,-1.25,-78.5,M;Bolívar,-1.6,-79,M;Chimborazo,-1.9,-78.7,M;Cañar,-2.5,-79,M;Azuay,-3,-79.2,M;Loja,-4,-79.6,M;Sucumbíos,0.1,-76.6,S;Napo,-0.9,-77.7,S;Orellana,-0.8,-76.3,S;Pastaza,-1.9,-76.8,S;Morona Santiago,-2.6,-77.9,S;Zamora Chinchipe,-4.1,-78.8,S',
  Paraguay: 'Alto Paraguay,-20.5,-59.5,B;Boquerón,-22,-60.8,B;Presidente Hayes,-23.5,-59,V;Concepción,-22.9,-57.3,V;Amambay,-22.8,-56,B;San Pedro,-24.2,-56.6,V;Canindeyú,-24.2,-55.4,S;Cordillera,-25.3,-57,P;Central,-25.4,-57.5,P;Paraguarí,-25.9,-57,P;Caaguazú,-25.4,-56,B;Alto Paraná,-25.4,-54.8,S;Guairá,-25.8,-56.3,B;Caazapá,-26.2,-55.9,B;Itapúa,-26.8,-55.8,B;Misiones,-26.8,-57.1,V;Ñeembucú,-27,-58,V',
  Uruguay: 'Artigas,-30.6,-56.8,P;Salto,-31.4,-57,P;Paysandú,-32.1,-57.3,P;Río Negro,-32.7,-57.5,P;Soriano,-33.5,-57.7,P;Colonia,-34.2,-57.6,P;San José,-34.3,-56.8,P;Montevideo,-34.85,-56.2,P;Canelones,-34.5,-55.9,P;Maldonado,-34.6,-55,P;Rocha,-34,-54,P;Treinta y Tres,-33.1,-54.4,P;Cerro Largo,-32.3,-54.4,P;Rivera,-31.4,-55.5,P;Tacuarembó,-31.8,-55.9,P;Durazno,-33,-56.3,P;Flores,-33.6,-56.9,P;Florida,-33.9,-56,P;Lavalleja,-33.9,-55,M',
  Cuba: 'Pinar del Río,22.4,-83.7,T;Artemisa,22.8,-82.8,T;La Habana,23.1,-82.4,T;Mayabeque,22.9,-81.9,T;Matanzas,22.6,-81.2,T;Cienfuegos,22.2,-80.4,T;Villa Clara,22.5,-79.9,T;Sancti Spíritus,21.9,-79.4,T;Ciego de Ávila,21.9,-78.6,T;Camagüey,21.4,-77.9,V;Las Tunas,21,-76.9,V;Holguín,20.8,-75.8,M;Granma,20.3,-76.9,M;Santiago de Cuba,20.1,-76,M;Guantánamo,20.2,-74.9,M;Isla de la Juventud,21.7,-82.8,T',
  Guatemala: 'Petén,16.9,-90,S;Izabal,15.5,-88.8,S;Alta Verapaz,15.6,-90.2,S;Baja Verapaz,15.1,-90.3,M;Quiché,15.4,-91,M;Huehuetenango,15.6,-91.6,M;San Marcos,15,-91.9,M;Quetzaltenango,14.8,-91.6,M;Retalhuleu,14.4,-91.7,T;Escuintla,14.1,-90.9,T;Guatemala,14.6,-90.5,M;Zacapa,15,-89.5,D;Chiquimula,14.7,-89.5,M;Jutiapa,14.2,-89.9,T;Santa Rosa,14.1,-90.3,T',
  Honduras: 'Cortés,15.4,-88,T;Atlántida,15.6,-87,T;Colón,15.6,-85.8,S;Gracias a Dios,15.2,-84.3,S;Olancho,14.8,-85.9,B;Yoro,15.2,-87.2,B;Santa Bárbara,15,-88.3,M;Copán,14.8,-88.9,M;Lempira,14.3,-88.6,M;Intibucá,14.3,-88.2,M;Comayagua,14.5,-87.7,M;Francisco Morazán,14.2,-87.2,M;El Paraíso,13.9,-86.5,B;Choluteca,13.3,-87.1,T;Valle,13.5,-87.6,T;La Paz,14.1,-87.8,M',
  Nicaragua: 'Nueva Segovia,13.7,-86.2,B;Madriz,13.5,-86.5,M;Estelí,13.1,-86.4,M;Jinotega,13.6,-85.6,B;Chinandega,12.8,-87.1,T;León,12.5,-86.7,T;Matagalpa,12.9,-85.7,B;Managua,12.2,-86.3,T;Masaya,12,-86.1,T;Granada,11.9,-85.9,T;Carazo,11.7,-86.3,T;Rivas,11.4,-85.8,T;Boaco,12.5,-85.5,B;Chontales,12,-85.1,V;Río San Juan,11.2,-84.6,S;Costa Caribe Norte,14,-84,S;Costa Caribe Sur,12.4,-84.1,S',
  'Costa Rica': 'Guanacaste,10.5,-85.4,V;Alajuela,10.4,-84.4,T;Heredia,10.5,-84,S;San José,9.6,-84,M;Cartago,9.8,-83.7,M;Limón,9.9,-83.3,S;Puntarenas,9,-83.4,T',
  Panama: 'Bocas del Toro,9.1,-82.4,S;Chiriquí,8.4,-82.4,M;Ngäbe-Buglé,8.6,-81.7,M;Veraguas,8.2,-81,T;Herrera,7.8,-80.7,V;Los Santos,7.5,-80.3,V;Coclé,8.5,-80.4,V;Colón,9.2,-79.8,S;Panamá,8.9,-79.3,T;Panamá Oeste,8.8,-79.9,T;Guna Yala,9.3,-78.4,S;Darién,8.1,-77.7,S',
  'El Salvador': 'Ahuachapán,13.9,-89.8,T;Santa Ana,14.1,-89.5,M;Sonsonate,13.7,-89.7,T;Chalatenango,14.1,-89,M;La Libertad,13.6,-89.3,T;San Salvador,13.7,-89.2,T;Cuscatlán,13.8,-88.9,T;La Paz,13.5,-89,T;Cabañas,13.9,-88.7,M;San Vicente,13.6,-88.7,T;Usulután,13.4,-88.5,T;San Miguel,13.5,-88.2,T;Morazán,13.8,-88.1,M;La Unión,13.5,-87.9,T',
  Belize: 'Corozal,18.2,-88.5,T;Orange Walk,17.8,-88.8,S;Belize,17.4,-88.4,T;Cayo,17,-88.9,S;Stann Creek,16.8,-88.4,S;Toledo,16.3,-89,S',
  Guyana: 'Barima-Waini,7.5,-59.8,S;Pomeroon-Supenaam,7.2,-58.7,S;Essequibo-Demerara Oeste,6.7,-58.3,T;Demerara-Mahaica,6.6,-58,T;Mahaica-Berbice,6.2,-57.6,T;Berbice-Corentyne,4.5,-57.6,S;Cuyuni-Mazaruni,6.3,-60.2,S;Potaro-Siparuni,4.8,-59.2,S;Alto Takutu-Esequibo,2.9,-59,V;Alto Demerara-Berbice,5.4,-58.3,S',
  Suriname: 'Paramaribo,5.85,-55.2,T;Wanica,5.75,-55.3,T;Nickerie,5.6,-56.9,T;Coronie,5.8,-56.2,T;Saramacca,5.6,-55.8,T;Commewijne,5.75,-54.9,T;Marowijne,5.4,-54.3,S;Para,5.3,-55.2,S;Brokopondo,4.8,-55.2,S;Sipaliwini,3.5,-56,S',
  Haiti: 'Nord-Ouest,19.8,-73,D;Nord,19.6,-72.3,M;Nord-Est,19.5,-71.9,T;Artibonite,19.2,-72.5,T;Centre,19,-71.9,M;Ouest,18.5,-72.3,M;Grand\'Anse,18.5,-74,M;Nippes,18.4,-73.3,M;Sud,18.25,-73.7,T;Sud-Est,18.25,-72.4,M',
  'Dominican Rep.': 'Santo Domingo,18.5,-69.9,T;Santiago,19.4,-70.8,M;La Vega,19.1,-70.6,M;Puerto Plata,19.7,-70.8,T;Montecristi,19.7,-71.5,D;Dajabón,19.4,-71.6,D;San Juan,18.8,-71.3,M;Barahona,18.1,-71.2,D;Pedernales,17.9,-71.6,D;Azua,18.5,-70.8,D;San Cristóbal,18.5,-70.2,T;Duarte,19.3,-70.1,T;Samaná,19.2,-69.4,T;El Seibo,18.8,-69,T;La Altagracia,18.6,-68.5,T;San Pedro de Macorís,18.5,-69.3,T',
  Jamaica: 'Hanover,18.4,-78.1,T;Westmoreland,18.25,-78.1,T;St James,18.4,-77.85,T;Trelawny,18.35,-77.6,M;St Elizabeth,18.05,-77.7,T;Manchester,18.05,-77.5,M;St Ann,18.35,-77.25,M;Clarendon,18,-77.25,T;St Catherine,18.05,-77,T;St Mary,18.3,-76.9,T;St Andrew,18.07,-76.75,M;Portland,18.1,-76.45,M;St Thomas,17.95,-76.45,M',
};

export const toXY = (lat, lon) => [5.69998 * lon + 678.1274, -5.69804 * lat + 188.1328];

export const PROV = {};
for (const [id, s] of Object.entries(RAW)) {
  PROV[id] = s.split(';').map((r) => {
    const p = r.split(',');
    return [p[0], +p[1], +p[2], p[3]];
  });
}


// ------------------------------------------------------------------ variantes de mapa (Tanda 2)
const SUR_IDS = ['Argentina', 'Bolivia', 'Brazil', 'Chile', 'Colombia', 'Ecuador', 'Guyana', 'Paraguay', 'Peru', 'Suriname', 'Uruguay', 'Venezuela'];
export const VARIANTS = {
  latam: { name: 'Latinoamérica', desc: 'Los 24 países, de México al Cono Sur.', ids: null, viewBox: '0 0 500 535' },
  sur: { name: 'América del Sur', desc: 'Solo Sudamérica: 12 países, partida más densa.', ids: SUR_IDS, viewBox: '200 105 290 410' },
};
export const variant_of = (game) => (game && VARIANTS[game.variant] ? game.variant : 'latam');

// ------------------------------------------------------------------ subdivision de provincias (densidad 2)
const AREA_MIN = 16; // unidades^2 del mapa por provincia como minimo
const fromXY = (x, y) => [(188.1328 - y) / 5.69804, (x - 678.1274) / 5.69998];

function parsePolys(path) {
  const polys = [];
  for (const sub of String(path || '').split('M').filter((t) => t.trim())) {
    const pts = sub.replace(/[ZzL]/g, ' ').trim().split(/\s+/).map((t) => t.split(',').map(Number)).filter((q) => q.length === 2 && isFinite(q[0]) && isFinite(q[1]));
    if (pts.length >= 3) polys.push(pts);
  }
  return polys;
}
function polysArea(polys) {
  let a = 0;
  for (const pl of polys) {
    let s = 0;
    for (let i = 0, j = pl.length - 1; i < pl.length; j = i++) s += pl[j][0] * pl[i][1] - pl[i][0] * pl[j][1];
    a += Math.abs(s) / 2;
  }
  return a;
}
function inPolys(polys, x, y) {
  let ins = false;
  for (const pl of polys) {
    for (let i = 0, j = pl.length - 1; i < pl.length; j = i++) {
      const [xi, yi] = pl[i], [xj, yj] = pl[j];
      if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) ins = !ins;
    }
  }
  return ins;
}
export function country_area(path) { return polysArea(parsePolys(path)); }

/**
 * Subdivide determinista de las provincias de un pais. rows = [[nombre, lat, lon, terreno], ...].
 * Devuelve filas [nombre, lat, lon, terreno, parentIdx, sub]; sub = 'N'|'S'|'E'|'O'|'C'|null.
 * Con path vacio o pais diminuto devuelve las filas originales (sub null).
 */
export function subdivide(cid, rows, countryPath) {
  const n = rows.length;
  const keep = () => rows.map((r, i) => [r[0], r[1], r[2], r[3], i, null]);
  const polys = parsePolys(countryPath);
  if (!polys.length) return keep();
  const area = polysArea(polys);
  let target = Math.max(12, Math.min(48, Math.round(n * 2)));
  target = Math.max(n, Math.min(target, Math.floor(area / AREA_MIN)));
  if (target <= n) return keep();
  // muestreo en rejilla: cada punto interior se asigna a la provincia mas cercana (celda Voronoi aproximada)
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const pl of polys) for (const [x, y] of pl) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  const step = Math.max(0.8, Math.sqrt(area / 5000));
  const sites = rows.map((r) => toXY(r[1], r[2]));
  const cells = rows.map(() => []);
  for (let y = y0 + step / 2; y < y1; y += step) {
    for (let x = x0 + step / 2; x < x1; x += step) {
      if (!inPolys(polys, x, y)) continue;
      let b = 0, bd = Infinity;
      for (let k = 0; k < n; k++) { const d = (sites[k][0] - x) ** 2 + (sites[k][1] - y) ** 2; if (d < bd) { bd = d; b = k; } }
      cells[b].push([x, y]);
    }
  }
  // reparto de las divisiones extra: gana la celda con mayor area por parte (max 3 partes)
  const parts = rows.map(() => 1);
  for (let extra = target - n; extra > 0; extra--) {
    let best = -1, bv = 0;
    for (let k = 0; k < n; k++) {
      if (parts[k] >= 3 || cells[k].length < (parts[k] + 1) * 4) continue;
      const v = cells[k].length / (parts[k] + 1);
      if (v > bv) { bv = v; best = k; }
    }
    if (best < 0) break;
    parts[best]++;
  }
  const out = [];
  for (let k = 0; k < n; k++) {
    const r = rows[k], m = parts[k];
    if (m === 1) { out.push([r[0], r[1], r[2], r[3], k, null]); continue; }
    const pts = cells[k];
    const cx = pts.reduce((s, q) => s + q[0], 0) / pts.length, cy = pts.reduce((s, q) => s + q[1], 0) / pts.length;
    let sxx = 0, syy = 0;
    for (const q of pts) { sxx += (q[0] - cx) ** 2; syy += (q[1] - cy) ** 2; }
    const vertical = syy >= sxx; // eje largo vertical -> cortes Norte/Sur
    const sorted = pts.slice().sort((a, b) => (vertical ? a[1] - b[1] : a[0] - b[0]) || a[0] - b[0] || a[1] - b[1]);
    const labels = vertical ? (m === 2 ? ['N', 'S'] : ['N', 'C', 'S']) : (m === 2 ? ['O', 'E'] : ['O', 'C', 'E']);
    const names = { N: 'Norte', S: 'Sur', E: 'Oriental', O: 'Occidental', C: 'Centro' };
    for (let j = 0; j < m; j++) {
      const chunk = sorted.slice(Math.floor((j * sorted.length) / m), Math.floor(((j + 1) * sorted.length) / m));
      let px = chunk.reduce((s, q) => s + q[0], 0) / chunk.length, py = chunk.reduce((s, q) => s + q[1], 0) / chunk.length;
      for (let t = 0; t < 12 && !inPolys(polys, px, py); t++) { px += (cx - px) * 0.35; py += (cy - py) * 0.35; }
      if (!inPolys(polys, px, py)) { px = chunk[0][0]; py = chunk[0][1]; }
      const [lat, lon] = fromXY(px, py);
      out.push([r[0] + ' ' + names[labels[j]], +lat.toFixed(3), +lon.toFixed(3), r[3], k, labels[j]]);
    }
  }
  return out;
}

/** Numero de regiones («estados») de un pais con n departamentos: 2 a 4 en los pequenos, 5 a 10 en los grandes. */
export function region_count(n) {
  if (n <= 3) return Math.max(1, n);
  if (n <= 6) return 2;
  if (n <= 9) return 3;
  if (n <= 14) return 4;
  return Math.min(10, Math.max(5, Math.round(n / 3.4)));
}
/**
 * Densidad 0 («estados»): agrupa los departamentos de un pais en regiones contiguas (k-medias determinista
 * en el plano del mapa). Devuelve filas [nombre, lat, lon, terreno, idx, null, miembros[]] ordenadas de
 * forma estable; el centroide es el promedio de los miembros y el terreno el mas frecuente.
 */
export function group_states(cid, rows) {
  const n = rows.length, K = region_count(n);
  const pts = rows.map((r) => toXY(r[1], r[2]));
  if (K >= n) return rows.map((r, i) => [r[0], r[1], r[2], r[3], i, null, [r[0]]]);
  // semillas por punto mas lejano, partiendo del punto mas cercano al centro
  const cx = pts.reduce((s, q) => s + q[0], 0) / n, cy = pts.reduce((s, q) => s + q[1], 0) / n;
  let first = 0;
  pts.forEach((q, i) => { if (Math.hypot(q[0] - cx, q[1] - cy) < Math.hypot(pts[first][0] - cx, pts[first][1] - cy)) first = i; });
  const seeds = [first];
  while (seeds.length < K) {
    let b = -1, bd = -1;
    pts.forEach((q, i) => {
      const d = Math.min(...seeds.map((s) => Math.hypot(q[0] - pts[s][0], q[1] - pts[s][1])));
      if (d > bd) { bd = d; b = i; }
    });
    seeds.push(b);
  }
  let cent = seeds.map((s) => pts[s].slice());
  let asg = new Array(n).fill(0);
  for (let it = 0; it < 20; it++) {
    asg = pts.map((q) => { let b = 0, bd = Infinity; cent.forEach((c, k) => { const d = Math.hypot(q[0] - c[0], q[1] - c[1]); if (d < bd) { bd = d; b = k; } }); return b; });
    cent = cent.map((c, k) => {
      const m = pts.filter((_, i) => asg[i] === k);
      return m.length ? [m.reduce((s, q) => s + q[0], 0) / m.length, m.reduce((s, q) => s + q[1], 0) / m.length] : c;
    });
  }
  const groups = [];
  for (let k = 0; k < K; k++) {
    const idx = asg.map((a, i) => (a === k ? i : -1)).filter((i) => i >= 0);
    if (idx.length) groups.push(idx);
  }
  // nombre = departamento mas cercano al centro de la region; orden estable por indice del primer miembro
  groups.sort((a, b) => a[0] - b[0]);
  return groups.map((idx, gi) => {
    const mx = idx.reduce((s, i) => s + pts[i][0], 0) / idx.length, my = idx.reduce((s, i) => s + pts[i][1], 0) / idx.length;
    const med = idx.reduce((b, i) => (Math.hypot(pts[i][0] - mx, pts[i][1] - my) < Math.hypot(pts[b][0] - mx, pts[b][1] - my) ? i : b));
    const cnt = {}; for (const i of idx) cnt[rows[i][3]] = (cnt[rows[i][3]] || 0) + 1;
    const terr = Object.keys(cnt).sort((a, b) => cnt[b] - cnt[a] || (a < b ? -1 : 1))[0];
    const [lat, lon] = fromXY(mx, my);
    const name = idx.length === 1 ? rows[med][0] : 'Región ' + rows[med][0];
    return [name, +lat.toFixed(3), +lon.toFixed(3), terr, gi, null, idx.map((i) => rows[i][0])];
  });
}

export const TERRAIN = {
  S: { name: 'Selva', color: '#2f5a2a' },
  M: { name: 'Montaña', color: '#6b5a45' },
  D: { name: 'Desierto', color: '#c9a86a' },
  P: { name: 'Pampa', color: '#8a9a4a' },
  V: { name: 'Sabana', color: '#a39248' },
  B: { name: 'Bosque', color: '#3f5f35' },
  E: { name: 'Estepa', color: '#9c8f70' },
  T: { name: 'Tropical', color: '#4f7a3a' },
  A: { name: 'Altiplano', color: '#8d7a5c' },
};
