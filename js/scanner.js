// QRScanner - Terminal (style générateur)
class QRScanner {
    // Pas de propriétés statiques ici
}

// Propriétés statiques (définies après la classe)
QRScanner.videoElement = null;
QRScanner.canvasElement = null;
QRScanner.canvasContext = null;
QRScanner.isScanning = false;
QRScanner.isStarting = false;
QRScanner.scanAnimation = null;
QRScanner.stream = null;
QRScanner.lastScanTime = 0;
QRScanner.scanCooldown = 1500;
QRScanner.elementsReady = false;
QRScanner.activeNotification = null;
QRScanner.app = null; // référence vers QRGuardianTerminal

// ===== INITIALISATION =====
QRScanner.init = function(appReference) {
    QRScanner.app = appReference;
    QRScanner.ensureElements();
};

// ===== CRÉATION DES ÉLÉMENTS DOM =====
QRScanner.ensureElements = function() {
    if (QRScanner.elementsReady) return true;

    let container = document.getElementById('scannerContainer');
    if (!container) {
        container = document.createElement('div');
        container.id = 'scannerContainer';
        container.className = 'scanner-container';
        const scanPage = document.getElementById('scanPage');
        if (scanPage) scanPage.appendChild(container);
        else document.body.appendChild(container);
    }

    if (!document.getElementById('scannerPlaceholder')) {
        const placeholder = document.createElement('div');
        placeholder.id = 'scannerPlaceholder';
        placeholder.className = 'scanner-placeholder';
        placeholder.innerHTML = QRScanner.getDefaultPlaceholderHTML();
        container.appendChild(placeholder);
    }

    let scannerView = document.getElementById('scannerView');
    if (!scannerView) {
        scannerView = document.createElement('div');
        scannerView.id = 'scannerView';
        scannerView.style.display = 'none';
        scannerView.style.position = 'relative';
        container.appendChild(scannerView);
    }

    if (!document.getElementById('scannerVideo')) {
        const video = document.createElement('video');
        video.id = 'scannerVideo';
        video.setAttribute('playsinline', '');
        video.style.cssText = 'width:100%; max-width:600px; border-radius:12px; background:#000; display:block; margin:0 auto;';
        scannerView.appendChild(video);
    }

    if (!scannerView.querySelector('.scan-frame')) {
        const frame = document.createElement('div');
        frame.className = 'scan-frame';
        ['tl', 'tr', 'bl', 'br'].forEach(pos => {
            const corner = document.createElement('div');
            corner.className = `corner ${pos}`;
            frame.appendChild(corner);
        });
        scannerView.appendChild(frame);
    }

    if (!document.getElementById('stopScanBtn')) {
        const stopBtn = document.createElement('button');
        stopBtn.id = 'stopScanBtn';
        stopBtn.className = 'btn btn-danger';
        stopBtn.innerHTML = '<i class="fas fa-stop"></i> Arrêter le scanner';
        stopBtn.style.display = 'none';
        scannerView.appendChild(stopBtn);
    }

    if (!document.getElementById('scanResultContainer')) {
        const resultContainer = document.createElement('div');
        resultContainer.id = 'scanResultContainer';
        resultContainer.style.display = 'none';
        resultContainer.style.marginTop = '20px';
        resultContainer.style.padding = '20px';
        resultContainer.style.background = '#0f172a';
        resultContainer.style.borderRadius = '10px';
        resultContainer.innerHTML = '<div id="scanResult"></div>';
        container.appendChild(resultContainer);
    }

    const startBtn = document.getElementById('startScanBtn');
    if (startBtn && !startBtn._listenerAttached) {
        startBtn.addEventListener('click', () => QRScanner.start());
        startBtn._listenerAttached = true;
    }
    const stopBtn = document.getElementById('stopScanBtn');
    if (stopBtn && !stopBtn._listenerAttached) {
        stopBtn.addEventListener('click', () => QRScanner.stop());
        stopBtn._listenerAttached = true;
    }
    const uploadBtn = document.getElementById('uploadScanBtn');
    if (uploadBtn && !uploadBtn._listenerAttached) {
        uploadBtn.addEventListener('click', () => QRScanner.triggerImageUpload());
        uploadBtn._listenerAttached = true;
    }

    QRScanner.elementsReady = true;
    return true;
};

