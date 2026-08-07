#!/usr/bin/env python3
"""Extrait, depuis la Base du dossier complet Insee (comparateur de territoire),
les indicateurs Habitants (âges, diplômes, familles, statut conjugal, scolarisation,
revenus/pauvreté), Emploi & Mobilités (chômage RP, salaires) et Économie & Équipements
(entreprises, créations, tourisme, équipements) pour le Val-d'Oise.

Source : https://www.insee.fr/fr/statistiques/5359146 (dossier_complet.parquet).
Aucune valeur n'est recalculée à la main au-delà de sommes/pourcentages explicites ;
le CONF_STATUS Insee ('C' = secret statistique) est toujours respecté.

C'est le « loader » de VO-Insee : à relancer (avec un dossier_complet.parquet à jour,
téléchargé depuis la source ci-dessus) pour rafraîchir toutes les données Insee du site.
"""
import json
from pathlib import Path

import pandas as pd
import pyarrow as pa
import pyarrow.compute as pc
import pyarrow.dataset as ds

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "raw" / "dossier_complet.parquet"
OUT = ROOT / "data" / "processed"

COLS = ["GEO", "GEO_LABEL", "GEO_OBJECT", "ID_TAB", "TAB_MEASURE", "TAB_MEASURE_LABEL", "TIME_PERIOD", "OBS_VALUE", "CONF_STATUS"]


def load_filtered(commune_codes, epci_codes):
    d = ds.dataset(RAW)
    parts = []
    expr_com = (ds.field("GEO_OBJECT") == "COM") & pc.is_in(ds.field("GEO"), pa.array(commune_codes))
    parts.append(d.to_table(filter=expr_com, columns=COLS).to_pandas())
    expr_epci = (ds.field("GEO_OBJECT") == "EPCI") & pc.is_in(ds.field("GEO"), pa.array(epci_codes))
    parts.append(d.to_table(filter=expr_epci, columns=COLS).to_pandas())
    expr_dep = (ds.field("GEO_OBJECT") == "DEP") & (ds.field("GEO") == "95")
    parts.append(d.to_table(filter=expr_dep, columns=COLS).to_pandas())
    df = pd.concat(parts, ignore_index=True)
    # une seule ligne par (GEO, TAB_MEASURE) : on garde le millésime le plus récent
    df = df.sort_values("TIME_PERIOD").drop_duplicates(subset=["GEO", "GEO_OBJECT", "TAB_MEASURE"], keep="last")
    return df


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


def val_of(df_geo, measure):
    rows = df_geo[df_geo.TAB_MEASURE == measure]
    if rows.empty or rows.iloc[0].get("CONF_STATUS") == "C":
        return None
    v = rows.iloc[0].get("OBS_VALUE")
    return float(v) if pd.notna(v) else None


def series_from_codes(df_geo, codes, total):
    out = []
    for code, label in codes:
        v = val_of(df_geo, code)
        if v is not None and total:
            out.append({"label": label, "value": round(v, 1), "pct": round(v / total * 1000) / 10})
    return out


