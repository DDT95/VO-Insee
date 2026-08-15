(function () {
  "use strict";

  const RENDERERS = window.VOInsee.reportRenderers;
  const root = document.getElementById("profileRoot");
  const dialog = document.getElementById("exportDialog");
  const headerTitle = document.getElementById("headerTitle");
  const params = new URLSearchParams(location.search);
  const typeParam = params.get("type");
  const scale = typeParam === "departement" ? "departement" : typeParam === "epci" ? "epci" : "commune";
  const selectedId = scale === "departement" ? "95" : params.get("id");
  const theme = ["habitants", "emploi_mobilites", "logement", "economie_equipements"].includes(params.get("theme")) ? params.get("theme") : "habitants";
  let currentProfile;

  const THEME_META = {
    habitants: { kicker: "HABITANTS", title: "Habitants", color: "#000091" },
    emploi_mobilites: { kicker: "EMPLOI & MOBILITÉS", title: "Emploi & Mobilités", color: "#18753c" },
    logement: { kicker: "LOGEMENT", title: "Logement", color: "#6f4c9b" },
    economie_equipements: { kicker: "ÉCONOMIE & ÉQUIPEMENTS", title: "Économie & Équipements", color: "#c76524" },
  };
  const THEME_ORDER = ["habitants", "emploi_mobilites", "logement", "economie_equipements"];

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