QRScanner.getDefaultPlaceholderHTML = function() {
    return `
        <div style="text-align:center; padding:40px 20px;">
            <i class="fas fa-camera" style="font-size:48px; color:#4CAF50; margin-bottom:20px;"></i>
            <h3 style="margin:0 0 10px 0; color:white;">Scanner QR Code</h3>
            <p style="color:#aaa; margin-bottom:30px;">Positionnez le QR code dans le cadre</p>
            <button id="startScanBtn" class="btn btn-primary" style="padding:15px 40px;">
                <i class="fas fa-play"></i> Démarrer
            </button>
        </div>
    `;
};

// ===== DÉMARRAGE / ARRÊT =====
QRScanner.start = async function() {
    if (QRScanner.isStarting || QRScanner.isScanning) return;
    QRScanner.ensureElements();

    QRScanner.videoElement = document.getElementById('scannerVideo');
    if (!QRScanner.videoElement) return;

    QRScanner.isStarting = true;
    const scannerPlaceholder = document.getElementById('scannerPlaceholder');
    const scannerView = document.getElementById('scannerView');
    const startScanBtn = document.getElementById('startScanBtn');
    const stopScanBtn = document.getElementById('stopScanBtn');

    if (scannerPlaceholder) scannerPlaceholder.style.display = 'none';
    if (scannerView) scannerView.style.display = 'block';
    if (startScanBtn) startScanBtn.style.display = 'none';
    if (stopScanBtn) stopScanBtn.style.display = 'block';

    QRScanner.canvasElement = document.createElement('canvas');
    QRScanner.canvasContext = QRScanner.canvasElement.getContext('2d', { willReadFrequently: true });

    try {
        const constraints = { video: { facingMode: 'environment' }, audio: false };
        QRScanner.stream = await navigator.mediaDevices.getUserMedia(constraints);
        QRScanner.videoElement.srcObject = QRScanner.stream;
        await QRScanner.videoElement.play();
        QRScanner.isScanning = true;
        QRScanner.isStarting = false;
        QRScanner.startScanLoop();
    } catch (error) {
        console.error('❌ Erreur caméra:', error);
        QRScanner.stop();
        QRScanner.showCameraError(error.message);
    }
};

QRScanner.stop = function() {
    if (QRScanner.scanAnimation) cancelAnimationFrame(QRScanner.scanAnimation);
    if (QRScanner.stream) QRScanner.stream.getTracks().forEach(t => t.stop());
    if (QRScanner.videoElement) QRScanner.videoElement.srcObject = null;
    QRScanner.isScanning = false;
    QRScanner.isStarting = false;

    const scannerView = document.getElementById('scannerView');
    const startScanBtn = document.getElementById('startScanBtn');
    const stopScanBtn = document.getElementById('stopScanBtn');
    const placeholder = document.getElementById('scannerPlaceholder');

    if (scannerView) scannerView.style.display = 'none';
    if (startScanBtn) startScanBtn.style.display = 'block';
    if (stopScanBtn) stopScanBtn.style.display = 'none';
    if (placeholder) placeholder.style.display = 'block';
};

