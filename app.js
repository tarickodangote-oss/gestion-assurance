"use strict";

/* ==========================================================================
   Base de données locale (IndexedDB) — toutes les données restent sur
   l'appareil, rien n'est envoyé sur internet sauf l'appel WhatsApp que
   TU déclenches toi-même.
   ========================================================================== */

const DB_NAME = "assuranceDB";
const DB_VERSION = 1;
let db;

function ouvrirDB() {
  return new Promise((resolve, reject) => {
    const requete = indexedDB.open(DB_NAME, DB_VERSION);

    requete.onupgradeneeded = (event) => {
      const base = event.target.result;
      if (!base.objectStoreNames.contains("clients")) {
        base.createObjectStore("clients", { keyPath: "id", autoIncrement: true });
      }
      if (!base.objectStoreNames.contains("effets")) {
        const effets = base.createObjectStore("effets", { keyPath: "id", autoIncrement: true });
        effets.createIndex("clientId", "clientId", { unique: false });
      }
      if (!base.objectStoreNames.contains("config")) {
        base.createObjectStore("config", { keyPath: "cle" });
      }
    };

    requete.onsuccess = (event) => { db = event.target.result; resolve(db); };
    requete.onerror = (event) => reject(event.target.error);
  });
}

function tx(storeName, mode = "readonly") {
  return db.transaction(storeName, mode).objectStore(storeName);
}

