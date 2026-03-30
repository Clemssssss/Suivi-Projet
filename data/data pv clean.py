import json
import os
from datetime import datetime

# ===============================
# CHEMIN DU data.js
# ===============================
file_path = r"C:\Users\cgil\OneDrive - Solutions30\AO Eolien 2025\01 - SUIVI DES DOSSIERS\new - pv\data\data.js"

# ===============================
# LECTURE DU FICHIER
# ===============================
with open(file_path, "r", encoding="utf-8") as f:
    content = f.read()

data = json.loads(content.replace("window.DATA = ", ""))

# ===============================
# VALIDATION DATE CORRIGÉE
# ===============================
def is_valid_date(value):
    if value is None:
        return False

    value = str(value).strip()

    if value == "":
        return False

    # Formats adaptés à ton fichier
    formats = [
        "%d/%m/%y",   # 01/01/23
        "%d/%m/%Y",   # 01/01/2023
        "%Y-%m-%d"
    ]

    for fmt in formats:
        try:
            datetime.strptime(value, fmt)
            return True
        except:
            continue

    return False

# ===============================
# FILTRAGE
# ===============================
filtered_data = []

for obj in data:
    if is_valid_date(obj.get("Date réception")):
        filtered_data.append(obj)

# Réindexation propre des id
for i, obj in enumerate(filtered_data):
    obj["id"] = i + 1

print(f"Lignes avant : {len(data)}")
print(f"Lignes après : {len(filtered_data)}")

# ===============================
# EXPORT
# ===============================
output_path = os.path.join(os.path.dirname(file_path), "data_filtered.js")

with open(output_path, "w", encoding="utf-8") as f:
    f.write("window.DATA = ")
    json.dump(filtered_data, f, indent=2, ensure_ascii=False)

print("data_filtered.js généré correctement.")