QRScanner.startScanLoop = function() {
    const scanFrame = () => {
        if (!QRScanner.isScanning || !QRScanner.videoElement || !QRScanner.canvasContext) {
            QRScanner.scanAnimation = null;
            return;
        }
        try {
            if (QRScanner.videoElement.readyState !== 4) {
                QRScanner.scanAnimation = requestAnimationFrame(scanFrame);
                return;
            }
            const w = QRScanner.videoElement.videoWidth;
            const h = QRScanner.videoElement.videoHeight;
            QRScanner.canvasElement.width = w;
            QRScanner.canvasElement.height = h;
            QRScanner.canvasContext.drawImage(QRScanner.videoElement, 0, 0, w, h);
            const imageData = QRScanner.canvasContext.getImageData(0, 0, w, h);
            const code = jsQR(imageData.data, w, h, { inversionAttempts: 'both' });
            if (code) {
                const now = Date.now();
                if (now - QRScanner.lastScanTime > QRScanner.scanCooldown) {
                    QRScanner.lastScanTime = now;
                    QRScanner.processScannedCode(code.data);
                }
            }
        } catch (e) { 
            console.error('Erreur scan:', e); 
        }
        QRScanner.scanAnimation = requestAnimationFrame(scanFrame);
    };
    QRScanner.scanAnimation = requestAnimationFrame(scanFrame);
};

// ========== FONCTIONS DE CHIFFREMENT/DÉCHIFFREMENT ==========
// Doit correspondre à la méthode encryptCode du générateur
QRScanner.decryptCode = function(encryptedBase64) {
    const key = "QRGuardianKey2025";
    try {
        const encrypted = atob(encryptedBase64);
        let result = "";
        for (let i = 0; i < encrypted.length; i++) {
            const charCode = encrypted.charCodeAt(i) ^ key.charCodeAt(i % key.length);
            result += String.fromCharCode(charCode);
        }
        return result;
    } catch (e) {
        console.error('Erreur déchiffrement:', e);
        return null;
    }
};

// ========== TRAITEMENT DES CODES ==========
QRScanner.processScannedCode = async function(data) {
    QRScanner.stop();

    try {
        let parsed;
        try {
            parsed = JSON.parse(data);
        } catch {
            parsed = null;
        }

        if (parsed && parsed.type === 'QRGUARDIAN_CONNECTION' && parsed.code) {
            QRScanner.handleConnectionQR(parsed);
            return;
        }

        await QRScanner.processNormalQR(data);
    } catch (error) {
        console.error('❌ Erreur traitement:', error);
        if (QRScanner.app && typeof QRScanner.app.showNotification === 'function') {
            QRScanner.app.showNotification('Erreur', 'QR code invalide', 'error');
        }
    }
};

// ----- QR de connexion -----
QRScanner.handleConnectionQR = function(connectionData) {
    let code = connectionData.code;
    // Si le QR est chiffré (champ encrypted présent et true), on déchiffre
    if (connectionData.encrypted) {
        const decrypted = QRScanner.decryptCode(code);
        if (!decrypted) {
            QRScanner.app?.showNotification('Erreur', 'Code de connexion invalide (chiffrement)', 'error');
            return;
        }
        code = decrypted;
    }
    const masked = code.substring(0, 12) + '…' + code.slice(-4);

    const notif = document.createElement('div');
    notif.className = 'notification connection';
    notif.innerHTML = `
        <div class="notification-header">
            <i class="fas fa-link"></i>
            <h4>QR de connexion détecté</h4>
        </div>
        <p>Code secret : <span class="code-masked">${masked}</span></p>
        <button id="useCodeBtn" class="btn btn-primary btn-sm">
            <i class="fas fa-check"></i> Utiliser ce code
        </button>
        <button id="ignoreBtn" class="btn btn-secondary btn-sm" style="margin-left:0.5rem;">
            Ignorer
        </button>
    `;
    document.body.appendChild(notif);
    setTimeout(() => notif.classList.add('show'), 10);

    const useBtn = notif.querySelector('#useCodeBtn');
    const ignoreBtn = notif.querySelector('#ignoreBtn');

    useBtn.addEventListener('click', async () => {
        useBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Enregistrement...';
        useBtn.disabled = true;
        ignoreBtn.disabled = true;
        try {
            if (QRScanner.app && typeof QRScanner.app.storeSecurityCode === 'function') {
                await QRScanner.app.storeSecurityCode(code);
                await Database.saveConnectionScan(connectionData);
                QRScanner.app.showNotification('Code secret mis à jour', 'Le terminal est maintenant synchronisé.', 'success');
            }
            notif.remove();
        } catch (error) {
            useBtn.innerHTML = '<i class="fas fa-check"></i> Utiliser ce code';
            useBtn.disabled = false;
            ignoreBtn.disabled = false;
            QRScanner.app?.showNotification('Erreur', 'Échec de l\'enregistrement', 'error');
        }
    });

    ignoreBtn.addEventListener('click', () => notif.remove());
};

