"""Genera backend/app/data/countries.json a partir del mapa original (map_raw.json)."""
import json, pathlib
root = pathlib.Path(__file__).resolve().parent.parent
paths = json.loads((root/'backend/app/data/map_raw.json').read_text(encoding='utf-8'))
NAMES = {'Argentina':'Argentina','Chile':'Chile','Haiti':'Haití','Dominican Rep.':'República Dominicana','Mexico':'México',
 'Uruguay':'Uruguay','Brazil':'Brasil','Bolivia':'Bolivia','Peru':'Perú','Colombia':'Colombia','Panama':'Panamá',
 'Costa Rica':'Costa Rica','Nicaragua':'Nicaragua','Honduras':'Honduras','El Salvador':'El Salvador','Guatemala':'Guatemala',
 'Belize':'Belice','Venezuela':'Venezuela','Guyana':'Guyana','Suriname':'Surinam','Ecuador':'Ecuador','Jamaica':'Jamaica',
 'Cuba':'Cuba','Paraguay':'Paraguay'}
# Valores de equilibrio del juego original (indicativos, no estadística oficial)
POWER = {'Brazil':9,'Mexico':8,'Argentina':7,'Colombia':6,'Chile':6,'Peru':5,'Venezuela':5,'Cuba':4,'Ecuador':4,'Bolivia':4,
 'Guatemala':3,'Panama':3,'Uruguay':3,'Paraguay':3,'Costa Rica':3,'Dominican Rep.':3}
