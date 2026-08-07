(function () {
  "use strict";

  function pct(num, den) {
    if (num == null || !den) return null;
    return (num / den) * 100;
  }
  function findPct(arr, label) {
    if (!arr) return null;
    const row = arr.find((r) => r.label === label);
    return row ? row.pct : null;
  }
  function findValue(arr, label) {
    if (!arr) return null;
    const row = arr.find((r) => r.label === label);
    return row ? row.value : null;
  }
  window.VOInsee = window.VOInsee || {};
  window.VOInsee.helpers = { pct, findPct, findValue };

  window.VOInsee.THEMES = {
    habitants: {
      label: "Habitants",
      color: "#000091",
      intro: "Population, âges, diplômes, familles et revenus.",
      groups: [
        {
          title: "POPULATION & ÂGES",
          layers: [
            { key: "population_totale", label: "Population totale", unit: "hab.", ramp: ["#eef2f9", "#3978b8", "#0b2f57"], get: (p) => p.themes.habitants.population_totale.value },
            { key: "part_65_plus", label: "Part de 65 ans ou plus", unit: "%", ramp: ["#f3eef9", "#6f4c9b", "#2e1a4d"], get: (p) => window.VOInsee.helpers.findPct(p.themes.habitants.pyramide_ages?.tranches, "65 ans ou plus") },
          ],
        },
        {
          title: "REVENUS & PAUVRETÉ",
          layers: [
            { key: "niveau_vie_median", label: "Niveau de vie médian", unit: "€", ramp: ["#eef7ee", "#18753c", "#0c3a1e"], get: (p) => p.themes.habitants.revenus_pauvrete?.niveau_vie_median?.value },
            { key: "taux_pauvrete", label: "Taux de pauvreté", unit: "%", ramp: ["#fdf0e9", "#e07a2f", "#7a3200"], get: (p) => p.themes.habitants.revenus_pauvrete?.taux_pauvrete?.value },
          ],
        },
        {
          title: "DIPLÔMES & FAMILLES",
          layers: [
            { key: "part_bac5", label: "Part de diplômés bac+5 ou plus", unit: "%", ramp: ["#eef2f9", "#3978b8", "#0b2f57"], get: (p) => window.VOInsee.helpers.findPct(p.themes.habitants.diplomes?.repartition, "Bac+5 ou plus") },
            { key: "part_monoparentales", label: "Part de familles monoparentales", unit: "%", ramp: ["#fdeef2", "#e85d8e", "#7a1338"], get: (p) => {
              const r = p.themes.habitants.structure_familles?.repartition;
              if (!r) return null;
              const pere = window.VOInsee.helpers.findPct(r, "Père seul avec enfant(s)") || 0;
              const mere = window.VOInsee.helpers.findPct(r, "Mère seule avec enfant(s)") || 0;
              return pere + mere;
            } },
          ],
        },
        {
          title: "MOBILITÉ RÉSIDENTIELLE",
          layers: [
            { key: "part_stabilite", label: "Part n'ayant pas déménagé (1 an)", unit: "%", ramp: ["#eef7ee", "#18753c", "#0c3a1e"], get: (p) => window.VOInsee.helpers.findPct(p.themes.habitants.mobilite_residentielle?.repartition, "N'a pas déménagé") },
          ],
        },
      ],
      scopeNote: "Revenus/pauvreté (Filosofi 2023) et diplômes/familles/âges (RP2023) : les petites communes peuvent être secrétisées (secret statistique), affichées en gris plutôt qu'estimées.",
      ranking: { label: "Les plus peuplées", unit: "hab.", direction: "desc", get: (p) => p.themes.habitants.population_totale.value },
      summary: (p) => {
        const pop = p.themes.habitants.population_totale.value;
        const pauvrete = p.themes.habitants.revenus_pauvrete?.taux_pauvrete?.value;
        return `${fmtNum(pop)} hab.` + (pauvrete != null ? ` · ${fmtNum(pauvrete)}% de pauvreté` : "");
      },
    },

    emploi_mobilites: {
      label: "Emploi & Mobilités",
      color: "#18753c",
      intro: "Actifs occupés résidents : catégories socioprofessionnelles, emploi, déplacements domicile-travail.",
      scopeNote: "Ces indicateurs portent sur les actifs occupés résidents de 15 ans ou plus (RP2022, fichier détail Mobilités professionnelles, poids IPONDI) — pas sur la population générale.",
      groups: [
        {
          title: "CATÉGORIES SOCIOPROFESSIONNELLES",
          layers: [
            { key: "part_cadres", label: "Part de cadres", unit: "%", ramp: ["#eef7ee", "#18753c", "#0c3a1e"], get: (p) => window.VOInsee.helpers.findPct(p.themes.emploi_mobilites.profession, "Cadres") },
            { key: "part_ouvriers", label: "Part d'ouvriers", unit: "%", ramp: ["#eef7ee", "#18753c", "#0c3a1e"], get: (p) => window.VOInsee.helpers.findPct(p.themes.emploi_mobilites.profession, "Ouvrier") },
          ],
        },
        {
          title: "EMPLOI",
          layers: [
            { key: "part_emploi_stable", label: "Part d'emplois stables", unit: "%", ramp: ["#eef2f9", "#3978b8", "#0b2f57"], get: (p) => window.VOInsee.helpers.findPct(p.themes.emploi_mobilites.employment, "Emploi stable") },
            { key: "part_temps_partiel", label: "Part de temps partiel", unit: "%", ramp: ["#eef2f9", "#3978b8", "#0b2f57"], get: (p) => window.VOInsee.helpers.findPct(p.themes.emploi_mobilites.worktime, "Temps partiel") },
          ],
        },
        {
          title: "DÉPLACEMENTS DOMICILE-TRAVAIL",
          layers: [
            { key: "part_voiture", label: "Part voiture pour aller travailler", unit: "%", ramp: ["#fdf0e9", "#e07a2f", "#7a3200"], get: (p) => window.VOInsee.helpers.findPct(p.themes.emploi_mobilites.transport, "Voiture, camion, fourgonnette") },
            { key: "part_tc", label: "Part transports en commun", unit: "%", ramp: ["#fdf0e9", "#e07a2f", "#7a3200"], get: (p) => window.VOInsee.helpers.findPct(p.themes.emploi_mobilites.transport, "Transports en commun") },
          ],
        },
        {
          title: "CHÔMAGE & SALAIRES",
          layers: [
            { key: "taux_chomage", label: "Taux de chômage (RP, 15-64 ans)", unit: "%", ramp: ["#fdeef2", "#e85d8e", "#7a1338"], get: (p) => p.themes.emploi_mobilites.chomage_rp?.taux_chomage_15_64?.value },
            { key: "salaire_moyen", label: "Salaire net mensuel moyen (EQTP)", unit: "€", ramp: ["#eef7ee", "#18753c", "#0c3a1e"], get: (p) => p.themes.emploi_mobilites.salaires?.par_sexe?.ensemble?.value },
          ],
        },
      ],
      ranking: { label: "La plus forte part de cadres", unit: "%", direction: "desc", get: (p) => window.VOInsee.helpers.findPct(p.themes.emploi_mobilites.profession, "Cadres") },
      summary: (p) => {
        const cadres = window.VOInsee.helpers.findPct(p.themes.emploi_mobilites.profession, "Cadres");
        const tc = window.VOInsee.helpers.findPct(p.themes.emploi_mobilites.transport, "Transports en commun");
        return (cadres != null ? `${fmtNum(cadres)}% de cadres` : "n. d.") + (tc != null ? ` · ${fmtNum(tc)}% en TC` : "");
      },
    },

    logement: {
      label: "Logement",
      color: "#6f4c9b",
      intro: "Parc, occupation, vacance, logement social, construction et rénovation.",
      groups: [
        {
          title: "STRUCTURE DU PARC",
          layers: [
            { key: "part_appartements", label: "Part d'appartements", unit: "%", ramp: ["#eef7f8", "#00a7b5", "#004a52"], get: (p) => pctHelper(p.themes.logement.parc.appartements?.value, p.themes.logement.parc.residences_principales?.value) },
            { key: "part_locataires", label: "Part de locataires", unit: "%", ramp: ["#eef2f9", "#3978b8", "#0b2f57"], get: (p) => pctHelper((p.themes.logement.occupation.locataires_prive?.value || 0) + (p.themes.logement.occupation.locataires_social?.value || 0), p.themes.logement.parc.residences_principales?.value) },
          ],
        },
        {
          title: "PARC SOCIAL",
          layers: [
            { key: "part_rpls", label: "Part RPLS des résidences principales", unit: "%", ramp: ["#f3eef9", "#6f4c9b", "#2e1a4d"], get: (p) => p.themes.logement.social.part_rpls_residences_principales?.value },
          ],
        },
        {
          title: "VACANCE",
          layers: [
            { key: "vacance_rp", label: "Taux de vacance RP", unit: "%", ramp: ["#fdf0e9", "#e07a2f", "#7a3200"], get: (p) => p.themes.logement.vacance.taux_vacance_rp?.value },
          ],
        },
        {
          title: "CHAUFFAGE & CONFORT",
          layers: [
            { key: "part_chauffage_elec", label: "Part de logements chauffés à l'électricité", unit: "%", ramp: ["#eef7f8", "#00a7b5", "#004a52"], get: (p) => window.VOInsee.helpers.findPct(p.themes.logement.energie_chauffage?.repartition, "Électricité") },
            { key: "part_stationnement", label: "Part avec stationnement", unit: "%", ramp: ["#eef2f9", "#3978b8", "#0b2f57"], get: (p) => p.themes.logement.part_avec_stationnement?.value },
          ],
        },
      ],
      ranking: { label: "Le plus de logements", unit: "logements", direction: "desc", get: (p) => p.themes.logement.parc.total?.value },
      summary: (p) => {
        const vac = p.themes.logement.vacance.taux_vacance_rp?.value;
        const rpls = p.themes.logement.social.part_rpls_residences_principales?.value;
        return (vac != null ? `${fmtNum(vac)}% de vacance` : "n. d.") + (rpls != null ? ` · ${fmtNum(rpls)}% de logements sociaux` : "");
      },
    },

    economie_equipements: {
      label: "Économie & Équipements",
      color: "#c76524",
      intro: "Entreprises et établissements actifs, commerces et équipements de proximité.",
      groups: [
        {
          title: "ENTREPRISES & ÉTABLISSEMENTS",
          layers: [
            { key: "etablissements_actifs", label: "Établissements actifs", unit: "étab.", ramp: ["#fdf0e9", "#e07a2f", "#7a3200"], get: (p) => p.themes.economie_equipements.entreprises?.etablissements_actifs?.value },
            { key: "emplois_salaries", label: "Emplois salariés", unit: "emplois", ramp: ["#f3eef9", "#6f4c9b", "#2e1a4d"], get: (p) => p.themes.economie_equipements.entreprises?.emplois_salaries?.value },
            { key: "part_commerce", label: "Part commerce, transport, hébergement", unit: "%", ramp: ["#fdf0e9", "#e07a2f", "#7a3200"], get: (p) => window.VOInsee.helpers.findPct(p.themes.economie_equipements.entreprises?.secteurs, "Commerce, transports, hébergement-restauration") },
          ],
        },
        {
          title: "ÉQUIPEMENTS DE PROXIMITÉ",
          layers: [
            { key: "nb_pharmacies", label: "Nombre de pharmacies", unit: "équip.", ramp: ["#eef7ee", "#18753c", "#0c3a1e"], get: (p) => p.themes.economie_equipements.equipements?.denombrement?.["Pharmacie"]?.value },
            { key: "nb_medecins", label: "Nombre de médecins généralistes", unit: "équip.", ramp: ["#eef7ee", "#18753c", "#0c3a1e"], get: (p) => p.themes.economie_equipements.equipements?.denombrement?.["Médecin généraliste"]?.value },
          ],
        },
        {
          title: "DYNAMISME & TOURISME",
          layers: [
            { key: "creations_entreprises", label: "Créations d'entreprises (2025)", unit: "créations", ramp: ["#eef2f9", "#3978b8", "#0b2f57"], get: (p) => p.themes.economie_equipements.creations?.entreprises_2025?.value },
            { key: "part_zero_salarie", label: "Part d'établissements sans salarié", unit: "%", ramp: ["#f3eef9", "#6f4c9b", "#2e1a4d"], get: (p) => window.VOInsee.helpers.findPct(p.themes.economie_equipements.entreprises?.par_taille, "0 salarié") },
          ],
        },
      ],
      ranking: { label: "Le plus d'établissements actifs", unit: "étab.", direction: "desc", get: (p) => p.themes.economie_equipements.entreprises?.etablissements_actifs?.value },
      summary: (p) => {
        const etabs = p.themes.economie_equipements.entreprises?.etablissements_actifs?.value;
        const pharm = p.themes.economie_equipements.equipements?.denombrement?.["Pharmacie"]?.value;
        return (etabs != null ? `${fmtNum(etabs)} établissements` : "n. d.") + (pharm != null ? ` · ${fmtNum(pharm)} pharmacies` : "");
      },
    },
  };

  function pctHelper(num, den) {
    if (num == null || !den) return null;
    return (num / den) * 100;
  }
  function fmtNum(v) {
    if (v == null) return "n. d.";
    return v.toLocaleString("fr-FR", { maximumFractionDigits: 1 });
  }
  window.VOInsee.helpers.fmtNum = fmtNum;
})();