function ajouter(storeName, objet) {
  return new Promise((resolve, reject) => {
    const req = tx(storeName, "readwrite").add(objet);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function mettreAJour(storeName, objet) {
  return new Promise((resolve, reject) => {
    const req = tx(storeName, "readwrite").put(objet);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function supprimer(storeName, id) {
  return new Promise((resolve, reject) => {
    const req = tx(storeName, "readwrite").delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

function obtenir(storeName, id) {
  return new Promise((resolve, reject) => {
    const req = tx(storeName).get(id);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

function toutObtenir(storeName) {
  return new Promise((resolve, reject) => {
    const req = tx(storeName).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

async function getConfig(cle, defaut = "") {
  const row = await obtenir("config", cle);
  return row ? row.valeur : defaut;
}

async function setConfig(cle, valeur) {
  await mettreAJour("config", { cle, valeur });
}

/* ==========================================================================
   Logique métier : dates et échéances
   ========================================================================== */

function parseDate(str) {
  if (!str) return null;
  str = str.trim();
  let m = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (m) {
    let [, j, mo, a] = m;
    a = a.length === 2 ? "20" + a : a;
    const d = new Date(parseInt(a), parseInt(mo) - 1, parseInt(j));
    return isNaN(d.getTime()) ? null : d;
  }
  m = str.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) {
    const [, a, mo, j] = m;
    const d = new Date(parseInt(a), parseInt(mo) - 1, parseInt(j));
    return isNaN(d.getTime()) ? null : d;
  }
  return null;
}

function formatDate(d) {
  const j = String(d.getDate()).padStart(2, "0");
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const a = d.getFullYear();
  return `${j}/${m}/${a}`;
}

function calculerEcheance(dateEffetStr, periodeStr) {
  const dateObj = parseDate(dateEffetStr);
  if (!dateObj || !periodeStr) return "";

  const match = periodeStr.trim().toUpperCase().match(/^(\d+)\s*([A-Z]*)$/);
  if (!match) return "";
  const nombre = parseInt(match[1]);
  const unite = match[2] || "M";

  let finale;
  if (unite.startsWith("J")) {
    finale = new Date(dateObj);
    finale.setDate(finale.getDate() + nombre);
  } else if (unite.startsWith("A")) {
    finale = new Date(dateObj);
    finale.setFullYear(finale.getFullYear() + nombre);
  } else {
    finale = new Date(dateObj);
    finale.setMonth(finale.getMonth() + nombre);
  }
  return formatDate(finale);
}

function joursRestants(echeanceStr) {
  const d = parseDate(echeanceStr);
  if (!d) return null;
  const auj = new Date();
  auj.setHours(0, 0, 0, 0);
  d.setHours(0, 0, 0, 0);
  return Math.round((d - auj) / 86400000);
}

/* ==========================================================================
   Envoi WhatsApp via CallMeBot (appel direct depuis le téléphone,
   aucun serveur intermédiaire)
   ========================================================================== */

function envoyerWhatsapp(phone, apikey, message) {
  const url = "https://api.callmebot.com/whatsapp.php?phone=" + encodeURIComponent(phone) +
              "&text=" + encodeURIComponent(message) + "&apikey=" + encodeURIComponent(apikey);
  // mode no-cors : on ne peut pas lire la réponse, mais la requête part bien.
  return fetch(url, { mode: "no-cors" }).then(() => true).catch(() => false);
}

async function verifierEtEnvoyerAlertes() {
  const phone = await getConfig("whatsapp_phone");
  const apikey = await getConfig("callmebot_apikey");
  const seuil = parseInt(await getConfig("jours_alerte", "3")) || 3;

  if (!phone || !apikey) return { nb: 0, ok: false, err: "Paramètres WhatsApp non configurés." };

  const effets = await toutObtenir("effets");
  const aSignaler = effets.filter(e => {
    if (e.alerteEnvoyee) return false;
    const jr = joursRestants(e.echeance);
    return jr !== null && jr <= seuil;
  });

  if (aSignaler.length === 0) return { nb: 0, ok: true, err: "" };

  let texte = `⚠️ Mansa Assurance — Échéances à surveiller (${aSignaler.length}) :\n`;
  for (const e of aSignaler) {
    texte += `\n- ${e.nomClient} | ${e.marque || ""} ${e.matricule || ""} | N° ${e.numero || ""} | échéance : ${e.echeance}`;
  }

  const ok = await envoyerWhatsapp(phone, apikey, texte);
  if (!ok) return { nb: 0, ok: false, err: "Échec réseau lors de l'envoi." };

  for (const e of aSignaler) {
    e.alerteEnvoyee = true;
    await mettreAJour("effets", e);
  }
  return { nb: aSignaler.length, ok: true, err: "" };
}

/* ==========================================================================
   Interface : navigation entre pages
   ========================================================================== */

function afficherPage(nom) {
  document.querySelectorAll(".page").forEach(p => p.classList.remove("actif"));
  document.getElementById("page-" + nom).classList.add("actif");
  document.querySelectorAll("nav.bottom-nav button").forEach(b => b.classList.remove("actif"));
  const btn = document.querySelector(`nav.bottom-nav button[data-page="${nom}"]`);
  if (btn) btn.classList.add("actif");

  const sousTitres = {
    echeances: "Suivi des polices & échéances",
    clients: "Registre des clients",
    parametres: "Alertes & configuration",
    "client-form": "Registre des clients",
    "effet-form": "Suivi des polices & échéances",
  };
  const sousTitre = document.querySelector(".marque-texte p");
  if (sousTitre && sousTitres[nom]) sousTitre.textContent = sousTitres[nom];

  if (nom === "echeances") rafraichirEffets();
  if (nom === "clients") rafraichirClients();
  if (nom === "parametres") chargerParametres();
}

function flash(message, estErreur = false) {
  const zone = document.getElementById("zone-flash");
  zone.innerHTML = `<div class="flash ${estErreur ? "erreur" : ""}">${escapeHtml(message)}</div>`;
  setTimeout(() => { zone.innerHTML = ""; }, 4000);
}

function escapeHtml(str) {
  const d = document.createElement("div");
  d.textContent = str ?? "";
  return d.innerHTML;
}

/* ==========================================================================
   Page Échéances (tableau des effets)
   ========================================================================== */

let rechercheEffets = "";
let filtreStatut = null; // null = tous, "urgent", "bientot"

function calculerStatut(e, seuil) {
  const jr = joursRestants(e.echeance);
  if (jr === null) return "normal";
  if (jr <= seuil) return "urgent";
  if (jr <= seuil * 5) return "bientot";
  return "normal";
}

function basculerFiltreStatut(statut) {
  filtreStatut = (filtreStatut === statut) ? null : statut;
  rafraichirEffets();
}

async function rafraichirEffets() {
  const conteneur = document.getElementById("liste-effets");
  const bandeau = document.getElementById("bandeau-stats");
  const tousEffets = await toutObtenir("effets");
  const seuil = parseInt(await getConfig("jours_alerte", "3")) || 3;

  let nbUrgent = 0, nbBientot = 0;
  for (const e of tousEffets) {
    const s = calculerStatut(e, seuil);
    if (s === "urgent") nbUrgent++;
    else if (s === "bientot") nbBientot++;
  }

  const estActif = (cle) => filtreStatut === cle ? "actif" : "";
  bandeau.innerHTML = `
    <button class="stat-puce total ${estActif(null)}" onclick="basculerFiltreStatut(null)">
      <span class="nombre">${tousEffets.length}</span><span class="libelle">Effets</span>
    </button>
    <button class="stat-puce bientot ${estActif('bientot')}" onclick="basculerFiltreStatut('bientot')">
      <span class="nombre">${nbBientot}</span><span class="libelle">Bientôt</span>
    </button>
    <button class="stat-puce urgent ${estActif('urgent')}" onclick="basculerFiltreStatut('urgent')">
      <span class="nombre">${nbUrgent}</span><span class="libelle">Urgent</span>
    </button>
  `;

  const filtres = tousEffets
    .filter(e => {
      const r = rechercheEffets.toLowerCase();
      const okRecherche = !r ||
             (e.nomClient || "").toLowerCase().includes(r) ||
             (e.matricule || "").toLowerCase().includes(r) ||
             (e.numero || "").toLowerCase().includes(r);
      if (!okRecherche) return false;

      if (filtreStatut === null) return true;
      return calculerStatut(e, seuil) === filtreStatut;
    })
    .sort((a, b) => b.id - a.id);

  if (filtres.length === 0) {
    const libelles = { urgent: "urgent", bientot: "à surveiller bientôt" };
    const texteVide = filtreStatut
      ? `Aucun effet ${libelles[filtreStatut]} pour le moment.`
      : "Ajoute un client pour qu'il apparaisse ici avec sa date d'échéance.";
    conteneur.innerHTML = `
      <div class="vide">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/></svg>
        <strong>Aucun effet</strong>
        ${texteVide}
      </div>`;
    return;
  }

  conteneur.innerHTML = filtres.map(e => {
    const jr = joursRestants(e.echeance);
    let statut = "normal", val = "—", unite = "";
    if (jr !== null) {
      if (jr >= 0) { val = jr; unite = jr === 1 ? "jour" : "jours"; }
      else { val = -jr; unite = "j. retard"; }
      if (jr <= seuil) statut = "urgent";
      else if (jr <= seuil * 5) statut = "bientot";
    }
    return `
      <div class="carte ${statut}">
        <div class="sceau-jours"><span class="val">${val}</span><span class="unite">${unite}</span></div>
        <div class="carte-titre">${escapeHtml(e.nomClient)}</div>
        <div class="carte-ligne"><b>${escapeHtml(e.marque || "—")}</b> · Matricule ${escapeHtml(e.matricule || "—")}</div>
        <div class="carte-ligne">N° ${escapeHtml(e.numero || "—")} · Période ${escapeHtml(e.periode || "—")}</div>
        <div class="carte-ligne">Effet : ${escapeHtml(e.dateEffet || "—")} → Échéance : ${escapeHtml(e.echeance || "—")}</div>
        <div class="carte-actions">
          <button class="btn btn-secondaire btn-petit" onclick="ouvrirFormulaireEffet(${e.id})">Modifier</button>
          <button class="btn btn-danger btn-petit" onclick="confirmerSuppressionEffet(${e.id})">Supprimer</button>
        </div>
      </div>`;
  }).join("");
}

async function confirmerSuppressionEffet(id) {
  if (!confirm("Supprimer cet effet ?")) return;
  await supprimer("effets", id);
  flash("Effet supprimé.");
  rafraichirEffets();
}

/* ==========================================================================
   Page Clients
   ========================================================================== */

let rechercheClients = "";

async function rafraichirClients() {
  const conteneur = document.getElementById("liste-clients");
  const tous = (await toutObtenir("clients"))
    .filter(c => {
      const r = rechercheClients.toLowerCase();
      if (!r) return true;
      return (c.nom || "").toLowerCase().includes(r) ||
             (c.telephone || "").toLowerCase().includes(r) ||
             (c.email || "").toLowerCase().includes(r);
    })
    .sort((a, b) => (a.nom || "").localeCompare(b.nom || ""));

  if (tous.length === 0) {
    conteneur.innerHTML = `
      <div class="vide">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="12" cy="8" r="3.4"/><path d="M5 20c0-3.9 3.1-7 7-7s7 3.1 7 7"/></svg>
        <strong>Aucun client enregistré</strong>
        Appuie sur + pour ajouter ton premier client.
      </div>`;
    return;
  }

  conteneur.innerHTML = tous.map(c => `
    <div class="carte">
      <div class="carte-titre">${escapeHtml(c.nom)}</div>
      ${c.telephone ? `<div class="carte-ligne">📞 ${escapeHtml(c.telephone)}</div>` : ""}
      ${c.adresse ? `<div class="carte-ligne">📍 ${escapeHtml(c.adresse)}</div>` : ""}
      ${c.email ? `<div class="carte-ligne">✉️ ${escapeHtml(c.email)}</div>` : ""}
      <div class="carte-actions">
        <button class="btn btn-secondaire btn-petit" onclick="ouvrirFormulaireClient(${c.id})">Modifier</button>
        <button class="btn btn-danger btn-petit" onclick="confirmerSuppressionClient(${c.id})">Supprimer</button>
      </div>
    </div>`).join("");
}

async function confirmerSuppressionClient(id) {
  if (!confirm("Supprimer ce client et ses effets liés ?")) return;
  const effets = await toutObtenir("effets");
  for (const e of effets) {
    if (e.clientId === id) await supprimer("effets", e.id);
  }
  await supprimer("clients", id);
  flash("Client supprimé.");
  rafraichirClients();
}

/* ==========================================================================
   Formulaire Client (ajout envoie automatiquement l'effet lié)
   ========================================================================== */

let clientEnEdition = null;

async function ouvrirFormulaireClient(id = null) {
  clientEnEdition = id;
  const zoneEffet = document.getElementById("zone-effet-client-form");
  const titre = document.getElementById("titre-client-form");
  const form = document.getElementById("form-client");
  form.reset();

  if (id) {
    titre.textContent = "Modifier le client";
    zoneEffet.style.display = "none"; // on modifie l'effet depuis l'onglet Échéances
    const c = await obtenir("clients", id);
    form.nom.value = c.nom || "";
    form.telephone.value = c.telephone || "";
    form.adresse.value = c.adresse || "";
    form.email.value = c.email || "";
  } else {
    titre.textContent = "Nouveau client";
    zoneEffet.style.display = "block";
  }
  afficherPage("client-form");
}

document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("form-client").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const form = ev.target;
    const nom = form.nom.value.trim();
    if (!nom) { flash("Le nom du client est obligatoire.", true); return; }

    if (clientEnEdition) {
      const c = await obtenir("clients", clientEnEdition);
      c.nom = nom;
      c.telephone = form.telephone.value.trim();
      c.adresse = form.adresse.value.trim();
      c.email = form.email.value.trim();
      await mettreAJour("clients", c);
      flash("Client mis à jour.");
    } else {
      const clientId = await ajouter("clients", {
        nom, telephone: form.telephone.value.trim(),
        adresse: form.adresse.value.trim(), email: form.email.value.trim(),
        dateCreation: new Date().toISOString(),
      });

      let echeance = form.echeance.value.trim();
      const dateEffet = form.date_effet.value.trim();
      const periode = form.periode.value.trim();
      if (!echeance) echeance = calculerEcheance(dateEffet, periode);

      await ajouter("effets", {
        dateEffet, nomClient: nom,
        matricule: form.matricule.value.trim(),
        marque: form.marque.value.trim(),
        numero: form.numero.value.trim(),
        periode, echeance, clientId, alerteEnvoyee: false,
      });
      flash("Client ajouté et envoyé dans le tableau des échéances.");
    }

    afficherPage("echeances");
  });

  document.getElementById("form-effet").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const form = ev.target;
    const nomClient = form.nom_client.value.trim();
    if (!nomClient) { flash("Le nom du client est obligatoire.", true); return; }

    let echeance = form.echeance.value.trim();
    const dateEffet = form.date_effet.value.trim();
    const periode = form.periode.value.trim();
    if (!echeance) echeance = calculerEcheance(dateEffet, periode);

    const clients = await toutObtenir("clients");
    const clientTrouve = clients.find(c => c.nom === nomClient);

    if (effetEnEdition) {
      const e = await obtenir("effets", effetEnEdition);
      Object.assign(e, {
        dateEffet, nomClient, matricule: form.matricule.value.trim(),
        marque: form.marque.value.trim(), numero: form.numero.value.trim(),
        periode, echeance, clientId: clientTrouve ? clientTrouve.id : null,
        alerteEnvoyee: false,
      });
      await mettreAJour("effets", e);
      flash("Effet mis à jour.");
    } else {
      await ajouter("effets", {
        dateEffet, nomClient, matricule: form.matricule.value.trim(),
        marque: form.marque.value.trim(), numero: form.numero.value.trim(),
        periode, echeance, clientId: clientTrouve ? clientTrouve.id : null,
        alerteEnvoyee: false,
      });
      flash("Effet ajouté.");
    }
    afficherPage("echeances");
  });

  document.getElementById("form-parametres").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const form = ev.target;
    await setConfig("whatsapp_phone", form.whatsapp_phone.value.trim());
    await setConfig("callmebot_apikey", form.callmebot_apikey.value.trim());
    await setConfig("jours_alerte", form.jours_alerte.value.trim() || "3");
    flash("Paramètres enregistrés.");
  });

  document.getElementById("btn-test-whatsapp").addEventListener("click", async () => {
    const phone = await getConfig("whatsapp_phone");
    const apikey = await getConfig("callmebot_apikey");
    if (!phone || !apikey) { flash("Renseigne d'abord ton numéro et ta clé API.", true); return; }
    const ok = await envoyerWhatsapp(phone, apikey, "Ceci est un message test de Mansa Assurance.");
    flash(ok ? "Message test envoyé (vérifie ton WhatsApp)." : "Échec de l'envoi — vérifie ta connexion internet.", !ok);
  });

  document.getElementById("btn-verifier-maintenant").addEventListener("click", async () => {
    const { nb, ok, err } = await verifierEtEnvoyerAlertes();
    if (!ok) flash(`Échec de l'envoi : ${err}`, true);
    else if (nb === 0) flash("Aucune échéance proche pour le moment.");
    else flash(`Alerte envoyée pour ${nb} effet(s).`);
  });

  document.getElementById("champ-recherche-effets").addEventListener("input", (ev) => {
    rechercheEffets = ev.target.value;
    rafraichirEffets();
  });

  document.getElementById("champ-recherche-clients").addEventListener("input", (ev) => {
    rechercheClients = ev.target.value;
    rafraichirClients();
  });

  document.querySelectorAll("nav.bottom-nav button[data-page]").forEach(btn => {
    btn.addEventListener("click", () => afficherPage(btn.dataset.page));
  });

  document.getElementById("btn-annuler-client").addEventListener("click", () => afficherPage("clients"));
  document.getElementById("btn-annuler-effet").addEventListener("click", () => afficherPage("echeances"));

  demarrer();
});

/* ==========================================================================
   Formulaire Effet (depuis l'onglet Échéances : ajout libre ou modification)
   ========================================================================== */

let effetEnEdition = null;

async function ouvrirFormulaireEffet(id = null) {
  effetEnEdition = id;
  const titre = document.getElementById("titre-effet-form");
  const form = document.getElementById("form-effet");
  form.reset();

  const clients = await toutObtenir("clients");
  const datalist = document.getElementById("liste-noms-clients");
  datalist.innerHTML = clients.map(c => `<option value="${escapeHtml(c.nom)}">`).join("");

  if (id) {
    titre.textContent = "Modifier un effet";
    const e = await obtenir("effets", id);
    form.nom_client.value = e.nomClient || "";
    form.date_effet.value = e.dateEffet || "";
    form.matricule.value = e.matricule || "";
    form.marque.value = e.marque || "";
    form.numero.value = e.numero || "";
    form.periode.value = e.periode || "";
    form.echeance.value = e.echeance || "";
  } else {
    titre.textContent = "Nouvel effet";
  }
  afficherPage("effet-form");
}

/* ==========================================================================
   Paramètres
   ========================================================================== */

async function chargerParametres() {
  document.getElementById("form-parametres").whatsapp_phone.value = await getConfig("whatsapp_phone");
  document.getElementById("form-parametres").callmebot_apikey.value = await getConfig("callmebot_apikey");
  document.getElementById("form-parametres").jours_alerte.value = await getConfig("jours_alerte", "3");
}

/* ==========================================================================
   Démarrage
   ========================================================================== */

async function demarrer() {
  await ouvrirDB();
  afficherPage("echeances");

  // Vérifie automatiquement les échéances proches à chaque ouverture de l'appli
  const phone = await getConfig("whatsapp_phone");
  const apikey = await getConfig("callmebot_apikey");
  if (phone && apikey) {
    verifierEtEnvoyerAlertes().then(({ nb }) => {
      if (nb > 0) flash(`Alerte WhatsApp envoyée pour ${nb} effet(s) proche(s) de l'échéance.`);
    });
  }

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("service-worker.js").catch(() => {});
  }
}
