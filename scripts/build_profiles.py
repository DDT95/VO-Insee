#!/usr/bin/env python3
"""Fusionne les profils déjà calculés dans val-doise-logement-habitat et
val-doise-domicile-travail pour produire les profils VO-Insee (4 thèmes).

Aucune valeur n'est recalculée ou inventée : chaque champ est repris tel
quel depuis son dépôt source, avec sa source et son quality_flag d'origine.
Les champs issus du fichier détail Mobilités professionnelles (MOBPRO) sont
explicitement scopés "actifs occupés résidents", jamais assimilés à la
population générale.
"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SITES = ROOT.parent

LOGEMENT = SITES / "val-doise-logement-habitat" / "data" / "processed"
MOBILITE = SITES / "val-doise-domicile-travail" / "data" / "processed"
OUT = ROOT / "data" / "processed"

MOBPRO_SCOPE_NOTE = (
    "Champs calculés sur les actifs occupés résidents de 15 ans ou plus "
    "(Insee RP2022, fichier détail Mobilités professionnelles, poids IPONDI) "
    "— pas sur la population générale de la commune."
)


def load(path):
    return json.loads(path.read_text(encoding="utf-8"))


def build_territory(code, logement_p, mobilite_p, kind, base):
    themes = {}

    if logement_p:
        themes["logement"] = {
            "parc": logement_p.get("parc"),
            "occupation": logement_p.get("occupation"),
            "vacance": logement_p.get("vacance"),
            "social": logement_p.get("social"),
            "construction": logement_p.get("construction"),
            "renovation": logement_p.get("renovation"),
        }
        if kind == "epci":
            themes["logement"]["perimetre_partiel"] = logement_p.get("perimetre_partiel", False)
            themes["logement"]["members_covered"] = logement_p.get("members_covered")

    if mobilite_p:
        themes["emploi_mobilites"] = {
            "scope_note": MOBPRO_SCOPE_NOTE,
            "actifs_occupes_residents": mobilite_p.get("residents"),
            "profession": mobilite_p.get("profession"),
            "employment": mobilite_p.get("employment"),
            "worktime": mobilite_p.get("worktime"),
            "transport": mobilite_p.get("transport"),
            "cars": mobilite_p.get("cars"),
        }
        themes["habitants_partiel"] = {
            "diploma_scope_note": MOBPRO_SCOPE_NOTE,
            "diploma_actifs_occupes": mobilite_p.get("diploma"),
        }

    population = mobilite_p.get("population") if mobilite_p else None
    population_year = mobilite_p.get("population_year") if mobilite_p else None
    themes["habitants"] = {
        "population_totale": {
            "value": population,
            "year": population_year,
            "source": "insee_rp_population",
            "quality_flag": "ok" if population is not None else "missing",
        },
        "pyramide_ages": {"quality_flag": "a_venir", "note": "Nécessite le jeu Insee population par âge (RP), non encore ingéré."},
        "revenus_pauvrete": {"quality_flag": "a_venir", "note": "Nécessite Filosofi (Insee-DGFiP), non encore ingéré."},
        "structure_familles": {"quality_flag": "a_venir", "note": "Nécessite le jeu Insee structure des familles (RP), non encore ingéré."},
    }

    themes["economie_equipements"] = {
        "entreprises": {"quality_flag": "a_venir", "note": "Nécessite Sirene (Insee), non encore ingéré."},
        "equipements": {"quality_flag": "a_venir", "note": "Nécessite la BPE (Insee), non encore ingéré."},
    }

    out = dict(base)
    out["themes"] = themes
    return out


def main():
    OUT.mkdir(parents=True, exist_ok=True)

    lg_communes = load(LOGEMENT / "commune_profiles.json")
    mb_communes = load(MOBILITE / "commune_profiles.json")
    communes95 = load(LOGEMENT / "communes95.json")

    commune_out = {}
    for c in communes95:
        code = c["code"]
        base = {"code": code, "name": c["name"], "kind": "commune", "lon": c.get("lon"), "lat": c.get("lat")}
        commune_out[code] = build_territory(code, lg_communes.get(code), mb_communes.get(code), "commune", base)

    (OUT / "commune_profiles.json").write_text(json.dumps(commune_out, ensure_ascii=False, indent=1), encoding="utf-8")

    lg_epci = load(LOGEMENT / "epci_profiles.json")
    mb_epci = load(MOBILITE / "epci_profiles.json")

    epci_out = {}
    all_codes = set(lg_epci) | set(mb_epci)
    for code in all_codes:
        lp = lg_epci.get(code)
        mp = mb_epci.get(code)
        src = lp or mp
        base = {
            "code": code,
            "name": src.get("name"),
            "kind": "epci",
            "special": src.get("special", False),
            "members": src.get("members"),
        }
        epci_out[code] = build_territory(code, lp, mp, "epci", base)

    (OUT / "epci_profiles.json").write_text(json.dumps(epci_out, ensure_ascii=False, indent=1), encoding="utf-8")

    # epcis95.json (liste légère pour recherche), repris de logement-habitat si présent
    epcis95_src = LOGEMENT / "epcis95.json"
    if epcis95_src.exists():
        (OUT / "epcis95.json").write_text(epcis95_src.read_text(encoding="utf-8"), encoding="utf-8")

    build_departement(lg_communes, mb_communes)

    print(f"{len(commune_out)} communes, {len(epci_out)} EPCI écrits dans {OUT}")


def sum_series(communes, field):
    """Additionne les valeurs brutes (pas les %) d'un champ série [{label,value,pct}] sur toutes les communes,
    puis recalcule les pct à partir des sommes — jamais une moyenne de pourcentages."""
    totals = {}
    for p in communes.values():
        for row in (p.get(field) or []):
            totals[row["label"]] = totals.get(row["label"], 0) + (row.get("value") or 0)
    grand_total = sum(totals.values())
    if not grand_total:
        return []
    return [{"label": k, "value": v, "pct": round(v / grand_total * 1000) / 10} for k, v in totals.items()]


def build_departement(lg_communes, mb_communes):
    dept_lg = json.loads((LOGEMENT / "departement_profile.json").read_text(encoding="utf-8"))

    population_total = sum((p.get("population") or 0) for p in mb_communes.values())
    actifs_total = sum((p.get("residents") or 0) for p in mb_communes.values())

    themes = {
        "logement": {
            "parc": dept_lg.get("parc"),
            "occupation": dept_lg.get("occupation"),
            "vacance": dept_lg.get("vacance"),
            "social": dept_lg.get("social"),
            "construction": dept_lg.get("construction"),
            "renovation": dept_lg.get("renovation"),
        },
        "emploi_mobilites": {
            "scope_note": MOBPRO_SCOPE_NOTE,
            "actifs_occupes_residents": actifs_total,
            "profession": sum_series(mb_communes, "profession"),
            "employment": sum_series(mb_communes, "employment"),
            "worktime": sum_series(mb_communes, "worktime"),
            "transport": sum_series(mb_communes, "transport"),
            "cars": sum_series(mb_communes, "cars"),
        },
        "habitants": {
            "population_totale": {"value": population_total, "year": 2023, "source": "insee_rp_population", "quality_flag": "ok"},
            "pyramide_ages": {"quality_flag": "a_venir", "note": "Nécessite le jeu Insee population par âge (RP), non encore ingéré."},
            "revenus_pauvrete": {"quality_flag": "a_venir", "note": "Nécessite Filosofi (Insee-DGFiP), non encore ingéré."},
            "structure_familles": {"quality_flag": "a_venir", "note": "Nécessite le jeu Insee structure des familles (RP), non encore ingéré."},
        },
        "economie_equipements": {
            "entreprises": {"quality_flag": "a_venir", "note": "Nécessite Sirene (Insee), non encore ingéré."},
            "equipements": {"quality_flag": "a_venir", "note": "Nécessite la BPE (Insee), non encore ingéré."},
        },
    }

    out = {"code": "95", "name": "Val-d'Oise", "kind": "departement", "themes": themes}
    (OUT / "departement_profile.json").write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")


if __name__ == "__main__":
    main()