# ---------- Habitants ----------
def build_habitants(df_geo):
    age_labels = {
        "POP_SEX_M_AGE_Y_LT20": "Moins de 20 ans", "POP_SEX_M_AGE_Y20T64": "20 à 64 ans", "POP_SEX_M_AGE_Y_GE65": "65 ans ou plus",
        "POP_SEX_F_AGE_Y_LT20": "Moins de 20 ans", "POP_SEX_F_AGE_Y20T64": "20 à 64 ans", "POP_SEX_F_AGE_Y_GE65": "65 ans ou plus",
    }
    brackets = {"Moins de 20 ans": 0.0, "20 à 64 ans": 0.0, "65 ans ou plus": 0.0}
    any_secret, any_value = False, False
    for code, bracket in age_labels.items():
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
    total_age = sum(brackets.values())
    pyramide = [{"label": k, "value": round(v, 1), "pct": round(v / total_age * 1000) / 10} for k, v in brackets.items()] if any_value and total_age else []

    diploma_total = val_of(df_geo, "POP")
    diploma = series_from_codes(df_geo, [
        ("POP_EDUC_001T100_RP", "Aucun diplôme"), ("POP_EDUC_200_RP", "Brevet des collèges"), ("POP_EDUC_300_RP", "CAP, BEP"),
        ("POP_EDUC_350T351_RP", "Baccalauréat"), ("POP_EDUC_500_RP", "Bac+2"), ("POP_EDUC_600_RP", "Licence (bac+3/+4)"), ("POP_EDUC_700_RP", "Bac+5 ou plus"),
    ], diploma_total)

    fam_total = val_of(df_geo, "NBFAM")
    familles = series_from_codes(df_geo, [
        ("NBFAM_TFN_21", "Couple sans enfant"), ("NBFAM_TFN_22", "Couple avec enfant(s)"),
        ("NBFAM_TFN_11", "Père seul avec enfant(s)"), ("NBFAM_TFN_12", "Mère seule avec enfant(s)"),
    ], fam_total)

    civil_total = val_of(df_geo, "POP_AGE_Y_GE15")
    statut_conjugal = series_from_codes(df_geo, [
        ("POP_CIVIL_STATUS_6", "Célibataire"), ("POP_CIVIL_STATUS_1", "Marié"), ("POP_CIVIL_STATUS_3", "En concubinage, union libre"),
        ("POP_CIVIL_STATUS_2", "Pacsé"), ("POP_CIVIL_STATUS_5", "Divorcé"), ("POP_CIVIL_STATUS_4", "Veuf"),
    ], civil_total)

    scol_brackets = [("Y2T5", "2-5 ans"), ("Y6T10", "6-10 ans"), ("Y11T14", "11-14 ans"), ("Y15T17", "15-17 ans"), ("Y18T24", "18-24 ans"), ("Y25T29", "25-29 ans")]
    scolarisation = []
    for code, label in scol_brackets:
        pop = val_of(df_geo, f"POP_AGE_{code}")
        stud = val_of(df_geo, f"POP_STUD_1_AGE_{code}")
        if pop and stud is not None:
            scolarisation.append({"label": label, "value": round(stud, 1), "pct": round(stud / pop * 1000) / 10})

    return {
        "pyramide_ages": {"quality_flag": "ok" if pyramide else ("secret" if any_secret else "missing"), "annee": 2023, "source": "insee_dossier_complet", "tranches": pyramide},
        "diplomes": {"quality_flag": "ok" if diploma else "missing", "annee": 2023, "source": "insee_dossier_complet", "note": "Population non scolarisée de 15 ans ou plus.", "repartition": diploma},
        "structure_familles": {"quality_flag": "ok" if familles else "missing", "annee": 2023, "source": "insee_dossier_complet", "nombre_familles": {"value": fam_total, "quality_flag": "ok" if fam_total else "missing"}, "repartition": familles},
        "statut_conjugal": {"quality_flag": "ok" if statut_conjugal else "missing", "annee": 2023, "source": "insee_dossier_complet", "note": "Population de 15 ans ou plus.", "repartition": statut_conjugal},
        "scolarisation": {"quality_flag": "ok" if scolarisation else "missing", "annee": 2023, "source": "insee_dossier_complet", "note": "Taux de scolarisation par tranche d'âge.", "par_tranche": scolarisation},
        "revenus_pauvrete": {
            "niveau_vie_median": pick(df_geo, "MED_SL"),
            "taux_pauvrete": pick(df_geo, "PR_MD60"),
        },
    }


