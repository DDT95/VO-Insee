# Portrait Insee — Val-d'Oise

Portrait statistique interactif du Val-d'Oise, fondé sur les données Insee : habitants, emploi &amp; mobilités, logement, économie — à l'échelle commune ou EPCI.

**[Voir la carte](https://ddt95.github.io/VO-Insee/)**

## Architecture

Une seule carte, un switch thématique en tête de panneau (Habitants / Emploi &amp; Mobilités / Logement / Économie &amp; Équipements) qui pilote à la fois :
- les couches de coloration de la carte,
- les indicateurs proposés dans le panneau,
- la synthèse affichée dans le volet droit et sur la fiche territoriale imprimable/PDF.

Aucune donnée n'est recalculée ou inventée pour ce dépôt : les thèmes Logement et Emploi &amp; Mobilités **réutilisent tels quels** les profils déjà calculés par [`val-doise-logement-habitat`](https://github.com/DDT95/val-doise-logement-habitat) et [`val-doise-domicile-travail`](https://github.com/DDT95/val-doise-domicile-travail) (voir `scripts/build_profiles.py`).

## État d'avancement par thème

| Thème | Statut | Détail |
|---|---|---|
| **Logement** | Complet | Repris de l'observatoire logement (parc, occupation, vacance, social, construction, rénovation). |
| **Emploi & Mobilités** | Complet | Repris de l'observatoire domicile-travail (CSP, emploi, temps de travail, transport). Porte sur les **actifs occupés résidents**, pas la population générale — signalé partout où c'est affiché. |
| **Habitants** | Complet | Population, pyramide des âges, diplômes, structure des familles (Insee RP2023), niveau de vie médian et taux de pauvreté (Insee-DGFiP Filosofi 2023) — via la Base du dossier complet. |
| **Économie & Équipements** | Complet | Entreprises et établissements actifs par secteur (Insee REE 2024), commerces, santé et éducation de proximité (Insee BPE 2025) — via la Base du dossier complet. |

Le détail précis de chaque source (producteur, millésime, licence, prudence méthodologique) est dans [`data/sources.json`](data/sources.json).

## Export / impression

Sur chaque fiche territoriale, l'utilisateur choisit lui-même entre un PDF mis en page (html2pdf) ou l'impression navigateur — aucune génération automatique.

## Mise à jour des données

Les données Insee (RP, Filosofi, Sirene, BPE) ne sont pas publiées en flux continu — elles sortent par millésime. Un workflow GitHub Actions ([`check-insee-updates.yml`](.github/workflows/check-insee-updates.yml)) vérifie chaque semaine si les pages sources ont changé et ouvre une issue automatiquement le cas échéant, plutôt que de dépendre d'une vérification manuelle.

## Développement local

Dépôt statique, aucune dépendance de build.

```bash
python3 -m http.server 8080
```

Puis ouvrir `http://localhost:8080/`.

Pour régénérer `data/processed/commune_profiles.json`, `epci_profiles.json` et `departement_profile.json` à partir des dépôts sources (nécessite `val-doise-logement-habitat` et `val-doise-domicile-travail` clonés au même niveau) :

```bash
python3 scripts/build_profiles.py
```

Puis pour enrichir Habitants et Économie & Équipements depuis la Base du dossier complet Insee (télécharge ~340 Mo dans `data/raw/`, non versionné) :

```bash
python3 -m venv .venv-data && source .venv-data/bin/activate && pip install pandas pyarrow
curl -sL -A "Mozilla/5.0" -o data/raw/dossier_complet.parquet "https://www.insee.fr/fr/statistiques/fichier/5359146/dossier_complet.parquet"
python3 scripts/build_dossier_complet.py
```

## Sources principales

Insee (Base du dossier complet — RP2023, Filosofi 2023, REE 2024, BPE 2025 ; RP2022 Mobilités professionnelles ; RP2023 Logement ; populations légales), SDES (RPLS), et les dépôts [`val-doise-logement-habitat`](https://github.com/DDT95/val-doise-logement-habitat) / [`val-doise-domicile-travail`](https://github.com/DDT95/val-doise-domicile-travail). Détail complet dans `data/sources.json`.
