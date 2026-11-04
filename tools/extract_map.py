import json, re, sys
src = open(sys.argv[1], encoding='utf-8').read()
m = re.search(r'const MAPS\s*=\s*(\{.*?\});', src, re.S)
txt = m.group(1)
try:
    data = json.loads(txt)
except Exception:
    data = json.loads(re.sub(r"'", '"', txt))
json.dump(data, open(sys.argv[2], 'w', encoding='utf-8'), ensure_ascii=False)
print(type(data), list(data)[:30] if isinstance(data, dict) else len(data))
