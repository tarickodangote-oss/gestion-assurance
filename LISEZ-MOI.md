# Mansa Assurance — Application Mobile Locale

Application pour ton téléphone (Android **et** iPhone), sans installation
depuis un store. Toutes tes données (clients, effets, échéances) restent
**enregistrées uniquement sur ton téléphone**, dans le navigateur — rien
n'est envoyé sur internet, sauf le message WhatsApp que tu déclenches toi-même.

## Fonctionnalités

- **Onglet Échéances** : tous les effets, avec jours restants et couleur
  (🔴 rouge = urgent, 🟡 jaune = à surveiller bientôt)
- **Onglet Clients** : enregistrer un client — il est automatiquement
  envoyé dans le tableau des échéances avec son effet
- **Onglet Paramètres** : configure les alertes WhatsApp automatiques
  (gratuites, via CallMeBot)
- Fonctionne **hors-ligne** une fois ouverte une première fois
- Peut s'ajouter à l'écran d'accueil comme une vraie application

---

## Étape 1 — Installer l'application sur ton téléphone

Le dossier `assurance_mobile` contient des fichiers web (HTML/CSS/JS).
Pour qu'ils s'installent correctement comme une application sur ton
téléphone (icône, mode hors-ligne, écran plein), la façon la plus fiable
est de les héberger sur un espace **gratuit** — tes données resteront
quand même uniquement sur ton téléphone, seuls les fichiers de
l'application (l'apparence, pas tes clients) sont hébergés.

### Option recommandée : GitHub Pages (gratuit, 5 minutes)

1. Va sur https://github.com et crée un compte gratuit si tu n'en as pas
2. Clique sur **New repository**, nomme-le par exemple `gestion-assurance`,
   coche "Public", clique sur **Create repository**
3. Clique sur **uploading an existing file**, et glisse-dépose **tous les
   fichiers** du dossier `assurance_mobile` (index.html, style.css, app.js,
   manifest.json, service-worker.js, icon-192.png, icon-512.png)
4. Clique sur **Commit changes**
5. Va dans **Settings** → **Pages** (menu de gauche)
6. Dans "Branch", choisis `main` et clique sur **Save**
7. Après 1-2 minutes, une adresse apparaît en haut, du style
   `https://tonpseudo.github.io/gestion-assurance/` — c'est ton application !

### Ouvrir l'application sur ton téléphone

1. Ouvre cette adresse dans **Chrome** (Android) ou **Safari** (iPhone)
2. **Sur Android (Chrome)** : appuie sur les 3 points en haut à droite →
   "Ajouter à l'écran d'accueil"
3. **Sur iPhone (Safari)** : appuie sur l'icône de partage (carré avec une
   flèche) en bas → "Sur l'écran d'accueil"
4. Une icône "Mansa" apparaît sur ton écran d'accueil — clique dessus,
   elle s'ouvre en plein écran comme une vraie application

Une fois ouverte au moins une fois avec internet, l'application continue
de fonctionner **même sans connexion** (sauf pour l'envoi WhatsApp, qui a
besoin d'internet au moment de l'envoi).

### Alternative sans compte GitHub

Si tu préfères ne rien héberger, tu peux ouvrir directement le fichier
`index.html` depuis l'application "Fichiers" de ton téléphone. Ça
fonctionne pour tester, mais l'ajout à l'écran d'accueil et le mode
hors-ligne sont moins fiables de cette façon — l'option GitHub Pages
ci-dessus est recommandée pour un usage quotidien.

---

## Étape 2 — Activer les alertes WhatsApp (gratuit, 2 minutes)

1. Enregistre ce numéro dans tes contacts WhatsApp : **+34 644 84 71 64**
2. Envoie-lui, sur WhatsApp, exactement ce message :
   `I allow callmebot to send me messages`
3. Tu reçois une réponse automatique avec ta **clé API** — note-la
4. Dans l'application → onglet **Paramètres** :
   - Ton numéro (avec l'indicatif pays, sans le `+`, ex : `2250700000000`)
   - Colle ta clé API
   - Choisis dans combien de jours avant l'échéance tu veux être alerté
   - Enregistre
5. Appuie sur **Message test** pour vérifier

## Comment fonctionnent les alertes

L'application vérifie automatiquement les échéances proches **à chaque
fois que tu l'ouvres**. Si une échéance approche, elle envoie un message
WhatsApp groupé avec les informations des clients concernés — chaque
échéance n'est signalée **qu'une seule fois** (pas de répétition), et se
réactive automatiquement si tu modifies la date (renouvellement).

Comme il n'y a pas de serveur qui tourne en permanence, il faut donc
**ouvrir l'application au moins une fois par jour** (par exemple le matin)
pour que la vérification WhatsApp se déclenche. Tu peux aussi appuyer sur
**Vérifier maintenant** dans Paramètres à tout moment.

---

## Sauvegarder tes données

Les données sont stockées dans le navigateur de ton téléphone. Pour éviter
de les perdre (changement de téléphone, nettoyage du navigateur), il est
recommandé de ne pas vider les données du navigateur pour ce site, et
d'éviter le mode navigation privée.

## Besoin d'ajouter quelque chose ?

Un export/sauvegarde des données, un import, ou une synchronisation entre
plusieurs téléphones — dis-le moi, je peux l'ajouter.
