#!/usr/bin/env python3
"""Extrait, depuis la Base du dossier complet Insee (comparateur de territoire),
les indicateurs Habitants (pyramide des âges, diplômes, familles, revenus/pauvreté)
et Économie & Équipements (entreprises, équipements) pour le Val-d'Oise.

Source : https://www.insee.fr/fr/statistiques/5359146 (dossier_complet.parquet).
Aucune valeur n'est recalculée à la main au-delà de sommes/pourcentages explicites ;
le CONF_STATUS Insee ('C' = secret statistique) est toujours respecté.
"""
import json
from pathlib import Path

import pandas as pd
import pyarrow.compute as pc
import pyarrow.dataset as ds

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "raw" / "dossier_complet.parquet"
OUT = ROOT / "data" / "processed"

COLS = ["GEO", "GEO_LABEL", "GEO_OBJECT", "ID_TAB", "TAB_MEASURE", "TAB_MEASURE_LABEL", "TIME_PERIOD", "OBS_VALUE", "CONF_STATUS"]


def load_filtered(commune_codes, epci_codes):
    d = ds.dataset(RAW)
    parts = []
    expr_com = (ds.field("GEO_OBJECT") == "COM") & pc.is_in(ds.field("GEO"), pa_array(commune_codes))
    parts.append(d.to_table(filter=expr_com, columns=COLS).to_pandas())
    expr_epci = (ds.field("GEO_OBJECT") == "EPCI") & pc.is_in(ds.field("GEO"), pa_array(epci_codes))
    parts.append(d.to_table(filter=expr_epci, columns=COLS).to_pandas())
    expr_dep = (ds.field("GEO_OBJECT") == "DEP") & (ds.field("GEO") == "95")
    parts.append(d.to_table(filter=expr_dep, columns=COLS).to_pandas())
    df = pd.concat(parts, ignore_index=True)
    # une seule ligne par (GEO, TAB_MEASURE) : on garde le millésime le plus récent
    df = df.sort_values("TIME_PERIOD").drop_duplicates(subset=["GEO", "GEO_OBJECT", "TAB_MEASURE"], keep="last")
    return df


def pa_array(values):
    import pyarrow as pa
    return pa.array(values)


def node(row, unit=None):
    conf = row.get("CONF_STATUS")
    value = row.get("OBS_VALUE")
    flag = "secret" if conf == "C" else ("ok" if pd.notna(value) else "missing")
    out = {"value": (None if flag == "secret" else (float(value) if pd.notna(value) else None)), "year": int(row["TIME_PERIOD"]) if pd.notna(row.get("TIME_PERIOD")) else None, "source": "insee_dossier_complet", "quality_flag": flag}
    if unit:
        out["unit"] = unit
    return out


def pick(df_geo, measure):
    rows = df_geo[df_geo.TAB_MEASURE == measure]
    if rows.empty:
        return {"value": None, "quality_flag": "missing", "source": "insee_dossier_complet"}
    return node(rows.iloc[0])


