// Générateur de QR codes avec signature et options avancées
class QRCodeGenerator {
    static DEFAULT_OPTIONS = {
        width: 300,
        height: 300,
        colorDark: '#000000',
        colorLight: '#ffffff',
        correctLevel: 'H' // Changer QRCode.CorrectLevel.H par 'H'
    };

    static async generateSingle(data, options = {}) {
        return new Promise((resolve, reject) => {
            try {
                const canvas = document.createElement('canvas');
                const mergedOptions = { 
                    ...this.DEFAULT_OPTIONS, 
                    ...options,
                    // Convertir les options pour la bibliothèque QRCode
                    color: {
                        dark: options.colorDark || this.DEFAULT_OPTIONS.colorDark,
                        light: options.colorLight || this.DEFAULT_OPTIONS.colorLight
                    }
                };
                
                // Vérifier si QRCode est disponible
                if (typeof QRCode === 'undefined') {
                    reject(new Error('Bibliothèque QRCode non chargée'));
                    return;
                }
                
                // Utiliser une configuration différente pour la bibliothèque QRCode
                const qrOptions = {
                    errorCorrectionLevel: mergedOptions.correctLevel,
                    margin: 1,
                    width: mergedOptions.width,
                    color: mergedOptions.color
                };
                
                QRCode.toCanvas(canvas, data, qrOptions, (error) => {
                    if (error) {
                        reject(error);
                        return;
                    }
                    
                    if (options.logo) {
                        this.addLogo(canvas, options.logo).then(resolve).catch(reject);
                    } else {
                        resolve(canvas);
                    }
                });
            } catch (error) {
                reject(error);
            }
        });
    }

    static async generateBatch(config) {
        const {
            eventName,
            eventDate,
            eventDetails,
            quantity,
            color,
            logo,
            privateKey
        } = config;

        const qrCodes = [];
        
        for (let i = 0; i < quantity; i++) {
            try {
                // Créer les données uniques pour chaque QR code
                const qrData = {
                    eventId: this.generateEventId(),
                    eventName,
                    eventDate,
                    eventDetails,
                    serialNumber: i + 1,
                    totalQuantity: quantity,
                    timestamp: new Date().toISOString()
                };

                // Signer les données
                const signature = await Signature.signData(qrData, privateKey);
                
                // Ajouter la signature aux données
                const signedData = {
                    ...qrData,
                    signature,
                    version: '1.0'
                };

                // Générer le QR code
                const canvas = await this.generateSingle(JSON.stringify(signedData), {
                    colorDark: color,
                    logo: logo
                });

                qrCodes.push({
                    canvas,
                    data: signedData,
                    index: i
                });

                // Pas de progression pour l'instant
                // Nous ajouterons cette fonctionnalité plus tard

            } catch (error) {
                console.error(`Erreur génération QR code ${i + 1}:`, error);
                throw error;
            }
        }

        return qrCodes;
    }

    // ... reste du code inchangé ...
}