// ----- QR normal -----
QRScanner.processNormalQR = async function(data) {
    let qrData;
    let formatType = 'text';
    let expiryTimestamp = null;

    if (data.startsWith('https://qrguardian.app/e?')) {
        try {
            const url = new URL(data);
            const params = new URLSearchParams(url.search);
            qrData = {
                n: params.get('n') || '',
                p: params.get('p') || '',
                l: params.get('l') || '',
                ts: params.get('ts'),
                id: params.get('id') || '',
                sc: params.get('sc') || '',
                exp: params.get('exp') ? parseInt(params.get('exp'), 10) : null // <-- Ajout de la date d'expiration
            };
            formatType = 'url';
            expiryTimestamp = qrData.exp;
        } catch { 
            qrData = { n: 'QR Code', data }; 
        }
    } else {
        try {
            qrData = JSON.parse(data);
            formatType = 'json';
            // Si le JSON contient un champ "exp", le récupérer
            if (qrData.exp && typeof qrData.exp === 'number') {
                expiryTimestamp = qrData.exp;
            }
        } catch {
            qrData = { n: 'QR Code Texte', data };
            formatType = 'text';
        }
    }

    const eventName = qrData.n || qrData.eventName || 'QR Code';
    const price = qrData.p || qrData.price || '';
    const location = qrData.l || qrData.location || '';
    const securityCode = qrData.sc || qrData.securityCode;
    const eventId = qrData.id || qrData.eventId || '';

    const expectedCode = QRScanner.app ? QRScanner.app.UNIQUE_SECURITY_CODE : null;

    let securityCheck = { valid: false, message: '' };
    let isValid = false;
    let isDuplicate = false;
    let isExpired = false;

    // Vérification de l'expiration
    if (expiryTimestamp) {
        const now = Date.now();
        if (now > expiryTimestamp) {
            isExpired = true;
            securityCheck = { valid: false, message: 'QR code expiré' };
            isValid = false;
        }
    }

    // Si pas encore invalide à cause de l'expiration, on vérifie le code secret
    if (!isExpired) {
        if (!expectedCode) {
            securityCheck = { valid: false, message: 'Aucun code secret configuré' };
            isValid = false;
        } else if (!securityCode) {
            securityCheck = { valid: false, message: 'QR code non sécurisé' };
            isValid = false;
        } else if (securityCode !== expectedCode) {
            securityCheck = { valid: false, message: 'CODE SECRET INVALIDE - FRAUDE' };
            isValid = false;
        } else {
            if (eventId) {
                const exists = await Database.checkIfEventIdExists(eventId);
                if (exists) {
                    isDuplicate = true;
                    securityCheck = { valid: false, message: 'DOUBLON - Déjà utilisé' };
                    isValid = false;
                } else {
                    securityCheck = { valid: true, message: 'QR code authentique' };
                    isValid = true;
                }
            } else {
                securityCheck = { valid: true, message: 'QR code authentique' };
                isValid = true;
            }
        }
    }

    // Ajouter l'expiration au scanRecord pour l'affichage
    const scanRecord = {
        eventName, price, location,
        valid: isValid,
        securityCode, eventId,
        securityCheck,
        isDuplicate,
        format: formatType,
        rawData: data.substring(0, 200),
        expiry: expiryTimestamp // <-- stocker pour affichage
    };

    await Database.saveScan(scanRecord);
    QRScanner.displayScanResult(scanRecord, isValid, isDuplicate, isExpired);
};