# ---------- Emploi & Mobilités (compléments RP) ----------
def build_emploi_extra(df_geo):
    actifs = val_of(df_geo, "POP_EMPSTA_ENQ_1T2_AGE_Y15T64")
    chomeurs = val_of(df_geo, "POP_EMPSTA_ENQ_2_AGE_Y15T64")
    taux_chomage = round(chomeurs / actifs * 1000) / 10 if actifs and chomeurs is not None else None

    salaires_sexe = {
        "ensemble": pick(df_geo, "SALAIRE_NET_EQTP_MENSUEL_MOYENNE"),
        "hommes": pick(df_geo, "SALAIRE_NET_EQTP_MENSUEL_MOYENNE_SEX_M"),
        "femmes": pick(df_geo, "SALAIRE_NET_EQTP_MENSUEL_MOYENNE_SEX_F"),
    }
    salaires_csp = []
    for code, label in [("PCS_ESE_1T3", "Cadres"), ("PCS_ESE_4", "Professions intermédiaires"), ("PCS_ESE_5", "Employés"), ("PCS_ESE_6", "Ouvriers")]:
        v = val_of(df_geo, f"SALAIRE_NET_EQTP_MENSUEL_MOYENNE_{code}")
        if v is not None:
            salaires_csp.append({"label": label, "value": round(v, 0)})

    return {
        "chomage_rp": {
            "quality_flag": "ok" if taux_chomage is not None else "missing",
            "annee": 2023,
            "source": "insee_dossier_complet",
            "scope_note": "Chômage au sens du recensement, population 15-64 ans — champ RP, distinct des actifs occupés résidents MOBPRO ci-dessus.",
            "taux_chomage_15_64": {"value": taux_chomage, "unit": "%", "quality_flag": "ok" if taux_chomage is not None else "missing", "source": "insee_dossier_complet"},
        },
        "salaires": {
            "quality_flag": "ok" if salaires_sexe["ensemble"].get("value") is not None else "missing",
            "annee": 2023,
            "source": "insee_dossier_complet",
            "note": "Salaire net mensuel moyen en équivalent temps plein (EQTP).",
            "par_sexe": salaires_sexe,
            "par_csp": salaires_csp,
        },
    }