# Valores iniciales balanceados para 1962 (abstracción de juego)
START = {
    "Argentina": {"money": 280.0, "industry": 90.0, "production": 95.0, "army": 70.0, "tanks": 28.0, "planes": 14.0,
                  "stability": 50.0, "development": 4.5, "infrastructure": 55.0, "population": 22.0},
    "Bolivia": {"money": 60.0, "industry": 18.0, "production": 30.0, "army": 18.0, "tanks": 2.0, "planes": 1.0,
                "stability": 40.0, "development": 1.5, "infrastructure": 20.0, "population": 3.8},
    "Brazil": {"money": 300.0, "industry": 120.0, "production": 120.0, "army": 90.0, "tanks": 22.0, "planes": 12.0,
               "stability": 55.0, "development": 2.5, "infrastructure": 35.0, "population": 75.0},
    "Chile": {"money": 240.0, "industry": 65.0, "production": 85.0, "army": 35.0, "tanks": 10.0, "planes": 8.0,
              "stability": 70.0, "development": 4.0, "infrastructure": 50.0, "population": 8.0},
    "Colombia": {"money": 200.0, "industry": 60.0, "production": 72.0, "army": 40.0, "tanks": 8.0, "planes": 6.0,
                 "stability": 45.0, "development": 2.8, "infrastructure": 38.0, "population": 16.0},
    "Cuba": {"money": 100.0, "industry": 40.0, "production": 48.0, "army": 60.0, "tanks": 25.0, "planes": 14.0,
             "stability": 65.0, "development": 2.0, "infrastructure": 35.0, "population": 7.0},
    "Ecuador": {"money": 110.0, "industry": 35.0, "production": 48.0, "army": 18.0, "tanks": 3.0, "planes": 2.0,
                "stability": 55.0, "development": 2.3, "infrastructure": 30.0, "population": 4.5},
    "Venezuela": {"money": 360.0, "industry": 45.0, "production": 110.0, "army": 20.0, "tanks": 8.0, "planes": 8.0,
                  "stability": 60.0, "development": 3.0, "infrastructure": 48.0, "population": 8.0},
    "Peru": {"money": 180.0, "industry": 55.0, "production": 68.0, "army": 35.0, "tanks": 8.0, "planes": 6.0,
             "stability": 55.0, "development": 2.8, "infrastructure": 42.0, "population": 11.0},
    "Mexico": {"money": 320.0, "industry": 95.0, "production": 105.0, "army": 50.0, "tanks": 12.0, "planes": 9.0,
               "stability": 82.0, "development": 3.2, "infrastructure": 45.0, "population": 38.0},
    "Uruguay": {"money": 140.0, "industry": 32.0, "production": 42.0, "army": 10.0, "tanks": 2.0, "planes": 1.0,
                "stability": 80.0, "development": 5.0, "infrastructure": 60.0, "population": 2.6},
    "Paraguay": {"money": 75.0, "industry": 22.0, "production": 32.0, "army": 15.0, "tanks": 2.0, "planes": 1.0,
                 "stability": 75.0, "development": 1.8, "infrastructure": 25.0, "population": 1.9},
    "Guatemala": {"money": 95.0, "industry": 28.0, "production": 38.0, "army": 12.0, "tanks": 2.0, "planes": 2.0,
                  "stability": 58.0, "development": 2.2, "infrastructure": 32.0, "population": 4.2},
    "Honduras": {"money": 70.0, "industry": 20.0, "production": 28.0, "army": 10.0, "tanks": 1.0, "planes": 1.0,
                 "stability": 52.0, "development": 1.9, "infrastructure": 26.0, "population": 2.1},
    "El Salvador": {"money": 65.0, "industry": 18.0, "production": 26.0, "army": 8.0, "tanks": 1.0, "planes": 1.0,
                    "stability": 50.0, "development": 2.0, "infrastructure": 28.0, "population": 2.8},
    "Nicaragua": {"money": 68.0, "industry": 19.0, "production": 27.0, "army": 9.0, "tanks": 1.0, "planes": 1.0,
                  "stability": 48.0, "development": 1.8, "infrastructure": 24.0, "population": 1.6},
    "Costa Rica": {"money": 85.0, "industry": 24.0, "production": 34.0, "army": 8.0, "tanks": 1.0, "planes": 1.0,
                   "stability": 65.0, "development": 2.5, "infrastructure": 36.0, "population": 1.4},
    "Panama": {"money": 120.0, "industry": 26.0, "production": 36.0, "army": 6.0, "tanks": 0.0, "planes": 1.0,
               "stability": 62.0, "development": 2.4, "infrastructure": 40.0, "population": 1.2},
    "Belize": {"money": 55.0, "industry": 15.0, "production": 22.0, "army": 5.0, "tanks": 0.0, "planes": 0.0,
               "stability": 68.0, "development": 2.1, "infrastructure": 30.0, "population": 0.1},
    "Jamaica": {"money": 60.0, "industry": 16.0, "production": 24.0, "army": 6.0, "tanks": 0.0, "planes": 0.0,
                "stability": 70.0, "development": 2.3, "infrastructure": 32.0, "population": 1.7},
    "Haiti": {"money": 40.0, "industry": 12.0, "production": 20.0, "army": 7.0, "tanks": 0.0, "planes": 0.0,
              "stability": 45.0, "development": 1.2, "infrastructure": 12.0, "population": 4.4},
    "Dominican Rep.": {"money": 72.0, "industry": 22.0, "production": 30.0, "army": 12.0, "tanks": 2.0, "planes": 1.0,
                       "stability": 35.0, "development": 2.0, "infrastructure": 28.0, "population": 3.3},
    "Guyana": {"money": 52.0, "industry": 14.0, "production": 20.0, "army": 5.0, "tanks": 0.0, "planes": 0.0,
               "stability": 60.0, "development": 1.8, "infrastructure": 28.0, "population": 0.6},
    "Suriname": {"money": 50.0, "industry": 13.0, "production": 19.0, "army": 5.0, "tanks": 0.0, "planes": 0.0,
                 "stability": 62.0, "development": 1.9, "infrastructure": 26.0, "population": 0.3}
}
LAND = {'Mexico':['Guatemala','Belize'],'Guatemala':['Mexico','Belize','El Salvador','Honduras'],'Belize':['Mexico','Guatemala'],
 'El Salvador':['Guatemala','Honduras'],'Honduras':['Guatemala','El Salvador','Nicaragua'],'Nicaragua':['Honduras','Costa Rica'],
 'Costa Rica':['Nicaragua','Panama'],'Panama':['Costa Rica','Colombia'],'Colombia':['Panama','Venezuela','Brazil','Peru','Ecuador'],
 'Venezuela':['Colombia','Brazil','Guyana'],'Guyana':['Venezuela','Brazil','Suriname'],'Suriname':['Guyana','Brazil'],
 'Ecuador':['Colombia','Peru'],'Peru':['Ecuador','Colombia','Brazil','Bolivia','Chile'],
 'Bolivia':['Peru','Brazil','Paraguay','Argentina','Chile'],
 'Brazil':['Colombia','Venezuela','Guyana','Suriname','Peru','Bolivia','Paraguay','Argentina','Uruguay'],
 'Paraguay':['Bolivia','Brazil','Argentina'],'Chile':['Peru','Bolivia','Argentina'],
 'Argentina':['Chile','Bolivia','Paraguay','Brazil','Uruguay'],'Uruguay':['Brazil','Argentina'],'Cuba':[],
 'Haiti':['Dominican Rep.'],'Dominican Rep.':['Haiti'],'Jamaica':[]}