// ===== AFFICHAGE DU RÉSULTAT =====
QRScanner.displayScanResult = function(scanRecord, isValid, isDuplicate = false, isExpired = false) {
    const resultContainer = document.getElementById('scanResultContainer');
    const resultElement = document.getElementById('scanResult');
    if (!resultContainer || !resultElement) return;
    resultContainer.style.display = 'block';

    let html = '';
    if (isDuplicate) html = QRScanner.createDuplicateResultHTML(scanRecord);
    else if (!isValid) html = QRScanner.createInvalidResultHTML(scanRecord, isExpired);
    else html = QRScanner.createValidResultHTML(scanRecord);

    resultElement.innerHTML = html;
    resultContainer.scrollIntoView({ behavior: 'smooth' });

    const scanAgainBtn = document.getElementById('scanAgainBtn');
    if (scanAgainBtn) {
        scanAgainBtn.onclick = () => {
            resultContainer.style.display = 'none';
            QRScanner.start();
        };
    }
};

QRScanner.createValidResultHTML = function(scanRecord) {
    const expiryDate = scanRecord.expiry ? new Date(scanRecord.expiry).toLocaleString() : null;
    return `
        <div class="scan-result-card">
            <div class="scan-result-header valid">
                <i class="fas fa-check-circle"></i>
                <h3>QR CODE VALIDE</h3>
            </div>
            <div class="security-banner">
                <i class="fas fa-shield-alt"></i>
                <span style="color:#10b981;">${scanRecord.securityCheck?.message || 'Authentique'}</span>
            </div>
            <div class="result-field"><label><i class="fas fa-calendar"></i> Événement</label><span>${scanRecord.eventName || '—'}</span></div>
            <div class="result-field"><label><i class="fas fa-tag"></i> Prix</label><span>${scanRecord.price || 'Gratuit'}</span></div>
            <div class="result-field"><label><i class="fas fa-map-marker"></i> Lieu</label><span>${scanRecord.location || '—'}</span></div>
            <div class="result-field"><label><i class="fas fa-id-card"></i> ID</label><span style="font-family:monospace;">${scanRecord.eventId || '—'}</span></div>
            ${expiryDate ? `<div class="result-field"><label><i class="fas fa-hourglass-end"></i> Expire le</label><span>${expiryDate}</span></div>` : ''}
            <div class="result-field"><label><i class="fas fa-clock"></i> Scanné le</label><span>${new Date(scanRecord.timestamp).toLocaleString()}</span></div>
            <div style="margin-top:1.5rem; text-align:center;">
                <button id="scanAgainBtn" class="btn btn-primary"><i class="fas fa-camera"></i> Scanner un autre</button>
            </div>
        </div>
    `;
};

