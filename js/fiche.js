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
    habitants: { kicker: "HABITANTS", title: "Habitants" },
    emploi_mobilites: { kicker: "EMPLOI & MOBILITÉS", title: "Emploi & Mobilités" },
    logement: { kicker: "LOGEMENT", title: "Logement" },
    economie_equipements: { kicker: "ÉCONOMIE & ÉQUIPEMENTS", title: "Économie & Équipements" },
  };

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
      ${section("03 · FAMILLES", "Composition des familles", `<div class="charts-grid visual-grid">${donut("Type de famille", asDonut(h.structure_familles.repartition), "couples avec enfant(s)", (h.structure_familles.repartition.find((r) => r.label === "Couple avec enfant(s)") || {}).pct + "%", "green")}</div>`, "Insee RP2023.")}
      ${section("04 · SOURCES ET MÉTHODE", "Bien lire cette fiche", `<div class="method-note">
        <strong>Source :</strong> Insee, Recensement de la population 2023 (âges, diplômes, familles) ; Insee-DGFiP, Filosofi 2023 (niveau de vie, pauvreté).<br><br>
        <strong>Limites :</strong> Filosofi masque les communes de moins de 50 ménages fiscaux (secret statistique) — affiché comme tel, jamais comme zéro. Diplôme calculé sur la population non scolarisée de 15 ans ou plus.<br><br>
        <strong>Licence :</strong> Licence Ouverte / Etalab.
      </div>`)}
    `;
  }

  function renderEmploi(t, territoryWord) {
    const e = t.emploi_mobilites;
    return `
      ${section("01 · REPÈRES", "Actifs occupés résidents", `<div class="kpi-grid kpi-grid-six">
        <div class="kpi"><small>Actifs occupés résidents</small><strong>${fmt(e.actifs_occupes_residents)}</strong></div>
      </div>`, e.scope_note)}
      ${section("02 · CATÉGORIES SOCIOPROFESSIONNELLES", "Profils des actifs occupés", `<div class="charts-grid visual-grid">${donut("Catégorie socioprofessionnelle", asDonut(e.profession), "principale", (e.profession && e.profession.length ? e.profession.slice().sort((a, b) => b.pct - a.pct)[0].pct.toLocaleString("fr-FR") : "n. d.") + "%")}${bars("Niveau de diplôme (actifs occupés)", asDonut(t.habitants_partiel ? t.habitants_partiel.diploma_actifs_occupes : []), "orange")}</div>`)}
      ${section("03 · EMPLOI", "Stabilité et temps de travail", `<div class="charts-grid visual-grid">${donut("Type d'emploi", asDonut(e.employment), "emploi stable", (e.employment && e.employment.find((r) => r.label === "Emploi stable") || {}).pct + "%", "green")}${donut("Temps de travail", asDonut(e.worktime), "temps complet", (e.worktime && e.worktime.find((r) => r.label === "Temps complet") || {}).pct + "%")}</div>`)}
      ${section("04 · DÉPLACEMENTS DOMICILE-TRAVAIL", "Comment les actifs se déplacent-ils ?", `<div class="charts-grid visual-grid">${bars("Mode de transport principal", asDonut(e.transport))}${donut("Nombre de voitures du ménage", asDonut(e.cars), "sans voiture", (e.cars && e.cars.find((r) => r.label === "Sans voiture") || {}).pct + "%", "orange")}</div>`)}
      ${section("05 · SOURCES ET MÉTHODE", "Bien lire cette fiche", `<div class="method-note">
        <strong>Source :</strong> Insee, RP2022, fichier détail Mobilités professionnelles, pondéré par IPONDI.<br><br>
        <strong>Limites :</strong> ${e.scope_note} Effectifs pondérés par sondage ; comparaisons déconseillées sur les petits territoires à faible effectif.<br><br>
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
      ${section("04 · SOURCES ET MÉTHODE", "Bien lire cette fiche", `<div class="method-note">
        <strong>Source :</strong> repris de l'observatoire « Comment se loge-t-on dans le Val-d'Oise ? » (Insee 2023, RPLS 2025, LOVAC, Sitadel3, ADEME DPE).<br><br>
        <strong>Limites :</strong> effectifs pondérés par sondage ; comparaisons déconseillées sous 200 logements.<br><br>
        <strong>Licence :</strong> Licence Ouverte / Etalab.
      </div>`)}
    `;
  }

  function renderEconomie(t) {
    const e = t.economie_equipements || {};
    const ent = e.entreprises || {};
    const equip = e.equipements?.denombrement || {};
    const equipRows = Object.entries(equip).map(([label, node]) => ({ label, pct: null, value: node.value })).filter((r) => r.value != null);
    const maxEquip = Math.max(1, ...equipRows.map((r) => r.value));
    const equipBars = equipRows.length
      ? `<article class="chart-card"><h3>Équipements de proximité</h3>${equipRows.map((r) => `<div class="bar-row"><span title="${r.label}">${r.label}</span><div class="bar-track"><i style="--pct:${Math.max(4, (r.value / maxEquip) * 100)}%"></i></div><b>${fmt(r.value)}</b></div>`).join("")}</article>`
      : comingSoon("Équipements de proximité", "aucun équipement dénombré sur ce territoire.");
    return `
      ${section("01 · REPÈRES", "Entreprises et établissements", `<div class="kpi-grid kpi-grid-six">
        ${kpi("Établissements actifs", ent.etablissements_actifs, "n", ent.annee ? "Insee REE " + ent.annee : "")}
      </div>`)}
      ${section("02 · SECTEURS D'ACTIVITÉ", "Où sont les établissements ?", `<div class="charts-grid visual-grid">${donut("Répartition par secteur", asDonut(ent.secteurs), "1ᵉʳ secteur", (ent.secteurs && ent.secteurs.length ? ent.secteurs.slice().sort((a, b) => b.pct - a.pct)[0].pct.toLocaleString("fr-FR") : "n. d.") + "%")}</div>`, "Insee, Répertoire des entreprises et établissements (REE).")}
      ${section("03 · ÉQUIPEMENTS", "Commerces, santé, éducation à proximité", `<div class="charts-grid visual-grid">${equipBars}</div>`, "Insee, Base Permanente des Équipements (BPE) " + (e.equipements?.annee || "") + ".")}
      ${section("04 · SOURCES ET MÉTHODE", "Bien lire cette fiche", `<div class="method-note">
        <strong>Source :</strong> Insee, Répertoire des entreprises et établissements (REE/Sirene) ; Insee, Base Permanente des Équipements (BPE).<br><br>
        <strong>Limites :</strong> établissements actifs, pas nécessairement employeurs. Le dénombrement BPE recense des équipements ouverts au public, pas leur fréquentation ni leur qualité de service.<br><br>
        <strong>Licence :</strong> Licence Ouverte / Etalab.
      </div>`)}
    `;
  }

  const RENDERERS = { habitants: renderHabitants, emploi_mobilites: renderEmploi, logement: renderLogement, economie_equipements: renderEconomie };

  function renderProfile(profile, name) {
    currentProfile = profile;
    const isDepartement = scale === "departement";
    const isEpci = scale === "epci" && !profile.special;
    const territoryTitle = isDepartement ? "Le Val-d'Oise" : isEpci ? "L'EPCI" : "La commune";
    const territoryWord = isDepartement ? "le Val-d'Oise" : isEpci ? "l'EPCI" : "la commune";
    const meta = THEME_META[theme];
    document.title = `${name} · ${meta.title} · DDT 95`;
    headerTitle.textContent = `${isDepartement ? "Synthèse départementale" : isEpci ? "Fiche EPCI" : "Fiche communale"} · ${meta.title}`;

    const body = RENDERERS[theme](profile.themes, territoryWord, profile);

    root.innerHTML = `<div id="report">
      <section class="report-cover">
        <div class="cover-kicker">${isDepartement ? "SYNTHÈSE DÉPARTEMENTALE" : isEpci ? "FICHE INTERCOMMUNALE" : "FICHE COMMUNALE"} · ${meta.kicker}</div>
        <h1>${name}</h1>
        <p>${meta.title} dans ${territoryWord} — données Insee, réutilisées et documentées.</p>
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
        filename: `fiche-${theme}-${name}.pdf`,
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
