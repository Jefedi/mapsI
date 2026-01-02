#!/bin/bash

# MapsI - Script de compilation et export IPA pour AltStore
# Ce script doit etre execute sur un Mac avec Xcode installe

set -e

# Configuration
PROJECT_NAME="MapsI"
SCHEME="MapsI"
CONFIGURATION="Release"
BUILD_DIR="build"
ARCHIVE_PATH="$BUILD_DIR/$PROJECT_NAME.xcarchive"
EXPORT_PATH="$BUILD_DIR/Export"
IPA_NAME="$PROJECT_NAME.ipa"

# Couleurs pour l'affichage
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  MapsI - Build Script pour AltStore${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""

# Verification de l'environnement
check_requirements() {
    echo -e "${YELLOW}Verification des prerequis...${NC}"

    if ! command -v xcodebuild &> /dev/null; then
        echo -e "${RED}Erreur: Xcode n'est pas installe ou xcodebuild n'est pas dans le PATH${NC}"
        exit 1
    fi

    XCODE_VERSION=$(xcodebuild -version | head -n 1)
    echo -e "  Xcode: $XCODE_VERSION"

    if [ ! -f "$PROJECT_NAME.xcodeproj/project.pbxproj" ]; then
        echo -e "${RED}Erreur: Projet Xcode non trouve. Executez ce script depuis le dossier racine du projet.${NC}"
        exit 1
    fi

    echo -e "${GREEN}  Prerequis OK${NC}"
    echo ""
}

# Nettoyage
clean_build() {
    echo -e "${YELLOW}Nettoyage du build precedent...${NC}"
    rm -rf "$BUILD_DIR"
    mkdir -p "$BUILD_DIR"
    echo -e "${GREEN}  Nettoyage termine${NC}"
    echo ""
}

# Archive du projet
archive_project() {
    echo -e "${YELLOW}Archivage du projet...${NC}"
    echo "  Cela peut prendre quelques minutes..."

    xcodebuild archive \
        -project "$PROJECT_NAME.xcodeproj" \
        -scheme "$SCHEME" \
        -configuration "$CONFIGURATION" \
        -archivePath "$ARCHIVE_PATH" \
        -destination "generic/platform=iOS" \
        CODE_SIGN_IDENTITY="" \
        CODE_SIGNING_REQUIRED=NO \
        CODE_SIGNING_ALLOWED=NO \
        2>&1 | grep -E "(error:|warning:|BUILD|ARCHIVE)"

    if [ ! -d "$ARCHIVE_PATH" ]; then
        echo -e "${RED}Erreur: L'archive n'a pas ete creee${NC}"
        exit 1
    fi

    echo -e "${GREEN}  Archive creee: $ARCHIVE_PATH${NC}"
    echo ""
}

# Export IPA
export_ipa() {
    echo -e "${YELLOW}Export de l'IPA...${NC}"

    # Creer le fichier ExportOptions.plist pour le developpement
    cat > "$BUILD_DIR/ExportOptions.plist" << EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>method</key>
    <string>development</string>
    <key>compileBitcode</key>
    <false/>
    <key>thinning</key>
    <string>&lt;none&gt;</string>
</dict>
</plist>
EOF

    xcodebuild -exportArchive \
        -archivePath "$ARCHIVE_PATH" \
        -exportOptionsPlist "$BUILD_DIR/ExportOptions.plist" \
        -exportPath "$EXPORT_PATH" \
        2>&1 | grep -E "(error:|warning:|EXPORT)"

    if [ -f "$EXPORT_PATH/$IPA_NAME" ]; then
        echo -e "${GREEN}  IPA exporte: $EXPORT_PATH/$IPA_NAME${NC}"
    else
        echo -e "${YELLOW}  Note: L'export standard a echoue. Creation manuelle de l'IPA...${NC}"
        create_ipa_manually
    fi
    echo ""
}

# Creation manuelle de l'IPA (methode alternative)
create_ipa_manually() {
    echo -e "${YELLOW}Creation manuelle de l'IPA...${NC}"

    APP_PATH="$ARCHIVE_PATH/Products/Applications/$PROJECT_NAME.app"

    if [ ! -d "$APP_PATH" ]; then
        echo -e "${RED}Erreur: Application non trouvee dans l'archive${NC}"
        exit 1
    fi

    mkdir -p "$EXPORT_PATH/Payload"
    cp -r "$APP_PATH" "$EXPORT_PATH/Payload/"

    cd "$EXPORT_PATH"
    zip -r "$IPA_NAME" Payload
    rm -rf Payload
    cd - > /dev/null

    if [ -f "$EXPORT_PATH/$IPA_NAME" ]; then
        echo -e "${GREEN}  IPA cree manuellement: $EXPORT_PATH/$IPA_NAME${NC}"
    else
        echo -e "${RED}Erreur: Impossible de creer l'IPA${NC}"
        exit 1
    fi
}

# Affichage des instructions AltStore
show_altstore_instructions() {
    echo -e "${GREEN}========================================${NC}"
    echo -e "${GREEN}  Installation via AltStore${NC}"
    echo -e "${GREEN}========================================${NC}"
    echo ""
    echo "Le fichier IPA est pret: $EXPORT_PATH/$IPA_NAME"
    echo ""
    echo "Pour installer sur votre iPhone/iPad:"
    echo ""
    echo "1. Assurez-vous qu'AltServer est en cours d'execution sur votre Mac/PC"
    echo "2. Connectez votre appareil iOS via USB ou Wi-Fi"
    echo "3. Ouvrez AltStore sur votre appareil"
    echo "4. Allez dans 'My Apps'"
    echo "5. Appuyez sur '+' en haut a gauche"
    echo "6. Selectionnez le fichier IPA: $EXPORT_PATH/$IPA_NAME"
    echo ""
    echo "Ou via AirDrop:"
    echo "1. Envoyez le fichier IPA via AirDrop vers votre appareil"
    echo "2. Ouvrez-le avec AltStore"
    echo ""
    echo -e "${YELLOW}Note: L'application devra etre resignee tous les 7 jours${NC}"
    echo -e "${YELLOW}      avec un compte Apple gratuit (ou 1 an avec Developer Program)${NC}"
    echo ""
}

# Fonction principale
main() {
    check_requirements
    clean_build
    archive_project
    export_ipa
    show_altstore_instructions

    echo -e "${GREEN}Build termine avec succes!${NC}"
}

# Execution
main "$@"