QRScanner.createInvalidResultHTML = function(scanRecord, isExpired = false) {
    let title, iconClass, color, message;
    if (isExpired) {
        title = 'QR CODE EXPIRÉ';
        iconClass = 'fa-hourglass-end';
        color = '#f59e0b';
        message = 'Ce QR code a dépassé sa date de validité.';
    } else {
        title = 'QR CODE INVALIDE';
        iconClass = 'fa-times-circle';
        color = '#ef4444';
        message = scanRecord.securityCheck?.message || 'Fraude détectée';
    }

    return `
        <div class="scan-result-card">
            <div class="scan-result-header invalid">
                <i class="fas ${iconClass}"></i>
                <h3>${title}</h3>
            </div>
            <div style="background:rgba(${isExpired ? '245,158,11' : '239,68,68'},0.1); border:1px solid rgba(${isExpired ? '245,158,11' : '239,68,68'},0.3); border-radius:var(--radius-md); padding:1rem; margin-bottom:1.5rem; text-align:center;">
                <i class="fas ${iconClass}" style="color:${color}; font-size:2rem; margin-bottom:0.5rem;"></i>
                <h4 style="color:${color};">${message}</h4>
            </div>
            <div class="result-field"><label><i class="fas fa-calendar"></i> Événement</label><span>${scanRecord.eventName || '—'}</span></div>
            ${scanRecord.location ? `<div class="result-field"><label><i class="fas fa-map-marker"></i> Lieu</label><span>${scanRecord.location}</span></div>` : ''}
            <div class="result-field"><label><i class="fas fa-shield-alt"></i> Code reçu</label><span style="font-family:monospace;">${scanRecord.securityCode || 'Aucun'}</span></div>
            ${scanRecord.expiry ? `<div class="result-field"><label><i class="fas fa-hourglass-end"></i> Expire le</label><span>${new Date(scanRecord.expiry).toLocaleString()}</span></div>` : ''}
            <div style="margin-top:1.5rem; text-align:center;">
                <button id="scanAgainBtn" class="btn btn-primary"><i class="fas fa-camera"></i> Scanner un autre</button>
            </div>
        </div>
    `;
};

QRScanner.createDuplicateResultHTML = function(scanRecord) {
    return `
        <div class="scan-result-card">
            <div class="scan-result-header duplicate">
                <i class="fas fa-exclamation-triangle"></i>
                <h3>DOUBLON DÉTECTÉ</h3>
            </div>
            <div style="background:rgba(245,158,11,0.1); border:1px solid rgba(245,158,11,0.3); border-radius:var(--radius-md); padding:1.5rem; margin-bottom:1.5rem; text-align:center;">
                <i class="fas fa-copy" style="color:#f59e0b; font-size:2rem; margin-bottom:0.5rem;"></i>
                <h4 style="color:#f59e0b;">Ce QR code a déjà été scanné</h4>
            </div>
            <div class="result-field"><label><i class="fas fa-calendar"></i> Événement</label><span>${scanRecord.eventName || '—'}</span></div>
            ${scanRecord.expiry ? `<div class="result-field"><label><i class="fas fa-hourglass-end"></i> Expire le</label><span>${new Date(scanRecord.expiry).toLocaleString()}</span></div>` : ''}
            <div style="margin-top:1.5rem; text-align:center;">
                <button id="scanAgainBtn" class="btn btn-primary"><i class="fas fa-camera"></i> Scanner un autre</button>
            </div>
        </div>
    `;
};

// ===== GESTION DES ERREURS CAMÉRA =====
QRScanner.showCameraError = function(message) {
    const placeholder = document.getElementById('scannerPlaceholder');
    if (placeholder) {
        placeholder.innerHTML = `
            <i class="fas fa-exclamation-triangle" style="color:#ef4444;"></i>
            <h3 style="color:#ef4444;">Erreur caméra</h3>
            <p style="color:#aaa;">${message}</p>
            <button id="retryBtn" class="btn btn-primary" style="margin-top:1.5rem;">
                <i class="fas fa-redo"></i> Réessayer
            </button>
        `;
        const retryBtn = document.getElementById('retryBtn');
        if (retryBtn) retryBtn.addEventListener('click', () => QRScanner.start());
    }
};

// ===== SCAN DEPUIS UNE IMAGE =====
QRScanner.triggerImageUpload = function() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const img = new Image();
        img.src = URL.createObjectURL(file);
        img.onload = () => {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            canvas.width = img.width;
            canvas.height = img.height;
            ctx.drawImage(img, 0, 0);
            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const code = jsQR(imageData.data, canvas.width, canvas.height);
            if (code) QRScanner.processScannedCode(code.data);
            else QRScanner.app?.showNotification('Aucun QR code', 'Aucun QR code détecté dans l\'image', 'error');
            URL.revokeObjectURL(img.src);
        };
    };
    input.click();
};

// Exposition globale
if (typeof window !== 'undefined') window.QRScanner = QRScanner;