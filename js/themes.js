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
      intro: "Population et, à terme, âges, familles, diplômes et revenus.",
      groups: [
        {
          title: "POPULATION",
          layers: [
            { key: "population_totale", label: "Population totale", unit: "hab.", ramp: ["#eef2f9", "#3978b8", "#0b2f57"], get: (p) => p.themes.habitants.population_totale.value },
          ],
        },
      ],
      pending: [
        { label: "Pyramide des âges", note: "Nécessite le jeu Insee population par âge (RP)." },
        { label: "Structure des familles", note: "Nécessite le jeu Insee structure des familles (RP)." },
        { label: "Revenus, pauvreté, inégalités", note: "Nécessite Filosofi (Insee-DGFiP)." },
      ],
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
      ],
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
      ],
    },

    economie_equipements: {
      label: "Économie & Équipements",
      color: "#c76524",
      intro: "Entreprises, établissements et équipements de proximité — en construction.",
      groups: [],
      pending: [
        { label: "Entreprises & établissements", note: "Nécessite Sirene (Insee)." },
        { label: "Équipements & services", note: "Nécessite la Base Permanente des Équipements (Insee)." },
      ],
    },
  };

  function pctHelper(num, den) {
    if (num == null || !den) return null;
    return (num / den) * 100;
  }
})();