# Nuevo: rutas marítimas (desembarco anfibio, penalización de combate) para que las islas participen
SEA = [('Cuba','Mexico'),('Cuba','Jamaica'),('Cuba','Haiti'),('Jamaica','Haiti'),('Cuba','Belize'),('Jamaica','Honduras'),
 ('Dominican Rep.','Venezuela'),('Jamaica','Colombia'),('Cuba','Honduras')]
# Alineamiento de Guerra Fría 1962 (abstracción de juego)
ALIGN = {'Cuba':'socialista','Mexico':'no_alineado','Bolivia':'no_alineado','Brazil':'no_alineado','Guyana':'no_alineado'}
RES = {'Brazil':['café','acero','caucho'],'Mexico':['petróleo','plata','maíz'],'Argentina':['trigo','carne','petróleo'],
 'Colombia':['café','carbón','petróleo'],'Chile':['cobre','salitre'],'Peru':['plata','pesca','cobre'],
 'Venezuela':['petróleo','hierro'],'Cuba':['azúcar','níquel','tabaco'],'Ecuador':['banano','petróleo'],'Bolivia':['estaño','plata'],
 'Guatemala':['café','banano'],'Panama':['canal','banano'],'Uruguay':['carne','lana'],'Paraguay':['madera','algodón'],
 'Costa Rica':['café','banano'],'Dominican Rep.':['azúcar','cacao'],'Honduras':['banano','madera'],'Nicaragua':['algodón','oro'],
 'El Salvador':['café'],'Belize':['madera','azúcar'],'Guyana':['bauxita','azúcar'],'Suriname':['bauxita'],'Jamaica':['bauxita','azúcar'],
 'Haiti':['café','sisal']}
# Paleta apagada, multicolor, estética militar (colores de carta de estado mayor)
PALETTE = ['#7d8a5a','#8a6f52','#5f7a74','#8c7b5c','#6d6a86','#7a5e5e','#5d7a5a','#86745a','#5a6f86','#80705f','#6f805c','#8a6464',
 '#6a7f7f','#7c7350','#6b5f7c','#5f735f','#857060','#647086','#7a7a58','#7d6070','#5c7c6c','#8a7a6a','#6e6e5a','#706070']
out = []
for i,(cid,d) in enumerate(paths.items()):
    nb = set(LAND.get(cid,[]))
    sea = sorted({b for a,b in SEA if a==cid} | {a for a,b in SEA if b==cid})
    country = {'id':cid,'name':NAMES[cid],'power':POWER.get(cid,2),'neighbors':sorted(nb),'sea':sea,
               'alignment':ALIGN.get(cid,'occidental'),'resources':RES.get(cid,[]),'color':PALETTE[i%len(PALETTE)],'path':d}
    # Añadir valores iniciales balanceados si existen
    if cid in START:
        country['start'] = START[cid]
    out.append(country)
(root/'backend/app/data/countries.json').write_text(json.dumps(out,ensure_ascii=False,indent=1),encoding='utf-8')
print(len(out),'países')
