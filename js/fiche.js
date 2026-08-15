(function () {
  "use strict";

  const fmt = (n) => (n == null ? "n. d." : Math.round(n).toLocaleString("fr-FR"));
  const pctFmt = (n) => (n == null ? "n. d." : n.toLocaleString("fr-FR", { maximumFractionDigits: 1 }) + "%");
  const chartColors = ["#000091", "#00a7b5", "#e07a2f", "#e85d8e", "#18753c", "#ffd66b", "#6f4c9b"];
  const root = document.getElementById("profileRoot");
  const dialog = document.getElementById("exportDialog");
  const headerTitle = document.getElementById("headerTitle");
  const params = new URLSearchParams(location.search);
  const typeParam = params.get("type");
  const scale = typeParam === "departement" ? "departement" : typeParam === "epci" ? "epci" : "commune";
  const selectedId = scale === "departement" ? "95" : params.get("id");
  const theme = ["habitants", "emploi_mobilites", "logement", "economie_equipements"].includes(params.get("theme")) ? params.get("theme") : "habitants";
  let currentProfile;

  function val(node) {
    return node ? node.value : null;
  }
  function isMissing(node) {
    return !node || node.value == null;
  }
  function flagLabel(node) {
    if (!node) return "";
    if (node.quality_flag === "secret") return " · donnée secrétisée";
    if (node.quality_flag === "not_applicable") return " · non applicable";
    if (node.quality_flag === "a_venir") return " · à venir";
    if (node.quality_flag === "partial_perimeter") return " · périmètre partiel";
    return "";
  }

  function kpi(label, node, unit, note) {
    const missing = isMissing(node);
    const display = missing ? '<span class="data-missing">Non disponible</span>' : unit === "%" ? pctFmt(node.value) : fmt(node.value);
    return `<div class="kpi"><small>${label}${flagLabel(node)}</small><strong>${display}</strong>${note ? `<span>${note}</span>` : ""}</div>`;
  }

  function donut(title, data, centerLabel, centerValue, tone = "") {
    const total = data.reduce((s, d) => s + (d.pct || 0), 0);
    if (!total) return `<article class="chart-card visual-card ${tone}"><h3>${title}</h3><p class="data-missing">Données non disponibles.</p></article>`;
    let cursor = 0;
    const stops = data.map((item, i) => {
      const start = cursor;
      cursor += item.pct;
      return `${chartColors[i % chartColors.length]} ${start}% ${cursor}%`;
    }).join(",");
    const description = data.map((d) => `${d.label} ${d.pct}%`).join(", ");
    return `<article class="chart-card visual-card ${tone}"><h3>${title}</h3><div class="donut-layout"><div class="donut" style="--segments:${stops}" role="img" aria-label="${description}"><div><strong>${centerValue}</strong><span>${centerLabel}</span></div></div><div class="chart-legend">${data.map((d, i) => `<div><i style="--swatch:${chartColors[i % chartColors.length]}"></i><span>${d.label}</span><b>${d.pct.toLocaleString("fr-FR")}%</b></div>`).join("")}</div></div></article>`;
  }

  function bars(title, data, tone = "") {
    if (!data.length) return `<article class="chart-card ${tone}"><h3>${title}</h3><p class="data-missing">Données non disponibles.</p></article>`;
    return `<article class="chart-card ${tone}"><h3>${title}</h3>${data.map((d) => `<div class="bar-row"><span title="${d.label}">${d.label}</span><div class="bar-track"><i style="--pct:${d.pct}%"></i></div><b>${d.pct.toLocaleString("fr-FR")}%</b></div>`).join("")}</article>`;
  }

  function barsValue(title, rows, unit = "", tone = "") {
    if (!rows.length) return `<article class="chart-card ${tone}"><h3>${title}</h3><p class="data-missing">Données non disponibles.</p></article>`;
    const max = Math.max(...rows.map((r) => r.value), 1);
    return `<article class="chart-card ${tone}"><h3>${title}</h3>${rows.map((r) => `<div class="bar-row"><span title="${r.label}">${r.label}</span><div class="bar-track"><i style="--pct:${Math.max(4, (r.value / max) * 100)}%"></i></div><b>${fmt(r.value)}${unit}</b></div>`).join("")}</article>`;
  }

  function section(kicker, title, content, note = "") {
    return `<section class="section"><div class="section-head"><div><small>${kicker}</small><h2>${title}</h2></div>${note ? `<p>${note}</p>` : ""}</div>${content}</section>`;
  }

  function comingSoon(label, noteText) {
    return `<article class="chart-card"><h3>${label}</h3><p class="data-missing">À venir — ${noteText}</p></article>`;
  }

  function asDonut(rows) {
    return (rows || []).map((r) => ({ label: r.label, pct: r.pct || 0 }));
  }

  const THEME_META = {
    habitants: { kicker: "HABITANTS", title: "Habitants", color: "#000091" },
    emploi_mobilites: { kicker: "EMPLOI & MOBILITÉS", title: "Emploi & Mobilités", color: "#18753c" },
    logement: { kicker: "LOGEMENT", title: "Logement", color: "#6f4c9b" },
    economie_equipements: { kicker: "ÉCONOMIE & ÉQUIPEMENTS", title: "Économie & Équipements", color: "#c76524" },
  };
  const THEME_ORDER = ["habitants", "emploi_mobilites", "logement", "economie_equipements"];

  function renderHabitants(t, territoryWord) {
    const h = t.habitants;
    return `
      ${section("01 · REPÈRES", "Population", `<div class="kpi-grid kpi-grid-six">
        ${kpi("Population totale", h.population_totale, "n", h.population_totale.year ? "Insee RP " + h.population_totale.year : "")}
        ${kpi("Niveau de vie médian", h.revenus_pauvrete.niveau_vie_median, "n", "Insee-DGFiP Filosofi")}
        ${kpi("Taux de pauvreté (seuil 60%)", h.revenus_pauvrete.taux_pauvrete, "%")}
        ${kpi("Nombre de familles", h.structure_familles.nombre_familles, "n")}
      </div>`)}
      ${section("02 · ÂGES ET DIPLÔMES", "Qui vit sur ce territoire ?", `<div class="charts-grid visual-grid">${donut("Pyramide des âges (3 tranches)", asDonut(h.pyramide_ages.tranches), "20-64 ans", (h.pyramide_ages.tranches.find((r) => r.label === "20 à 64 ans") || {}).pct + "%")}${bars("Diplôme le plus élevé (pop. non scolarisée 15+)", asDonut(h.diplomes.repartition), "orange")}</div>`, "Insee RP2023.")}
      ${section("03 · FAMILLES ET STATUT CONJUGAL", "Composition des familles", `<div class="charts-grid visual-grid">${donut("Type de famille", asDonut(h.structure_familles.repartition), "couples avec enfant(s)", (h.structure_familles.repartition.find((r) => r.label === "Couple avec enfant(s)") || {}).pct + "%", "green")}${donut("Statut conjugal (15 ans ou plus)", asDonut(h.statut_conjugal ? h.statut_conjugal.repartition : []), "en couple", (() => { const r = h.statut_conjugal ? h.statut_conjugal.repartition : []; const marie = (r.find((x) => x.label === "Marié") || {}).pct || 0; const pacse = (r.find((x) => x.label === "Pacsé") || {}).pct || 0; const conc = (r.find((x) => x.label === "En concubinage, union libre") || {}).pct || 0; return Math.round((marie + pacse + conc) * 10) / 10; })() + "%", "orange")}</div>`, "Insee RP2023.")}
      ${section("04 · SCOLARISATION", "Taux de scolarisation par âge", `<div class="charts-grid visual-grid">${bars("Part de la population scolarisée", (h.scolarisation ? h.scolarisation.par_tranche : []).map((r) => ({ label: r.label, pct: r.pct })))}</div>`, "Insee RP2023. Le recul après 25 ans reflète la fin des études, pas une anomalie.")}
      ${section("05 · MOBILITÉ RÉSIDENTIELLE ET ENFANTS", "D'où viennent les habitants, combien d'enfants ?", `<div class="charts-grid visual-grid">${donut("Lieu de résidence il y a un an", asDonut(h.mobilite_residentielle ? h.mobilite_residentielle.repartition : []), "n'a pas déménagé", (() => { const r = h.mobilite_residentielle ? h.mobilite_residentielle.repartition : []; return (r.find((x) => x.label === "N'a pas déménagé") || {}).pct || 0; })() + "%", "green")}${donut("Nombre d'enfants par famille", asDonut(h.nombre_enfants ? h.nombre_enfants.repartition : []), "sans enfant", (() => { const r = h.nombre_enfants ? h.nombre_enfants.repartition : []; return (r.find((x) => x.label === "0 enfant") || {}).pct || 0; })() + "%")}</div>`, "Insee RP2023. Enfants de moins de 25 ans par famille.")}
      ${section("06 · CATÉGORIE SOCIOPROFESSIONNELLE", "Qui vit ici, au-delà des seuls actifs ?", `<div class="charts-grid visual-grid">${donut("Catégorie socioprofessionnelle (population 15 ans ou plus)", asDonut(h.categorie_socioprofessionnelle ? h.categorie_socioprofessionnelle.repartition : []), "1ʳᵉ catégorie", (() => { const r = h.categorie_socioprofessionnelle ? h.categorie_socioprofessionnelle.repartition : []; return r.length ? r.slice().sort((a, b) => b.pct - a.pct)[0].pct.toLocaleString("fr-FR") : "n. d."; })() + "%")}</div>`, (h.categorie_socioprofessionnelle ? h.categorie_socioprofessionnelle.note : "") + " Insee RP2023.")}
      ${section("07 · SOURCES ET MÉTHODE", "Bien lire cette fiche", `<div class="method-note">
        <strong>Source :</strong> Insee, Recensement de la population 2023 (âges, diplômes, familles, statut conjugal, scolarisation, mobilité résidentielle, catégorie socioprofessionnelle) ; Insee-DGFiP, Filosofi 2023 (niveau de vie, pauvreté).<br><br>
        <strong>Limites :</strong> Filosofi masque les communes de moins de 50 ménages fiscaux (secret statistique) — affiché comme tel, jamais comme zéro. Diplôme calculé sur la population non scolarisée de 15 ans ou plus.<br><br>
        <strong>Licence :</strong> Licence Ouverte / Etalab.
      </div>`)}
    `;
  }

  function renderEmploi(t, territoryWord) {
    const e = t.emploi_mobilites;
    const chomage = e.chomage_rp;
    const salaires = e.salaires;
    return `
      ${section("01 · REPÈRES", "Actifs occupés résidents", `<div class="kpi-grid kpi-grid-six">
        <div class="kpi"><small>Actifs occupés résidents</small><strong>${fmt(e.actifs_occupes_residents)}</strong></div>
        ${chomage ? kpi("Taux de chômage (15-64 ans)", chomage.taux_chomage_15_64, "%") : ""}
        ${salaires ? kpi("Salaire net mensuel moyen (EQTP)", salaires.par_sexe.ensemble, "n") : ""}
      </div>`, e.scope_note)}
      ${section("02 · CATÉGORIES SOCIOPROFESSIONNELLES", "Profils des actifs occupés", `<div class="charts-grid visual-grid">${donut("Catégorie socioprofessionnelle", asDonut(e.profession), "principale", (e.profession && e.profession.length ? e.profession.slice().sort((a, b) => b.pct - a.pct)[0].pct.toLocaleString("fr-FR") : "n. d.") + "%")}${bars("Niveau de diplôme (actifs occupés)", asDonut(t.habitants_partiel ? t.habitants_partiel.diploma_actifs_occupes : []), "orange")}</div>`)}
      ${section("03 · EMPLOI", "Stabilité et temps de travail", `<div class="charts-grid visual-grid">${donut("Type d'emploi", asDonut(e.employment), "emploi stable", (e.employment && e.employment.find((r) => r.label === "Emploi stable") || {}).pct + "%", "green")}${donut("Temps de travail", asDonut(e.worktime), "temps complet", (e.worktime && e.worktime.find((r) => r.label === "Temps complet") || {}).pct + "%")}</div>`)}
      ${section("04 · CHÔMAGE ET SALAIRES", "Au-delà des actifs occupés", `<div class="kpi-grid kpi-grid-six">
        ${chomage ? kpi("Taux de chômage RP (15-64 ans)", chomage.taux_chomage_15_64, "%") : ""}
        ${salaires ? kpi("Salaire moyen — hommes", salaires.par_sexe.hommes, "n") : ""}
        ${salaires ? kpi("Salaire moyen — femmes", salaires.par_sexe.femmes, "n") : ""}
      </div>${salaires && salaires.par_csp && salaires.par_csp.length ? barsValue("Salaire net mensuel moyen par catégorie", salaires.par_csp, " €") : ""}`, chomage ? chomage.scope_note : "")}
      ${section("05 · DÉPLACEMENTS DOMICILE-TRAVAIL", "Comment les actifs se déplacent-ils ?", `<div class="charts-grid visual-grid">${bars("Mode de transport principal", asDonut(e.transport))}${donut("Nombre de voitures du ménage", asDonut(e.cars), "sans voiture", (e.cars && e.cars.find((r) => r.label === "Sans voiture") || {}).pct + "%", "orange")}</div>`)}
      ${section("06 · SOURCES ET MÉTHODE", "Bien lire cette fiche", `<div class="method-note">
        <strong>Source :</strong> Insee, RP2022, fichier détail Mobilités professionnelles, pondéré par IPONDI (CSP, emploi, déplacements) ; Insee RP2023 (chômage au sens du recensement) ; Insee-DADS 2023 (salaires nets EQTP).<br><br>
        <strong>Limites :</strong> ${e.scope_note} ${chomage ? chomage.scope_note : ""} Effectifs pondérés par sondage ; comparaisons déconseillées sur les petits territoires à faible effectif.<br><br>
        <strong>Licence :</strong> Licence Ouverte / Etalab.
      </div>`)}
    `;
  }

  function renderLogement(t, territoryWord, profile) {
    const l = t.logement;
    const total = val(l.parc.total);
    const rp = val(l.parc.residences_principales);
    const rs = val(l.parc.residences_secondaires);
    const vac = val(l.parc.logements_vacants_rp);
    const maison = val(l.parc.maisons);
    const appart = val(l.parc.appartements);
    const proprio = val(l.occupation.proprietaires);
    const locPrive = val(l.occupation.locataires_prive);
    const locSocial = val(l.occupation.locataires_social);

    function pct2(num, den) {
      if (num == null || !den) return null;
      return Math.round((num / den) * 1000) / 10;
    }
    const habiterDonut = maison != null && appart != null ? [
      { label: "Maison", pct: pct2(maison, rp) || 0 },
      { label: "Appartement", pct: pct2(appart, rp) || 0 },
    ] : [];
    const occupationDonut = [proprio, locPrive, locSocial].every((v) => v != null) ? [
      { label: "Propriétaire", pct: pct2(proprio, rp) || 0 },
      { label: "Locataire parc privé", pct: pct2(locPrive, rp) || 0 },
      { label: "Locataire parc social", pct: pct2(locSocial, rp) || 0 },
    ] : [];
    const partialNote = profile.kind === "epci" && l.perimetre_partiel
      ? `<p class="method-note-small">Indicateurs calculés sur les communes val-d'oisiennes de cet EPCI (périmètre complet débordant sur un département voisin).</p>`
      : "";

    return `
      ${partialNote}
      ${section("01 · REPÈRES", `${territoryWord} en six chiffres`, `<div class="kpi-grid kpi-grid-six">
        ${kpi("Logements (parc total)", l.parc.total, "n")}
        ${kpi("Résidences principales", l.parc.residences_principales, "n")}
        ${kpi("Résidences secondaires", l.parc.residences_secondaires, "n")}
        ${kpi("Logements vacants (RP)", l.parc.logements_vacants_rp, "n", vac != null && total ? pctFmt(pct2(vac, total)) + " du parc" : "")}
        ${kpi("Logements sociaux (RPLS)", l.social.rpls_count, "n")}
        ${kpi("Logements commencés (5 ans)", l.construction.commences_5ans, "n", "Cumul 2021-2025")}
      </div>`)}
      ${section("02 · HABITER", "Type et statut d'occupation", `<div class="charts-grid visual-grid">${donut("Maison / appartement", habiterDonut, "du parc", habiterDonut.length ? habiterDonut[0].pct.toLocaleString("fr-FR") + "%" : "n. d.")}${donut("Statut d'occupation", occupationDonut, "propriétaires", occupationDonut.length ? occupationDonut[0].pct.toLocaleString("fr-FR") + "%" : "n. d.", "orange")}</div>`, "Résidences principales, Insee 2023.")}
      ${section("03 · PARC SOCIAL ET VACANCE", "Logement social et vacance", `<div class="kpi-grid kpi-grid-six">
        ${kpi("Part RPLS des résidences principales", l.social.part_rpls_residences_principales, "%")}
        ${kpi("Taux de vacance RP", l.vacance.taux_vacance_rp, "%")}
        ${kpi("Part F/G parmi les DPE observés", l.renovation.dpe_fg_part, "%")}
      </div>`, "RPLS SDES 2025 ; recensement Insee 2023 ; ADEME DPE v2.")}
      ${section("04 · CHAUFFAGE, ANCIENNETÉ ET CONFORT", "Comment vit-on dans ces logements ?", `<div class="charts-grid visual-grid">${donut("Énergie de chauffage", asDonut(l.energie_chauffage ? l.energie_chauffage.repartition : []), "principale", (() => { const r = l.energie_chauffage ? l.energie_chauffage.repartition : []; return r.length ? r.slice().sort((a, b) => b.pct - a.pct)[0].pct.toLocaleString("fr-FR") : "n. d."; })() + "%", "orange")}${bars("Ancienneté d'emménagement", (l.anciennete_emmenagement ? l.anciennete_emmenagement.repartition : []).map((r) => ({ label: r.label, pct: r.pct })))}</div><div class="kpi-grid kpi-grid-six">${kpi("Nombre moyen de pièces", l.nb_pieces_moyen, "n")}${kpi("Part avec stationnement", l.part_avec_stationnement, "%")}</div>`, "Insee RP2023.")}
      ${section("05 · SOURCES ET MÉTHODE", "Bien lire cette fiche", `<div class="method-note">
        <strong>Source :</strong> repris de l'observatoire « Comment se loge-t-on dans le Val-d'Oise ? » (Insee 2023, RPLS 2025, LOVAC, Sitadel3, ADEME DPE) ; complété par Insee RP2023 (chauffage, ancienneté, pièces, stationnement).<br><br>
        <strong>Limites :</strong> effectifs pondérés par sondage ; comparaisons déconseillées sous 200 logements.<br><br>
        <strong>Licence :</strong> Licence Ouverte / Etalab.
      </div>`)}
    `;
  }

  function renderEconomie(t) {
    const e = t.economie_equipements || {};
    const ent = e.entreprises || {};
    const creations = e.creations || {};
    const tourisme = e.tourisme || {};
    const equip = e.equipements?.denombrement || {};
    const equipRows = Object.entries(equip).map(([label, node]) => ({ label, value: node.value })).filter((r) => r.value != null).sort((a, b) => b.value - a.value);
    const equipBars = equipRows.length ? barsValue("Équipements de proximité", equipRows) : comingSoon("Équipements de proximité", "aucun équipement dénombré sur ce territoire.");
    const tailleDonut = ent.par_taille && ent.par_taille.length ? donut("Établissements par taille", asDonut(ent.par_taille), "0 salarié", (ent.par_taille.find((r) => r.label === "0 salarié") || {}).pct + "%", "green") : "";
    const tourismeRows = [
      tourisme.hotels && tourisme.hotels.etablissements && tourisme.hotels.etablissements.value ? { label: "Hôtels", value: tourisme.hotels.etablissements.value } : null,
      tourisme.campings && tourisme.campings.etablissements && tourisme.campings.etablissements.value ? { label: "Campings", value: tourisme.campings.etablissements.value } : null,
      tourisme.autres_hebergements && tourisme.autres_hebergements.etablissements && tourisme.autres_hebergements.etablissements.value ? { label: "Autres hébergements touristiques", value: tourisme.autres_hebergements.etablissements.value } : null,
    ].filter(Boolean);
    return `
      ${section("01 · REPÈRES", "Entreprises et établissements", `<div class="kpi-grid kpi-grid-six">
        ${kpi("Établissements actifs", ent.etablissements_actifs, "n", ent.annee ? "Insee REE " + ent.annee : "")}
        ${kpi("Emplois salariés", ent.emplois_salaries, "n", "Effectifs fin décembre")}
        ${kpi("Créations d'entreprises (2025)", creations.entreprises_2025, "n")}
        ${kpi("Créations d'établissements (2025)", creations.etablissements_2025, "n")}
      </div>`)}
      ${section("02 · SECTEURS D'ACTIVITÉ", "Où sont les établissements ?", `<div class="charts-grid visual-grid">${donut("Répartition par secteur", asDonut(ent.secteurs), "1ᵉʳ secteur", (ent.secteurs && ent.secteurs.length ? ent.secteurs.slice().sort((a, b) => b.pct - a.pct)[0].pct.toLocaleString("fr-FR") : "n. d.") + "%")}${tailleDonut}</div>`, (ent.par_taille_note || "") + " Insee, Répertoire des entreprises et établissements (REE).")}
      ${section("03 · ÉQUIPEMENTS", "Commerces, santé, éducation à proximité", `<div class="charts-grid visual-grid">${equipBars}</div>`, "Insee, Base Permanente des Équipements (BPE) " + (e.equipements?.annee || "") + ".")}
      ${section("04 · TOURISME", "Capacité d'accueil touristique", tourismeRows.length ? `<div class="charts-grid visual-grid">${barsValue("Établissements touristiques", tourismeRows)}</div>` : `<div class="charts-grid visual-grid">${comingSoon("Établissements touristiques", "aucun hébergement touristique recensé sur ce territoire.")}</div>`, "Insee, base tourisme " + (tourisme.annee || "") + ".")}
      ${section("05 · SOURCES ET MÉTHODE", "Bien lire cette fiche", `<div class="method-note">
        <strong>Source :</strong> Insee, Répertoire des entreprises et établissements (REE/Sirene, créations et taille) ; Insee, Base Permanente des Équipements (BPE) ; Insee, base tourisme (hôtellerie, camping, autres hébergements).<br><br>
        <strong>Limites :</strong> établissements actifs, pas nécessairement employeurs. ${ent.par_taille_note || ""} Le dénombrement BPE recense des équipements ouverts au public, pas leur fréquentation ni leur qualité de service.<br><br>
        <strong>Licence :</strong> Licence Ouverte / Etalab.
      </div>`)}
    `;
  }

  const RENDERERS = { habitants: renderHabitants, emploi_mobilites: renderEmploi, logement: renderLogement, economie_equipements: renderEconomie };

  function renderProfile(profile, name) {
    currentProfile = profile;
    const isDepartement = scale === "departement";
    const isEpci = scale === "epci" && !profile.special;
    const territoryWord = isDepartement ? "le Val-d'Oise" : isEpci ? "l'EPCI" : "la commune";
    document.title = `${name} · Portrait Insee complet · DDT 95`;
    headerTitle.textContent = `${isDepartement ? "Synthèse départementale" : isEpci ? "Fiche EPCI" : "Fiche communale"} · Portrait complet`;

    // Le thème d'où vient l'utilisateur est affiché en premier ; les trois autres suivent,
    // pour que la fiche reste contextuelle tout en donnant TOUTES les catégories.
    const orderedThemes = [theme, ...THEME_ORDER.filter((k) => k !== theme)];
    const body = orderedThemes.map((key) => {
      const meta = THEME_META[key];
      return `<div class="theme-part" id="part-${key}">
        <div class="theme-part-header" style="--tc:${meta.color}"><span>${meta.kicker}</span><h2>${meta.title}</h2></div>
        ${RENDERERS[key](profile.themes, territoryWord, profile)}
      </div>`;
    }).join("");

    root.innerHTML = `<div id="report">
      <section class="report-cover">
        <div class="cover-kicker">${isDepartement ? "SYNTHÈSE DÉPARTEMENTALE" : isEpci ? "FICHE INTERCOMMUNALE" : "FICHE COMMUNALE"} · PORTRAIT COMPLET</div>
        <h1>${name}</h1>
        <p>Habitants, Emploi &amp; Mobilités, Logement, Économie &amp; Équipements dans ${territoryWord} — toutes les données Insee disponibles, réunies et documentées.</p>
        <div class="cover-meta"><span>Portrait Insee · DDT du Val-d'Oise</span><span>${new Date().toLocaleDateString("fr-FR", { year: "numeric", month: "long" })}</span></div>
      </section>
      <div class="report-body">${body}</div>
    </div>`;
  }

  Promise.all([
    fetch("data/processed/commune_profiles.json").then((r) => r.json()),
    fetch("data/processed/epci_profiles.json").then((r) => r.json()),
    fetch("data/processed/communes95.json").then((r) => r.json()),
    fetch("data/processed/departement_profile.json").then((r) => r.json()),
  ])
    .then(([communeProfiles, epciProfiles, communes, departementProfile]) => {
      const communeNames = Object.fromEntries(communes.map((c) => [c.code, c.name]));
      if (scale === "departement") {
        renderProfile(departementProfile, departementProfile.name);
      } else if (scale === "epci") {
        const profile = epciProfiles[selectedId];
        if (!profile) throw new Error("EPCI introuvable");
        renderProfile(profile, profile.name);
      } else {
        const profile = communeProfiles[selectedId];
        if (!profile) throw new Error("Commune introuvable");
        renderProfile(profile, communeNames[selectedId] || profile.name);
      }
    })
    .catch(() => {
      root.innerHTML = '<div class="loading">Territoire introuvable. Retournez à la carte et sélectionnez une commune ou un EPCI.</div>';
    });

  document.getElementById("openExport").onclick = () => dialog.showModal();
  document.getElementById("closeExport").onclick = () => dialog.close();
  dialog.onclick = (e) => { if (e.target === dialog) dialog.close(); };
  document.getElementById("printProfile").onclick = () => { dialog.close(); window.print(); };
  document.getElementById("makePdf").onclick = async () => {
    dialog.close();
    document.body.classList.add("exporting");
    const name = (currentProfile.name || "territoire").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/gi, "-").toLowerCase();
    try {
      await html2pdf().set({
        margin: 0,
        filename: `fiche-complete-${name}.pdf`,
        image: { type: "jpeg", quality: 0.96 },
        html2canvas: { scale: 2, useCORS: true, letterRendering: true },
        jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
        pagebreak: { mode: ["css", "legacy"], avoid: [".section", ".chart-card"] },
      }).from(document.getElementById("report")).save();
    } finally {
      document.body.classList.remove("exporting");
    }
  };
})();
