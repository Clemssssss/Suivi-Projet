import pandas as pd
import json
from datetime import datetime


EXCEL_PATH = r"C:\Users\cgil\OneDrive - Solutions30\AO Eolien 2025\CAHORS\Appel d'offre consultation MAPS.xlsx"
OUTPUT_FILE = r"C:\Users\cgil\OneDrive - Solutions30\AO Eolien 2025\CAHORS\data.js"


def normalize_key(col):
    return (
        str(col)
        .strip()
        .lower()
        .replace(" ", "_")
        .replace("é", "e")
        .replace("è", "e")
        .replace("ê", "e")
        .replace("à", "a")
        .replace("ç", "c")
    )


def clean_value(v):
    if pd.isna(v):
        return None

    # dates pandas / datetime
    if isinstance(v, (pd.Timestamp, datetime)):
        return v.isoformat()

    return v


def main():
    df = pd.read_excel(EXCEL_PATH)

    data = []
    column_map = {col: normalize_key(col) for col in df.columns}

    for _, row in df.iterrows():
        obj = {}
        for excel_col, js_key in column_map.items():
            obj[js_key] = clean_value(row[excel_col])
        data.append(obj)

    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        f.write("const DATA = ")
        json.dump(data, f, ensure_ascii=False, indent=2)
        f.write(";")

    print(f"✅ data.js généré ({len(data)} lignes)")


if __name__ == "__main__":
    main()
