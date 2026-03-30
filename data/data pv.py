import pandas as pd
import json
import os

csv_path = r"C:\Users\cgil\OneDrive - Solutions30\AO Eolien 2025\01 - SUIVI DES DOSSIERS\new - pv\data\SAIP - Suivi ventes & AO_VF(GoNogo).csv"

# ===============================
# DETECTION ENCODAGE
# ===============================
encodings = ["utf-8", "cp1252", "latin-1"]

file_content = None
used_encoding = None

for enc in encodings:
    try:
        with open(csv_path, "r", encoding=enc) as f:
            file_content = f.readlines()
        used_encoding = enc
        print(f"Encodage détecté : {enc}")
        break
    except UnicodeDecodeError:
        continue

if file_content is None:
    raise Exception("Impossible de lire le fichier.")

# ===============================
# TROUVER LA VRAIE LIGNE HEADER
# ===============================
header_index = None

for i, line in enumerate(file_content):
    if "Date réception" in line:
        header_index = i
        break

if header_index is None:
    raise Exception("Impossible de trouver la ligne d'en-tête.")

print(f"Ligne d'en-tête trouvée à la ligne : {header_index}")

# ===============================
# LECTURE PROPRE DU CSV
# ===============================
df = pd.read_csv(
    csv_path,
    sep=",",
    encoding=used_encoding,
    skiprows=header_index
)

# Supprimer colonnes complètement vides
df = df.dropna(axis=1, how="all")

# Supprimer lignes complètement vides
df = df.dropna(how="all")

# ===============================
# CONVERSION AUTO
# ===============================
def auto_convert(value):
    if pd.isna(value):
        return None

    value_str = str(value).strip()

    if "€" in value_str:
        value_str = value_str.replace("€", "").replace(" ", "").replace(",", "")
        try:
            return float(value_str)
        except:
            return value

    try:
        return int(value_str)
    except:
        try:
            return float(value_str.replace(",", "."))
        except:
            return value

# ===============================
# TRANSFORMATION
# ===============================
data = []

for index, row in df.iterrows():
    obj = {
        "id": index + 1,
        "ctrl": False
    }

    for col in df.columns:
        obj[col] = auto_convert(row[col])

    data.append(obj)

# ===============================
# EXPORT data.js
# ===============================
output_path = os.path.join(os.path.dirname(csv_path), "data.js")

with open(output_path, "w", encoding="utf-8") as f:
    f.write("window.DATA = ")
    json.dump(data, f, indent=2, ensure_ascii=False)

print("===================================")
print("data.js généré correctement.")
print("===================================")