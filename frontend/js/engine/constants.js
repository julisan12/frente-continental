// Constantes de balance de Frente Continental. Port de backend/app/engine/constants.py.
// Mantener sincronizado con el Python (mismos nombres y valores).

export const VERSION = "0.2";
export const START_YEAR = 1962;
export const MONTHS = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
export const VICTORY_FRACTION = 0.5;          // controlar >= 50% de los paises
export const ZERO_STABILITY_LOSS_TURNS = 3;   // turnos seguidos con estabilidad 0 => derrota
export const MAX_LOGS = 80;

// --- Estado inicial (p = power) ---
export const START_MONEY = 65;
export const START_INDUSTRY = 12;
export const START_ARMY = 7;
export const START_PRODUCTION = 15;
export const START_TANKS = 4;
export const START_PLANES = 2;
export const START_STABILITY = 70;
export const START_POP_FACTOR = 6;
export const POP_OVERRIDE = { "Brazil": 70, "Mexico": 38, "Argentina": 22, "Colombia": 16, "Peru": 11,
  "Venezuela": 8, "Chile": 8, "Cuba": 7 };

// --- Economia ---
export const STAB_BASE = 0.6;
export const STAB_DIV = 250.0;
export const DEV_BONUS = 0.05;
export const TRADE_BONUS = 0.05;
export const OCCUPIED_YIELD = 0.2;            // fraccion de produccion de territorios ocupados
export const UPKEEP_TROOP = 0.8;
export const UPKEEP_TANK = 0.5;
export const UPKEEP_PLANE = 0.8;
export const BUDGET_SHARE = 0.5;              // fraccion del superavit que se reparte en presupuesto
export const RECRUIT_COST_PER_TROOP = 80 / 12.0;
export const SOCIAL_COST_PER_POINT = 70 / 8.0;
export const INFRA_COST_PER_POINT = 40.0;
export const INDUSTRY_COST_PER_POINT = 10.0;
export const PRODUCTION_PER_INDUSTRY = 0.8;
export const MAX_PRODUCTION = 600;
export const GDP_MULT = 12;
export const NEGATIVE_MONEY_STABILITY = -8;
export const STAB_REVERT_TO = 65;
export const STAB_REVERT_RATE = 0.06;
export const STAB_REVERT_MIN = 10;            // sin "retorno a la normalidad" por debajo de este nivel
export const STAB_WAR_PENALTY = 1.0;
export const STAB_TREATY_BONUS = 0.4;
export const STAB_TREATY_CAP = 1.2;

// --- Ordenes economicas: tipo -> coste ---
export const ORDER_COSTS = { "build": 100, "stability": 70, "recruit": 80, "tanks": 120, "planes": 150 };
export const BUILD_INDUSTRY = 10;
export const BUILD_PRODUCTION = 8;
export const STABILITY_GAIN = 8;
export const RECRUIT_TROOPS = 12;
export const TANKS_GAIN = 6;
export const PLANES_GAIN = 4;
export const MAX_PROJECTS = 3;
// kind -> [nombre, coste, turnos, efectos]
export const PROJECTS = {
  "factory": ["Fabrica", 220, 4, { "industry": 15, "production": 12 }],
  "road": ["Red vial", 120, 3, { "infrastructure": 8 }],
  "port": ["Puerto", 160, 4, { "infrastructure": 5, "production": 6 }],
  "school": ["Escuelas", 140, 5, { "development": 0.5, "stability": 5 }],
  "barracks": ["Cuartel", 150, 3, { "troops": 15 }],
};

// --- Diplomacia ---
export const ALLIANCE_MIN_REL = 30;
export const NAP_MIN_REL = 0;
export const TRADE_MIN_REL = 10;
export const SEND_MIN = 20;
export const SEND_DEFAULT = 50;
export const BREAK_STAB = 4;
export const BREAK_REL = 30;
export const WAR_STAB = 3;
export const BREAK_NAP_STAB = 10;
export const WAR_REL = 40;
export const CEASEFIRE_IDLE_TURNS = 6;
export const PEACE_MIN_AGE = 3;

// --- Militar ---
export const ATTACK_FACTOR = 0.8;
export const ATTACK_RANGE = [0.82, 0.34];
export const DEFENSE_FACTOR = 1.0;
export const DEFENSE_RANGE = [0.83, 0.33];
export const SEA_PENALTY = 0.25;
export const DEFEND_BONUS = 0.25;
export const HOME_DEFENSE_BONUS = 0.25;        // bonus de defensa en el territorio de origen (capital)
export const FRONT_BONUS = 0.10;
export const INFRA_DEF_BONUS = 0.002;
export const TANK_POWER = 3;
export const PLANE_POWER = 4;
export const MILITIA_BASE = 3.0;
export const MILITIA_INFRA = 0.1;
export const WIN_LOSS = 0.35;
export const LOSE_ATT_LOSS = 0.27;
export const LOSE_DEF_LOSS = 0.20;
export const DEFEATED_DEF_LOSS = 0.5;
export const CAPTURE_INDUSTRY = 0.35;
export const CAPTURE_PRODUCTION = 0.25;
export const CAPTURE_MONEY = 0.4;
export const ORG_ATTACK_COST = 15;
export const ORG_LOSE_COST = 25;
export const ORG_MIN_ATTACK = 25;
export const ORG_REORG = 30;
export const ORG_IDLE = 8;
export const ORG_DEFEND = 12;
export const CAPTURE_STAB_LOSS = 4;
export const CAPTURE_STAB_GAIN = 3;
export const MAX_LOSS_FRACTION = 0.7;

// --- IA ---
export const AI_OFFENSIVE_RATIO = 1.4;
export const AI_MIN_STABILITY = 40;
export const AI_HOSTILE_REL = -40;
export const AI_AGGRESSIVE_SHARE = 0.35;
export const AI_MIN_BALANCE = 10;
export const AI_ATTACK_COOLDOWN = 1;          // turnos entre ofensivas por pais
export const AI_GRUDGE = 4;                  // deriva negativa de relacion agresor -> vecino debil
export const AI_WEAK_RATIO = 0.6;
export const AI_ATTACK_MARGIN = 1.1;         // poder agrupado / defensa minimo para atacar
export const AI_START_TURN = 10;               // primer turno en que la IA ataca
export const AI_GRUDGE_START = 8;             // primer turno en que los agresivos acumulan rencor

// --- Eventos ---
export const EVENT_CHANCE = 0.65;
export const AI_EVENT_CHANCE = 0.3;
export const EVENT_PLAYER_SHARE = 0.65;

// --- Amenaza (vista para el jugador) ---
export const THREAT_SCALE = 50;               // amenaza = min(100, poder_rel x hostilidad x THREAT_SCALE)
export const THREAT_REL_ZERO = 20;            // relacion a partir de la cual la hostilidad es 0
export const THREAT_REL_SPAN = 70;            // puntos de relacion por debajo de THREAT_REL_ZERO hasta hostilidad 1
export const THREAT_NAP_FACTOR = 0.5;         // un pacto de no agresion reduce la hostilidad a la mitad
export const FOG_RANGE = [0.8, 1.2];          // niebla de guerra: factor de estimacion para no aliados

// --- Guerra Fria / suministro ---
export const SUPPLY_PENALTY = 0.7;
export const MAX_TURNS = 128; // 10 años y 8 meses
// --- Victorias alternativas ---
export const ECON_LEAD_RATIO = 1.5;
export const ECON_WIN_TURNS = 20;
export const DIPLO_ALLY_SHARE = 0.5;
export const DIPLO_WIN_TURNS = 12;