def build_habitants(df_geo):
    age_labels = {
        "POP_SEX_M_AGE_Y_LT20": ("Hommes", "Moins de 20 ans"),
        "POP_SEX_M_AGE_Y20T64": ("Hommes", "20 à 64 ans"),
        "POP_SEX_M_AGE_Y_GE65": ("Hommes", "65 ans ou plus"),
        "POP_SEX_F_AGE_Y_LT20": ("Femmes", "Moins de 20 ans"),
        "POP_SEX_F_AGE_Y20T64": ("Femmes", "20 à 64 ans"),
        "POP_SEX_F_AGE_Y_GE65": ("Femmes", "65 ans ou plus"),
    }
    brackets = {"Moins de 20 ans": 0.0, "20 à 64 ans": 0.0, "65 ans ou plus": 0.0}
    any_secret = False
    any_value = False
    for code, (_, bracket) in age_labels.items():
        rows = df_geo[df_geo.TAB_MEASURE == code]
        if rows.empty:
            continue
        r = rows.iloc[0]
        if r.get("CONF_STATUS") == "C":
            any_secret = True
            continue
        v = r.get("OBS_VALUE")
        if pd.notna(v):
            brackets[bracket] += float(v)
            any_value = True
    total = sum(brackets.values())
    pyramide = []
    if any_value and total:
        for label, v in brackets.items():
            pyramide.append({"label": label, "value": round(v, 1), "pct": round(v / total * 1000) / 10})

    diploma_codes = [
        ("POP_EDUC_001T100_RP", "Aucun diplôme"),
        ("POP_EDUC_200_RP", "Brevet des collèges"),
        ("POP_EDUC_300_RP", "CAP, BEP"),
        ("POP_EDUC_350T351_RP", "Baccalauréat"),
        ("POP_EDUC_500_RP", "Bac+2"),
        ("POP_EDUC_600_RP", "Licence (bac+3/+4)"),
        ("POP_EDUC_700_RP", "Bac+5 ou plus"),
    ]
    diploma_total_row = df_geo[df_geo.TAB_MEASURE == "POP"]
    diploma_total = float(diploma_total_row.iloc[0]["OBS_VALUE"]) if not diploma_total_row.empty and pd.notna(diploma_total_row.iloc[0]["OBS_VALUE"]) else None
    diploma = []
    for code, label in diploma_codes:
        rows = df_geo[df_geo.TAB_MEASURE == code]
        if rows.empty or rows.iloc[0].get("CONF_STATUS") == "C":
            continue
        v = rows.iloc[0].get("OBS_VALUE")
        if pd.notna(v) and diploma_total:
            diploma.append({"label": label, "value": round(float(v), 1), "pct": round(float(v) / diploma_total * 1000) / 10})

    familles = []
    fam_total_row = df_geo[df_geo.TAB_MEASURE == "NBFAM"]
    fam_total = float(fam_total_row.iloc[0]["OBS_VALUE"]) if not fam_total_row.empty and pd.notna(fam_total_row.iloc[0]["OBS_VALUE"]) else None
    fam_codes = [
        ("NBFAM_TFN_21", "Couple sans enfant"),
        ("NBFAM_TFN_22", "Couple avec enfant(s)"),
        ("NBFAM_TFN_11", "Père seul avec enfant(s)"),
        ("NBFAM_TFN_12", "Mère seule avec enfant(s)"),
    ]
    for code, label in fam_codes:
        rows = df_geo[df_geo.TAB_MEASURE == code]
        if rows.empty or rows.iloc[0].get("CONF_STATUS") == "C":
            continue
        v = rows.iloc[0].get("OBS_VALUE")
        if pd.notna(v) and fam_total:
            familles.append({"label": label, "value": round(float(v), 1), "pct": round(float(v) / fam_total * 1000) / 10})

    return {
        "pyramide_ages": {"quality_flag": "ok" if pyramide else ("secret" if any_secret else "missing"), "annee": 2023, "source": "insee_dossier_complet", "tranches": pyramide},
        "diplomes": {"quality_flag": "ok" if diploma else "missing", "annee": 2023, "source": "insee_dossier_complet", "note": "Population non scolarisée de 15 ans ou plus.", "repartition": diploma},
        "structure_familles": {"quality_flag": "ok" if familles else "missing", "annee": 2023, "source": "insee_dossier_complet", "nombre_familles": {"value": fam_total, "quality_flag": "ok" if fam_total else "missing"}, "repartition": familles},
        "revenus_pauvrete": {
            "niveau_vie_median": pick(df_geo, "MED_SL"),
            "taux_pauvrete": pick(df_geo, "PR_MD60"),
        },
    }


def build_economie(df_geo):
    secteurs = [
        ("UNIT_LOC_ACTIVITY_GI", "Commerce, transports, hébergement-restauration"),
        ("UNIT_LOC_ACTIVITY_OQ", "Administration, enseignement, santé, action sociale"),
        ("UNIT_LOC_ACTIVITY_MN", "Activités spécialisées, scientifiques, services aux entreprises"),
        ("UNIT_LOC_ACTIVITY_RU", "Autres activités de services"),
        ("UNIT_LOC_ACTIVITY_FZ", "Construction"),
        ("UNIT_LOC_ACTIVITY_BE", "Industrie"),
        ("UNIT_LOC_ACTIVITY_KZ", "Activités financières et d'assurance"),
        ("UNIT_LOC_ACTIVITY_LZ", "Activités immobilières"),
        ("UNIT_LOC_ACTIVITY_JZ", "Information et communication"),
    ]
    etab_total = pick(df_geo, "UNIT_LOC")
    secteurs_out = []
    total_v = etab_total.get("value")
    for code, label in secteurs:
        rows = df_geo[df_geo.TAB_MEASURE == code]
        if rows.empty or rows.iloc[0].get("CONF_STATUS") == "C":
            continue
        v = rows.iloc[0].get("OBS_VALUE")
        if pd.notna(v) and total_v:
            secteurs_out.append({"label": label, "value": round(float(v), 1), "pct": round(float(v) / total_v * 1000) / 10})

    equip_types = [
        ("FACILITIES_FACILITY_TYPE_B201", "Supérette"),
        ("FACILITIES_FACILITY_TYPE_B202", "Épicerie"),
        ("FACILITIES_FACILITY_TYPE_B104", "Hypermarché / grand magasin"),
        ("FACILITIES_FACILITY_TYPE_B105", "Supermarché"),
        ("FACILITIES_FACILITY_TYPE_D265", "Médecin généraliste"),
        ("FACILITIES_FACILITY_TYPE_D307", "Pharmacie"),
        ("FACILITIES_FACILITY_TYPE_D277", "Chirurgien-dentiste"),
        ("FACILITIES_FACILITY_TYPE_C107", "École maternelle"),
        ("FACILITIES_FACILITY_TYPE_C108", "École primaire"),
        ("FACILITIES_FACILITY_TYPE_C201", "Collège"),
        ("FACILITIES_FACILITY_TYPE_C301", "Lycée général et/ou technologique"),
        ("FACILITIES_FACILITY_TYPE_F307", "Bibliothèque"),
    ]
    equipements = {}
    for code, label in equip_types:
        rows = df_geo[df_geo.TAB_MEASURE == code]
        equipements[label] = pick(df_geo, code) if not rows.empty else {"value": None, "quality_flag": "missing", "source": "insee_dossier_complet"}

    return {
        "entreprises": {
            "etablissements_actifs": etab_total,
            "annee": 2024,
            "secteurs": secteurs_out,
        },
        "equipements": {
            "annee": 2025,
            "denombrement": equipements,
        },
    }


