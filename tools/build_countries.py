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
    out.append({'id':cid,'name':NAMES[cid],'power':POWER.get(cid,2),'neighbors':sorted(nb),'sea':sea,
                'alignment':ALIGN.get(cid,'occidental'),'resources':RES.get(cid,[]),'color':PALETTE[i%len(PALETTE)],'path':d})
(root/'backend/app/data/countries.json').write_text(json.dumps(out,ensure_ascii=False,indent=1),encoding='utf-8')
print(len(out),'países')
