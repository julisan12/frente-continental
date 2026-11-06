"""Constantes de balance de Frente Continental (todas ajustables aqui)."""

VERSION = "0.2"
START_YEAR = 1962
MONTHS = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"]
VICTORY_FRACTION = 0.5          # controlar >= 50% de los paises
ZERO_STABILITY_LOSS_TURNS = 3   # turnos seguidos con estabilidad 0 => derrota
MAX_LOGS = 80

# --- Estado inicial (p = power) ---
START_MONEY = 65
START_INDUSTRY = 12
START_ARMY = 7
START_PRODUCTION = 15
START_TANKS = 4
START_PLANES = 2
START_STABILITY = 70
START_POP_FACTOR = 6
POP_OVERRIDE = {"Brazil": 70, "Mexico": 38, "Argentina": 22, "Colombia": 16, "Peru": 11,
                "Venezuela": 8, "Chile": 8, "Cuba": 7}

# --- Economia ---
STAB_BASE = 0.6
STAB_DIV = 250.0
DEV_BONUS = 0.05
TRADE_BONUS = 0.05
OCCUPIED_YIELD = 0.2            # fraccion de produccion de territorios ocupados
UPKEEP_TROOP = 0.8
UPKEEP_TANK = 0.5
UPKEEP_PLANE = 0.8
BUDGET_SHARE = 0.5              # fraccion del superavit que se reparte en presupuesto
RECRUIT_COST_PER_TROOP = 80 / 12.0
SOCIAL_COST_PER_POINT = 70 / 8.0
INFRA_COST_PER_POINT = 40.0
INDUSTRY_COST_PER_POINT = 10.0
PRODUCTION_PER_INDUSTRY = 0.8
MAX_PRODUCTION = 600
GDP_MULT = 12
NEGATIVE_MONEY_STABILITY = -8
STAB_REVERT_TO = 65
STAB_REVERT_RATE = 0.06
STAB_REVERT_MIN = 10            # sin "retorno a la normalidad" por debajo de este nivel
STAB_WAR_PENALTY = 1.0
STAB_TREATY_BONUS = 0.4
STAB_TREATY_CAP = 1.2

# --- Ordenes economicas: tipo -> (coste, descripcion) ---
ORDER_COSTS = {"build": 100, "stability": 70, "recruit": 80, "tanks": 120, "planes": 150}
BUILD_INDUSTRY = 10
BUILD_PRODUCTION = 8
STABILITY_GAIN = 8
RECRUIT_TROOPS = 12
TANKS_GAIN = 6
PLANES_GAIN = 4
MAX_PROJECTS = 3
# kind -> (nombre, coste, turnos, efectos)
PROJECTS = {
    "factory": ("Fabrica", 220, 4, {"industry": 15, "production": 12}),
    "road": ("Red vial", 120, 3, {"infrastructure": 8}),
    "port": ("Puerto", 160, 4, {"infrastructure": 5, "production": 6}),
    "school": ("Escuelas", 140, 5, {"development": 0.5, "stability": 5}),
    "barracks": ("Cuartel", 150, 3, {"troops": 15}),
}

# --- Diplomacia ---
ALLIANCE_MIN_REL = 30
NAP_MIN_REL = 0
TRADE_MIN_REL = 10
SEND_MIN = 20
SEND_DEFAULT = 50
BREAK_STAB = 4
BREAK_REL = 30
WAR_STAB = 3
BREAK_NAP_STAB = 10
WAR_REL = 40
CEASEFIRE_IDLE_TURNS = 6
PEACE_MIN_AGE = 3

# --- Militar ---
ATTACK_FACTOR = 0.8
ATTACK_RANGE = (0.82, 0.34)
DEFENSE_FACTOR = 1.0
DEFENSE_RANGE = (0.83, 0.33)
SEA_PENALTY = 0.25
DEFEND_BONUS = 0.25
HOME_DEFENSE_BONUS = 0.25        # bonus de defensa en el territorio de origen (capital)
FRONT_BONUS = 0.10
INFRA_DEF_BONUS = 0.002
TANK_POWER = 3
PLANE_POWER = 4
MILITIA_BASE = 3.0
MILITIA_INFRA = 0.1
WIN_LOSS = 0.35
LOSE_ATT_LOSS = 0.27
LOSE_DEF_LOSS = 0.20
DEFEATED_DEF_LOSS = 0.5
CAPTURE_INDUSTRY = 0.35
CAPTURE_PRODUCTION = 0.25
CAPTURE_MONEY = 0.4
ORG_ATTACK_COST = 15
ORG_LOSE_COST = 25
ORG_MIN_ATTACK = 25
ORG_REORG = 30
ORG_IDLE = 8
ORG_DEFEND = 12
CAPTURE_STAB_LOSS = 4
CAPTURE_STAB_GAIN = 3
MAX_LOSS_FRACTION = 0.7

# --- IA ---
AI_OFFENSIVE_RATIO = 1.4          # poder propio / poder del vecino para abrir una ofensiva
AI_MIN_STABILITY = 40
AI_HOSTILE_REL = -40
AI_AGGRESSIVE_SHARE = 0.35
AI_MIN_BALANCE = 10
AI_ATTACK_COOLDOWN = 1          # turnos entre ofensivas por pais
AI_GRUDGE = 4                   # deriva negativa de relacion agresor -> vecino debil
AI_WEAK_RATIO = 0.6             # el rencor solo apunta a vecinos claramente mas debiles
AI_ATTACK_MARGIN = 1.1          # poder agrupado / defensa minimo para atacar
AI_START_TURN = 10              # primer turno en que la IA ataca
AI_GRUDGE_START = 8             # primer turno en que los agresivos acumulan rencor

# --- Eventos ---
EVENT_CHANCE = 0.65
AI_EVENT_CHANCE = 0.3
EVENT_PLAYER_SHARE = 0.65

# --- Amenaza (vista para el jugador) ---
THREAT_SCALE = 50               # amenaza = min(100, poder_rel x hostilidad x THREAT_SCALE)
THREAT_REL_ZERO = 20            # relacion a partir de la cual la hostilidad es 0
THREAT_REL_SPAN = 70            # puntos de relacion por debajo de THREAT_REL_ZERO hasta hostilidad 1
THREAT_NAP_FACTOR = 0.5         # un pacto de no agresion reduce la hostilidad a la mitad
FOG_RANGE = (0.8, 1.2)          # niebla de guerra: factor de estimacion para no aliados

# --- Guerra Fria / suministro ---
SUPPLY_PENALTY = 0.7
MAX_TURNS = 128  # 10 años y 8 meses
# --- Victorias alternativas ---
ECON_LEAD_RATIO = 1.5      # industria propia >= 1.5x la del segundo
ECON_WIN_TURNS = 20        # turnos seguidos de liderazgo economico
DIPLO_ALLY_SHARE = 0.5     # fraccion de los demas paises vivos que son aliados
DIPLO_WIN_TURNS = 12       # turnos seguidos de hegemonia diplomatica