def main():
    communes95 = json.loads((OUT / "communes95.json").read_text(encoding="utf-8"))
    commune_codes = [c["code"] for c in communes95]
    epci_profiles = json.loads((OUT / "epci_profiles.json").read_text(encoding="utf-8"))
    epci_codes = [c for c in epci_profiles if not c.startswith("special-")]

    df = load_filtered(commune_codes, epci_codes)
    print(f"{len(df)} lignes chargées depuis dossier_complet.parquet")

    commune_profiles = json.loads((OUT / "commune_profiles.json").read_text(encoding="utf-8"))
    for code, profile in commune_profiles.items():
        df_geo = df[(df.GEO == code) & (df.GEO_OBJECT == "COM")]
        if df_geo.empty:
            continue
        h = build_habitants(df_geo)
        profile["themes"]["habitants"]["pyramide_ages"] = h["pyramide_ages"]
        profile["themes"]["habitants"]["diplomes"] = h["diplomes"]
        profile["themes"]["habitants"]["structure_familles"] = h["structure_familles"]
        profile["themes"]["habitants"]["revenus_pauvrete"] = h["revenus_pauvrete"]
        profile["themes"]["economie_equipements"] = build_economie(df_geo)
    (OUT / "commune_profiles.json").write_text(json.dumps(commune_profiles, ensure_ascii=False, indent=1), encoding="utf-8")

    epci_out = json.loads((OUT / "epci_profiles.json").read_text(encoding="utf-8"))
    for code, profile in epci_out.items():
        df_geo = df[(df.GEO == code) & (df.GEO_OBJECT == "EPCI")]
        if df_geo.empty:
            # communes isolées (Argenteuil, Bezons) : on agrège leurs propres lignes commune
            member_codes = profile.get("members") or []
            df_geo = df[(df.GEO.isin(member_codes)) & (df.GEO_OBJECT == "COM")]
        if df_geo.empty:
            continue
        h = build_habitants(df_geo)
        profile["themes"]["habitants"]["pyramide_ages"] = h["pyramide_ages"]
        profile["themes"]["habitants"]["diplomes"] = h["diplomes"]
        profile["themes"]["habitants"]["structure_familles"] = h["structure_familles"]
        profile["themes"]["habitants"]["revenus_pauvrete"] = h["revenus_pauvrete"]
        profile["themes"]["economie_equipements"] = build_economie(df_geo)
    (OUT / "epci_profiles.json").write_text(json.dumps(epci_out, ensure_ascii=False, indent=1), encoding="utf-8")

    dept_profile = json.loads((OUT / "departement_profile.json").read_text(encoding="utf-8"))
    df_geo = df[(df.GEO == "95") & (df.GEO_OBJECT == "DEP")]
    h = build_habitants(df_geo)
    dept_profile["themes"]["habitants"]["pyramide_ages"] = h["pyramide_ages"]
    dept_profile["themes"]["habitants"]["diplomes"] = h["diplomes"]
    dept_profile["themes"]["habitants"]["structure_familles"] = h["structure_familles"]
    dept_profile["themes"]["habitants"]["revenus_pauvrete"] = h["revenus_pauvrete"]
    dept_profile["themes"]["economie_equipements"] = build_economie(df_geo)
    (OUT / "departement_profile.json").write_text(json.dumps(dept_profile, ensure_ascii=False, indent=1), encoding="utf-8")

    print("Terminé : habitants (pyramide/diplômes/familles/revenus) et économie & équipements enrichis.")


if __name__ == "__main__":
    main()