# ---------- Économie & Équipements ----------
def build_economie(df_geo):
    secteurs_codes = [
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
    secteurs_out = series_from_codes(df_geo, secteurs_codes, etab_total.get("value"))

    equip_types = [
        ("FACILITIES_FACILITY_TYPE_B201", "Supérette"), ("FACILITIES_FACILITY_TYPE_B202", "Épicerie"),
        ("FACILITIES_FACILITY_TYPE_B104", "Hypermarché / grand magasin"), ("FACILITIES_FACILITY_TYPE_B105", "Supermarché"),
        ("FACILITIES_FACILITY_TYPE_B207", "Boulangerie-pâtisserie"), ("FACILITIES_FACILITY_TYPE_B316", "Station-service"),
        ("FACILITIES_FACILITY_TYPE_B326", "Station de recharge de véhicules électriques"), ("FACILITIES_FACILITY_TYPE_A501", "Coiffure"),
        ("FACILITIES_FACILITY_TYPE_D265", "Médecin généraliste"), ("FACILITIES_FACILITY_TYPE_D307", "Pharmacie"),
        ("FACILITIES_FACILITY_TYPE_D277", "Chirurgien-dentiste"), ("FACILITIES_FACILITY_TYPE_D279", "Masseur-kinésithérapeute"),
        ("FACILITIES_FACILITY_TYPE_D281", "Infirmier"), ("FACILITIES_FACILITY_TYPE_D250", "Psychologue"),
        ("FACILITIES_FACILITY_TYPE_C107", "École maternelle"), ("FACILITIES_FACILITY_TYPE_C108", "École primaire"),
        ("FACILITIES_FACILITY_TYPE_C109", "École élémentaire"), ("FACILITIES_FACILITY_TYPE_C201", "Collège"),
        ("FACILITIES_FACILITY_TYPE_C301", "Lycée général et/ou technologique"), ("FACILITIES_FACILITY_TYPE_C302", "Lycée d'enseignement professionnel"),
        ("FACILITIES_FACILITY_TYPE_F307", "Bibliothèque"),
    ]
    equipements = {label: pick(df_geo, code) for code, label in equip_types}

    creations = {
        "entreprises_2025": pick(df_geo, "BURE"),
        "etablissements_2025": pick(df_geo, "UNIT_LOC_BURE"),
    }

    tourisme = {
        "hotels": {"etablissements": pick(df_geo, "UNIT_LOC_ACTIVITY_I551"), "places": pick(df_geo, "PLACE_ACTIVITY_I551")},
        "campings": {"etablissements": pick(df_geo, "UNIT_LOC_ACTIVITY_I553"), "places": pick(df_geo, "PLACE_ACTIVITY_I553")},
        "autres_hebergements": {"etablissements": pick(df_geo, "UNIT_LOC_ACTIVITY_I552"), "places_lits": pick(df_geo, "BEDPLACE_ACTIVITY_I552")},
        "annee": 2026,
    }

    taille_codes = [
        ("UNIT_LOC_NUMBER_EMPL_E0", "0 salarié"), ("UNIT_LOC_NUMBER_EMPL_E1T4", "1 à 4 salariés"), ("UNIT_LOC_NUMBER_EMPL_E5T9", "5 à 9 salariés"),
        ("UNIT_LOC_NUMBER_EMPL_E10T19", "10 à 19 salariés"), ("UNIT_LOC_NUMBER_EMPL_E20T49", "20 à 49 salariés"),
        ("UNIT_LOC_NUMBER_EMPL_E50T99", "50 salariés ou plus"),
    ]
    # 50+ regroupe 50-99, 100-199, 200-499, 500+ pour rester lisible.
    # Champ RES (résultats sectoriels) plus restreint que UNIT_LOC (DEN) : pourcentages calculés
    # sur le total des tranches elles-mêmes, jamais sur le total UNIT_LOC (périmètres différents).
    e50plus = sum(v for v in [val_of(df_geo, c) for c in ["UNIT_LOC_NUMBER_EMPL_E50T99", "UNIT_LOC_NUMBER_EMPL_E100T199", "UNIT_LOC_NUMBER_EMPL_E200T499", "UNIT_LOC_NUMBER_EMPL_E_GE500"]] if v is not None) or None
    taille_values = [(label, val_of(df_geo, code)) for code, label in taille_codes[:5]]
    if e50plus is not None:
        taille_values.append(("50 salariés ou plus", e50plus))
    taille_denom = sum(v for _, v in taille_values if v is not None) or None
    taille = [{"label": label, "value": round(v, 1), "pct": round(v / taille_denom * 1000) / 10} for label, v in taille_values if v is not None and taille_denom]

    return {
        "entreprises": {
            "etablissements_actifs": etab_total,
            "annee": 2024,
            "secteurs": secteurs_out,
            "par_taille": taille,
            "par_taille_note": "Champ légèrement plus restreint que le total des établissements actifs (résultats sectoriels REE) : pourcentages calculés sur le total des tranches, pas sur le total ci-dessus.",
        },
        "creations": {"annee": 2025, "quality_flag": "ok" if creations["entreprises_2025"].get("value") is not None else "missing", **creations},
        "tourisme": tourisme,
        "equipements": {
            "annee": 2025,
            "denombrement": equipements,
        },
    }


def enrich(profile, df_geo):
    h = build_habitants(df_geo)
    profile["themes"]["habitants"].update(h)
    profile["themes"]["emploi_mobilites"].update(build_emploi_extra(df_geo))
    profile["themes"]["economie_equipements"] = build_economie(df_geo)


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
        enrich(profile, df_geo)
    (OUT / "commune_profiles.json").write_text(json.dumps(commune_profiles, ensure_ascii=False, indent=1), encoding="utf-8")

    epci_out = json.loads((OUT / "epci_profiles.json").read_text(encoding="utf-8"))
    for code, profile in epci_out.items():
        df_geo = df[(df.GEO == code) & (df.GEO_OBJECT == "EPCI")]
        if df_geo.empty:
            member_codes = profile.get("members") or []
            df_geo = df[(df.GEO.isin(member_codes)) & (df.GEO_OBJECT == "COM")]
        if df_geo.empty:
            continue
        enrich(profile, df_geo)
    (OUT / "epci_profiles.json").write_text(json.dumps(epci_out, ensure_ascii=False, indent=1), encoding="utf-8")

    dept_profile = json.loads((OUT / "departement_profile.json").read_text(encoding="utf-8"))
    df_geo = df[(df.GEO == "95") & (df.GEO_OBJECT == "DEP")]
    enrich(dept_profile, df_geo)
    (OUT / "departement_profile.json").write_text(json.dumps(dept_profile, ensure_ascii=False, indent=1), encoding="utf-8")

    print("Terminé : habitants, emploi & mobilités (chômage, salaires) et économie & équipements (créations, tourisme, taille) enrichis.")


if __name__ == "__main__":
    main()
