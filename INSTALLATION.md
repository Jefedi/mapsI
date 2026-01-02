# Guide d'Installation - MapsI via AltStore

## Qu'est-ce qu'AltStore ?

AltStore est un magasin d'applications alternatif pour iOS qui permet d'installer des applications sans jailbreak. Il utilise votre compte Apple pour signer les applications.

## Prerequis

### Sur votre ordinateur (Mac ou Windows)

1. **Telecharger AltServer** : https://altstore.io
2. **Installer AltServer** sur votre ordinateur
3. **iTunes** (Windows uniquement) ou **iCloud for Windows** doit etre installe

### Sur votre iPhone/iPad

1. **iOS 16.0** ou superieur
2. **AltStore** installe sur l'appareil

## Etape 1 : Installer AltStore sur votre iPhone

### Sur Mac

1. Lancez **AltServer** (icone dans la barre de menu)
2. Connectez votre iPhone via USB
3. Cliquez sur l'icone AltServer > **Install AltStore** > Votre appareil
4. Entrez votre identifiant Apple et mot de passe
5. AltStore s'installe sur votre iPhone

### Sur Windows

1. Lancez **AltServer**
2. Connectez votre iPhone via USB
3. Clic droit sur l'icone AltServer dans la barre des taches
4. **Install AltStore** > Votre appareil
5. Entrez votre identifiant Apple et mot de passe

## Etape 2 : Compiler MapsI (sur Mac avec Xcode)

### Option A : Compilation manuelle

1. **Ouvrir le projet** :
   ```bash
   cd /chemin/vers/mapsI
   open MapsI.xcodeproj
   ```

2. **Configurer le signing** dans Xcode :
   - Selectionnez le projet dans le navigateur
   - Onglet "Signing & Capabilities"
   - Cochez "Automatically manage signing"
   - Selectionnez votre Team (compte Apple)

3. **Archiver** :
   - Menu **Product** > **Archive**
   - Attendez la fin de la compilation

4. **Exporter l'IPA** :
   - L'Organizer s'ouvre automatiquement
   - Selectionnez l'archive MapsI
   - Cliquez sur **Distribute App**
   - Choisissez **Development**
   - Suivez les etapes
   - Sauvegardez le fichier .ipa

### Option B : Script automatise

```bash
cd /chemin/vers/mapsI
./scripts/build-ipa.sh
```

Le fichier IPA sera dans `build/Export/MapsI.ipa`

## Etape 3 : Installer MapsI via AltStore

### Methode 1 : Via ordinateur (recommande)

1. Assurez-vous qu'**AltServer** est lance sur votre ordinateur
2. Connectez votre iPhone au meme reseau Wi-Fi (ou via USB)
3. Sur l'iPhone, ouvrez **AltStore**
4. Allez dans l'onglet **My Apps**
5. Appuyez sur **+** en haut a gauche
6. Naviguez vers le fichier `MapsI.ipa`
7. L'installation demarre automatiquement

### Methode 2 : Via AirDrop

1. Envoyez le fichier `MapsI.ipa` via AirDrop vers votre iPhone
2. Quand vous recevez le fichier, choisissez **Ouvrir avec AltStore**
3. L'installation demarre

### Methode 3 : Via Mail/iCloud Drive

1. Envoyez-vous le fichier IPA par mail ou stockez-le sur iCloud Drive
2. Sur l'iPhone, ouvrez le fichier
3. Utilisez le bouton de partage et choisissez **AltStore**

## Etape 4 : Approuver l'application

1. Allez dans **Reglages** > **General** > **Gestion de l'appareil**
2. Selectionnez votre compte developpeur
3. Appuyez sur **Faire confiance**

## Renouvellement (Important !)

Avec un compte Apple **gratuit**, l'application doit etre resignee **tous les 7 jours**.

### Comment renouveler :

1. Assurez-vous qu'AltServer est lance sur votre ordinateur
2. Connectez votre iPhone au meme reseau Wi-Fi
3. Ouvrez **AltStore** sur votre iPhone
4. L'application se renouvelle automatiquement en arriere-plan

**Conseil** : Activez le **rafraichissement en arriere-plan** pour AltStore dans les reglages iOS.

### Avec Apple Developer Program (99$/an)

Si vous avez un compte developpeur payant, l'application reste valide **1 an**.

## Depannage

### L'installation echoue

- Verifiez qu'AltServer est bien lance
- Verifiez la connexion reseau (meme Wi-Fi)
- Essayez avec une connexion USB
- Redemarrez AltServer et AltStore

### "Unable to Install"

- Vous avez peut-etre atteint la limite de 3 applications (compte gratuit)
- Supprimez une application installee via AltStore

### "Could not find AltServer"

- Assurez-vous qu'AltServer est actif
- Verifiez le pare-feu de votre ordinateur
- Utilisez une connexion USB au lieu du Wi-Fi

### L'application expire

- Ouvrez AltStore pour rafraichir les applications
- Si expire, reinstallez l'IPA

## Fonctionnalites de MapsI

Une fois installe, MapsI vous permet de :

- **Rechercher** des adresses avec OpenStreetMap
- **Naviguer** avec guidage vocal en francais
- **Choisir** votre mode de transport (voiture, velo, pieton)
- **Afficher** differents styles de cartes
- **Consulter** l'historique de vos recherches

## Support

Pour toute question ou probleme :
- Ouvrez une issue sur le repository GitHub
- Consultez la documentation AltStore : https://faq.altstore.io
