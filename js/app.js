(function () {
  "use strict";

  const THEMES = window.VOInsee.THEMES;
  const { fmt } = (function () {
    function fmt(v, unit) {
      if (v == null) return "Non disponible";
      if (unit === "%") return v.toFixed(1).replace(".", ",") + " %";
      const n = Math.round(v).toLocaleString("fr-FR");
      return unit && unit !== "%" ? n + " " + unit : n;
    }
    return { fmt };
  })();

  const state = {
    communes: [],
    communesByCode: new Map(),
    epcis: [],
    epcisByCode: new Map(),
    epciColors: new Map(),
    scale: "commune",
    selected: null,
    activeTheme: "habitants",
    activeLayer: null,
  };

  function layersForActiveTheme() {
    const theme = THEMES[state.activeTheme];
    const map = {};
    theme.groups.forEach((g) => g.layers.forEach((l) => (map[l.key] = l)));
    return map;
  }

  // ---------- Map ----------
  const VDO_CENTER = [49.05, 2.15];
  const EPCI_COLORS = ["#18753c", "#6f4c9b", "#009099", "#c76524", "#d64d70", "#477a3c", "#ce0500", "#b88a16", "#45556c", "#3978b8"];
  const map = L.map("map", { zoomControl: true, minZoom: 7, maxZoom: 15 }).setView(VDO_CENTER, 10);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    maxZoom: 19,
  }).addTo(map);

  let communesLayer, epciLayer, deptLayer;
  window.addEventListener("load", () => setTimeout(() => map.invalidateSize(), 0));
  window.addEventListener("resize", () => map.invalidateSize());
  const territoryTooltip = L.tooltip({ sticky: true, className: "commune-tip", direction: "top", offset: [0, -8] });

  Promise.all([
    d3.json("data/processed/departement95.geojson"),
    d3.json("data/processed/communes95.geojson"),
    d3.json("data/processed/epcis95.geojson"),
    d3.json("data/processed/communes95.json"),
    d3.json("data/processed/commune_profiles.json"),
    d3.json("data/processed/epci_profiles.json"),
  ]).then(([dept95, communes95Geo, epcis95Geo, communes95, communeProfiles, epciProfiles]) => {
    deptLayer = L.geoJSON(dept95, { style: { color: "#000091", weight: 2, fill: false, opacity: 0.55 } }).addTo(map);

    state.communes = communes95.map((c) => ({ ...c, profile: communeProfiles[c.code] }));
    state.communesByCode = new Map(state.communes.map((c) => [c.code, c]));
    state.epcis = Object.values(epciProfiles);
    state.epcisByCode = new Map(state.epcis.map((e) => [e.code, e]));
    prepareEpciColors();

    communesLayer = L.geoJSON(communes95Geo, {
      style: () => ({ color: "#8a9bb0", weight: 0.6, fillColor: "#dce8f1", fillOpacity: 0.5 }),
      onEachFeature: (feature, layer) => {
        layer.on("click", () => selectFromMap(feature.properties.code));
        layer.on("mouseover", (event) => {
          territoryTooltip.setContent(territoryNameFromMap(feature.properties.code)).setLatLng(event.latlng).openOn(map);
        });
        layer.on("mousemove", (event) => territoryTooltip.setLatLng(event.latlng));
        layer.on("mouseout", () => map.closeTooltip(territoryTooltip));
      },
    }).addTo(map);

    epciLayer = L.geoJSON(epcis95Geo, {
      style: (feature) => ({ color: state.epciColors.get(feature.properties.code) || "#000091", weight: 2.2, fillColor: state.epciColors.get(feature.properties.code) || "#dce8f1", fillOpacity: 0.2 }),
      onEachFeature: (feature, layer) => {
        layer.bindTooltip(feature.properties.name, { permanent: true, className: "epci-label", direction: "center" });
        layer.on("click", () => selectEpci(feature.properties.code));
      },
    });

    document.getElementById("mapStatus").textContent = `${state.communes.length} communes chargées`;
    map.invalidateSize();
    if (deptLayer) map.fitBounds(deptLayer.getBounds(), { padding: [24, 24], animate: false });

    renderSidebarForTheme();
    applyChoropleth();
    renderEmptyState();

    const initialParams = new URLSearchParams(location.search);
    if (initialParams.get("type") === "epci" && state.epcisByCode.has(initialParams.get("id"))) {
      setMapScale("epci");
      selectEpci(initialParams.get("id"));
    } else if (initialParams.get("scale") === "epci") {
      setMapScale("epci");
    } else if (initialParams.get("type") === "commune" && state.communesByCode.has(initialParams.get("id"))) {
      selectCommune(initialParams.get("id"));
    }
  });

  function prepareEpciColors() {
    const regular = state.epcis.filter((e) => !e.special).sort((a, b) => (a.name || "").localeCompare(b.name || "", "fr"));
    const special = state.epcis.filter((e) => e.special).sort((a, b) => (a.name || "").localeCompare(b.name || "", "fr"));
    [...regular, ...special].forEach((e, i) => state.epciColors.set(e.code, EPCI_COLORS[i % EPCI_COLORS.length]));
  }

  function epciForCommune(code) {
    return state.epcis.find((e) => e.members && e.members.includes(code));
  }

  function territoryNameFromMap(code) {
    if (state.scale === "commune") return state.communesByCode.get(code)?.name || code;
    return epciForCommune(code)?.name || "Territoire hors EPCI affiché";
  }

  // ---------- Theme switch ----------
  document.querySelectorAll(".theme-card[data-theme]").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (btn.dataset.theme === state.activeTheme) return;
      state.activeTheme = btn.dataset.theme;
      state.activeLayer = null;
      document.querySelectorAll(".theme-card[data-theme]").forEach((b) => b.classList.toggle("active", b === btn));
      renderSidebarForTheme();
      applyChoropleth();
      if (state.selected) renderDetail(state.selected); else renderEmptyState();
    });
  });

  function renderSidebarForTheme() {
    const theme = THEMES[state.activeTheme];
    document.getElementById("themeHeading").textContent = "Explorer " + (state.activeTheme === "habitants" ? "les habitants" : theme.label.toLowerCase());
    document.getElementById("themeIntro").textContent = theme.intro;

    const container = document.getElementById("layerGroups");
    let html = "";
    if (theme.scopeNote) html += `<p class="scope-note">${theme.scopeNote}</p>`;

    theme.groups.forEach((group) => {
      html += `<div class="layer-group" aria-label="${group.title}"><span>${group.title}</span><div class="layer-cards">`;
      group.layers.forEach((l) => {
        html += `<button type="button" class="layer-card" data-layer="${l.key}" style="--layer-color:${l.ramp[1]};--layer-gradient:linear-gradient(135deg, ${l.ramp[0]}, ${l.ramp[1]})"><i class="layer-swatch" aria-hidden="true"></i><span><b>${l.label}</b></span><i class="layer-switch" aria-hidden="true"></i></button>`;
      });
      html += `</div></div>`;
    });

    if (theme.pending && theme.pending.length) {
      html += `<div class="layer-group" aria-label="À venir"><span>À VENIR</span><div class="layer-cards">`;
      theme.pending.forEach((p) => {
        html += `<button type="button" class="layer-card pending" disabled><i class="layer-swatch" aria-hidden="true"></i><span><b>${p.label}<em class="pending-badge">À VENIR</em></b><small>${p.note}</small></span></button>`;
      });
      html += `</div></div>`;
    }

    container.innerHTML = html;
    container.querySelectorAll(".layer-card[data-layer]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const turningOff = btn.classList.contains("active");
        container.querySelectorAll(".layer-card").forEach((b) => b.classList.toggle("active", !turningOff && b === btn));
        state.activeLayer = turningOff ? null : btn.dataset.layer;
        applyChoropleth();
      });
    });
  }

  // ---------- Choropleth ----------
  function valueForTerritoryCode(code) {
    if (!state.activeLayer) return null;
    const layers = layersForActiveTheme();
    const layerDef = layers[state.activeLayer];
    if (!layerDef) return null;
    if (state.scale === "commune") {
      const c = state.communesByCode.get(code);
      return c && c.profile ? layerDef.get(c.profile) : null;
    }
    const epci = epciForCommune(code);
    return epci ? layerDef.get(epci) : null;
  }

  function applyChoropleth() {
    if (!communesLayer) return;
    const layers = layersForActiveTheme();
    const layerDef = state.activeLayer ? layers[state.activeLayer] : null;
    const displayLayer = state.scale === "epci" ? epciLayer : communesLayer;

    if (state.scale === "epci") {
      if (map.hasLayer(communesLayer)) map.removeLayer(communesLayer);
      if (epciLayer && !map.hasLayer(epciLayer)) epciLayer.addTo(map);
    } else {
      if (epciLayer && map.hasLayer(epciLayer)) map.removeLayer(epciLayer);
      if (!map.hasLayer(communesLayer)) communesLayer.addTo(map);
    }

    if (!layerDef) {
      displayLayer.eachLayer((layer) => {
        const code = layer.feature.properties.code;
        const isSelected = code === state.selected;
        const epciColor = state.scale === "epci" ? state.epciColors.get(code) : null;
        layer.setStyle({
          fillColor: epciColor || "#dce8f1",
          fillOpacity: isSelected ? 0.48 : state.scale === "epci" ? 0.2 : 0.32,
          weight: isSelected ? 3.4 : state.scale === "epci" ? 2.2 : 0.6,
          color: isSelected ? "#070047" : epciColor || "#8a9bb0",
        });
        if (isSelected) layer.bringToFront();
      });
      document.getElementById("mapLegend").hidden = true;
      return;
    }

    let values;
    if (state.scale === "commune") {
      values = state.communes.map((c) => (c.profile ? layerDef.get(c.profile) : null)).filter((v) => v != null);
    } else {
      values = state.epcis.filter((e) => !e.special).map((e) => layerDef.get(e)).filter((v) => v != null);
    }
    const extent = d3.extent(values);
    const colorScale = d3.scaleLinear().range(layerDef.ramp);
    colorScale.domain(extent[0] === extent[1] ? [0, extent[1] || 1] : extent);

    displayLayer.eachLayer((layer) => {
      const code = layer.feature.properties.code;
      const isSelected = code === state.selected;
      const v = state.scale === "epci" ? layerDef.get(state.epcisByCode.get(code)) : valueForTerritoryCode(code);
      const fill = v == null ? "#e4e9ec" : colorScale(v);
      layer.setStyle({
        fillColor: fill,
        fillOpacity: v == null ? 0.35 : 0.72,
        weight: isSelected ? 2.4 : 0.6,
        color: isSelected ? "#070047" : "#8a9bb0",
      });
      if (isSelected) layer.bringToFront();
    });

    const legend = document.getElementById("mapLegend");
    legend.hidden = false;
    legend.querySelector(".ramp").style.background = `linear-gradient(90deg, ${layerDef.ramp.join(",")})`;
    document.getElementById("legendTitle").textContent = layerDef.label;
    document.getElementById("legendMin").textContent = fmt(extent[0], layerDef.unit);
    document.getElementById("legendMax").textContent = fmt(extent[1], layerDef.unit);
    document.getElementById("legendNote").textContent = "Gris = donnée non disponible ou secrétisée.";
  }

  // ---------- Search ----------
  const searchInput = document.getElementById("searchInput");
  const searchButton = document.getElementById("searchButton");
  const searchResults = document.getElementById("searchResults");
  const territorySearchLabel = document.getElementById("territorySearchLabel");

  function renderSearchResults(query) {
    const q = query.trim().toLowerCase();
    if (!q) { searchResults.hidden = true; searchResults.innerHTML = ""; return; }
    const collection = state.scale === "epci" ? state.epcis : state.communes;
    const matches = collection.filter((item) => (item.name || "").toLowerCase().includes(q)).sort((a, b) => (a.name || "").localeCompare(b.name || "", "fr")).slice(0, 8);
    if (!matches.length) { searchResults.hidden = true; return; }
    searchResults.innerHTML = matches.map((item) => `<button type="button" data-code="${item.code}"><b>${item.name}</b><small>${state.scale === "epci" ? (item.special ? "Commune particulière" : "EPCI") : "Commune"}</small></button>`).join("");
    searchResults.hidden = false;
    searchResults.querySelectorAll("button").forEach((btn) => {
      btn.addEventListener("click", () => {
        if (state.scale === "epci") selectEpci(btn.dataset.code); else selectCommune(btn.dataset.code);
        searchResults.hidden = true;
      });
    });
  }
  searchInput.addEventListener("input", () => renderSearchResults(searchInput.value));
  searchInput.addEventListener("focus", () => renderSearchResults(searchInput.value));
  document.addEventListener("click", (e) => {
    if (!e.target.closest(".search-box") && !e.target.closest(".search-results")) searchResults.hidden = true;
  });
  searchButton.addEventListener("click", () => {
    const collection = state.scale === "epci" ? state.epcis : state.communes;
    const q = searchInput.value.trim().toLowerCase();
    const match = collection.find((item) => (item.name || "").toLowerCase() === q) || collection.find((item) => (item.name || "").toLowerCase().includes(q));
    if (match) state.scale === "epci" ? selectEpci(match.code) : selectCommune(match.code);
  });
  searchInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") searchButton.click();
  });

  // ---------- Mode switch ----------
  function setMapScale(scale) {
    state.scale = scale;
    state.selected = null;
    searchInput.value = "";
    territorySearchLabel.textContent = scale === "epci" ? "Rechercher un EPCI" : "Rechercher une commune";
    searchInput.placeholder = scale === "epci" ? "Ex. Cergy-Pontoise" : "Ex. Pontoise";
    document.querySelectorAll("[data-map-scale]").forEach((b) => {
      const active = b.dataset.mapScale === scale;
      b.classList.toggle("active", active);
      b.setAttribute("aria-pressed", String(active));
    });
    document.getElementById("detailPanel").classList.remove("open");
    applyChoropleth();
    renderEmptyState();
  }
  document.querySelectorAll("[data-map-scale]").forEach((b) => b.addEventListener("click", () => setMapScale(b.dataset.mapScale)));

  // ---------- Mobile sidebar ----------
  const sidebarEl = document.getElementById("layerSidebar");
  const mobileLayersBtn = document.getElementById("mobileLayers");
  mobileLayersBtn.addEventListener("click", () => {
    const open = sidebarEl.classList.toggle("open");
    mobileLayersBtn.setAttribute("aria-expanded", String(open));
  });

  // ---------- Reset ----------
  document.getElementById("resetView").addEventListener("click", () => {
    state.selected = null;
    searchInput.value = "";
    searchResults.hidden = true;
    sidebarEl.classList.remove("open");
    mobileLayersBtn.setAttribute("aria-expanded", "false");
    document.getElementById("detailPanel").classList.remove("open");
    if (deptLayer) map.fitBounds(deptLayer.getBounds(), { padding: [24, 24], animate: false });
    else map.setView(VDO_CENTER, 10, { animate: false });
    applyChoropleth();
    renderEmptyState();
  });

  // ---------- Comprendre dialog ----------
  const comprendreDialog = document.getElementById("comprendreDialog");
  document.getElementById("openComprendre3")?.addEventListener("click", () => comprendreDialog.showModal());
  comprendreDialog.querySelectorAll("[data-close]").forEach((btn) => btn.addEventListener("click", () => comprendreDialog.close()));
  comprendreDialog.addEventListener("click", (e) => { if (e.target === comprendreDialog) comprendreDialog.close(); });

  function openTerritoryData() {
    const themeParam = `&theme=${encodeURIComponent(state.activeTheme)}`;
    const url = !state.selected ? "fiche.html?type=departement" + themeParam : state.scale === "epci" ? `fiche.html?type=epci&id=${encodeURIComponent(state.selected)}${themeParam}` : `fiche.html?type=commune&id=${encodeURIComponent(state.selected)}${themeParam}`;
    ["openData", "openDataTop"].forEach((id) => document.getElementById(id)?.setAttribute("href", url));
  }
  ["openData", "openDataTop"].forEach((id) => ["pointerdown", "click"].forEach((eventName) => document.getElementById(id)?.addEventListener(eventName, openTerritoryData)));

  // ---------- Selection ----------
  function selectFromMap(code) {
    if (state.scale === "commune") { selectCommune(code); return; }
    const epci = epciForCommune(code);
    if (epci) selectEpci(epci.code);
  }

  function selectCommune(code) {
    state.scale = "commune";
    state.selected = code;
    const c = state.communesByCode.get(code);
    if (c) {
      searchInput.value = c.name;
      map.setView([c.lat, c.lon], Math.max(map.getZoom(), 11), { animate: false });
      document.getElementById("mapStatus").textContent = `${c.name} · profil affiché`;
    }
    applyChoropleth();
    renderDetail(code);
  }

  function selectEpci(code) {
    const epci = state.epcisByCode.get(code);
    if (!epci) return;
    state.scale = "epci";
    state.selected = code;
    searchInput.value = epci.name;
    const visibleLayers = [];
    epciLayer.eachLayer((layer) => { if (layer.feature.properties.code === code) visibleLayers.push(layer); });
    if (visibleLayers.length) map.fitBounds(L.featureGroup(visibleLayers).getBounds(), { padding: [45, 45], animate: false, maxZoom: 11 });
    document.getElementById("mapStatus").textContent = `${epci.name} · profil affiché`;
    applyChoropleth();
    renderDetail(code);
  }

  // ---------- Detail panel ----------
  const DETAIL_RENDERERS = {
    habitants: (p, name, territoryType) => {
      const h = p.themes.habitants;
      const rp = h.revenus_pauvrete || {};
      const median = rp.niveau_vie_median;
      const pauvrete = rp.taux_pauvrete;
      const secretRevenus = median?.quality_flag === "secret";
      return `
        <div class="kpi-grid">
          <div class="kpi-tile"><small>Population totale</small><strong>${fmt(h.population_totale.value, "hab.")}</strong><em>${h.population_totale.year || ""}</em></div>
          <div class="kpi-tile"><small>Niveau de vie médian</small><strong>${secretRevenus ? "Secret statistique" : fmt(median?.value, "€")}</strong></div>
          <div class="kpi-tile"><small>Taux de pauvreté</small><strong>${secretRevenus ? "Secret statistique" : fmt(pauvrete?.value, "%")}</strong></div>
          <div class="kpi-tile"><small>Part de 65 ans ou plus</small><strong>${fmt(window.VOInsee.helpers.findPct(h.pyramide_ages?.tranches, "65 ans ou plus"), "%")}</strong></div>
        </div>
        <p class="detail-method">Sources : Insee RP2023 (âges, diplômes, familles), Filosofi 2023 (revenus, pauvreté). Petites communes parfois secrétisées.</p>`;
    },
    emploi_mobilites: (p) => {
      const e = p.themes.emploi_mobilites;
      const f = window.VOInsee.helpers.findPct;
      return `
        <div class="kpi-grid">
          <div class="kpi-tile"><small>Actifs occupés résidents</small><strong>${fmt(e.actifs_occupes_residents, "pers.")}</strong></div>
          <div class="kpi-tile"><small>Part de cadres</small><strong>${fmt(f(e.profession, "Cadres"), "%")}</strong></div>
          <div class="kpi-tile"><small>Part d'emplois stables</small><strong>${fmt(f(e.employment, "Emploi stable"), "%")}</strong></div>
          <div class="kpi-tile"><small>Part voiture (trajet travail)</small><strong>${fmt(f(e.transport, "Voiture, camion, fourgonnette"), "%")}</strong></div>
        </div>
        <p class="detail-method">${e.scope_note}</p>`;
    },
    logement: (p) => {
      const l = p.themes.logement;
      const total = l.parc.total ? l.parc.total.value : null;
      const rp = l.parc.residences_principales?.value;
      const vacRate = l.vacance.taux_vacance_rp?.value;
      const rplsShare = l.social.part_rpls_residences_principales?.value;
      return `
        <div class="kpi-grid">
          <div class="kpi-tile"><small>Logements (parc total)</small><strong>${fmt(total, "logements")}</strong></div>
          <div class="kpi-tile"><small>Résidences principales</small><strong>${fmt(rp, "logements")}</strong></div>
          <div class="kpi-tile${vacRate != null && vacRate > 8 ? " warn" : ""}"><small>Taux de vacance RP</small><strong>${fmt(vacRate, "%")}</strong></div>
          <div class="kpi-tile"><small>Part RPLS des RP</small><strong>${fmt(rplsShare, "%")}</strong></div>
        </div>
        <p class="detail-method">Sources : Insee 2023, RPLS 2025. Détail complet dans « Sources, millésimes et licences ».</p>`;
    },
    economie_equipements: (p) => {
      const e = p.themes.economie_equipements || {};
      const ent = e.entreprises || {};
      const equip = e.equipements?.denombrement || {};
      return `
        <div class="kpi-grid">
          <div class="kpi-tile"><small>Établissements actifs</small><strong>${fmt(ent.etablissements_actifs?.value, "étab.")}</strong><em>${ent.annee || ""}</em></div>
          <div class="kpi-tile"><small>Pharmacies</small><strong>${fmt(equip["Pharmacie"]?.value, "équip.")}</strong></div>
          <div class="kpi-tile"><small>Médecins généralistes</small><strong>${fmt(equip["Médecin généraliste"]?.value, "équip.")}</strong></div>
          <div class="kpi-tile"><small>Écoles (maternelle + primaire)</small><strong>${fmt((equip["École maternelle"]?.value || 0) + (equip["École primaire"]?.value || 0), "équip.")}</strong></div>
        </div>
        <p class="detail-method">Sources : Insee REE ${ent.annee || ""} (entreprises), Insee BPE ${e.equipements?.annee || ""} (équipements).</p>`;
    },
  };

  function renderDetail(code) {
    const isEpci = state.scale === "epci";
    const p = isEpci ? state.epcisByCode.get(code) : state.communesByCode.get(code)?.profile;
    const detailPanel = document.getElementById("detailPanel");
    const detailContent = document.getElementById("detailContent");
    if (!p) { detailPanel.classList.remove("open"); return; }
    const name = isEpci ? p.name : state.communesByCode.get(code).name;
    const territoryType = isEpci && !p.special ? "EPCI" : "Commune";
    const theme = THEMES[state.activeTheme];
    const profileUrl = (isEpci ? `fiche.html?type=epci&id=${encodeURIComponent(code)}` : `fiche.html?type=commune&id=${encodeURIComponent(code)}`) + `&theme=${encodeURIComponent(state.activeTheme)}`;

    const partialNote = isEpci && p.themes.logement && p.themes.logement.perimetre_partiel ? `<div class="flag-note">Indicateurs calculés sur les communes val-d'oisiennes de cet EPCI (périmètre complet débordant sur un département voisin).</div>` : "";

    const body = DETAIL_RENDERERS[state.activeTheme](p, name, territoryType);
    detailContent.innerHTML = `
      <span class="detail-tag">${territoryType.toUpperCase()} · ${theme.label.toUpperCase()} · VAL-D'OISE</span>
      <h2>${name}</h2>
      <p class="subtitle">${theme.intro}</p>
      ${partialNote}
      ${body}
      <a class="profile-link" href="${profileUrl}" target="_blank" rel="noopener">Voir la fiche ${isEpci ? "EPCI" : "communale"} complète et le PDF <span>↗</span></a>
    `;
    detailPanel.classList.add("open");
  }

  function renderEmptyState() {
    document.getElementById("detailPanel").classList.remove("open");
    document.getElementById("mapStatus").textContent = `Val-d'Oise · sélectionnez ${state.scale === "epci" ? "un EPCI" : "une commune"} pour voir son profil`;
  }

  document.getElementById("closeDetail").addEventListener("click", () => document.getElementById("detailPanel").classList.remove("open"));
})();
