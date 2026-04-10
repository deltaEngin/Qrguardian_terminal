// QRScanner - Terminal (style générateur) avec gestion des dates et améliorations
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
QRScanner.flashOn = false;
QRScanner.currentZoom = 1.0;
QRScanner.zoomCapabilities = null;
QRScanner.audioContext = null;

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

    // Ajout des contrôles flash et zoom
    if (!document.getElementById('scannerControls')) {
        const controls = document.createElement('div');
        controls.id = 'scannerControls';
        controls.className = 'scanner-controls';
        controls.innerHTML = `
            <button id="flashBtn" class="btn-icon" title="Activer/désactiver flash" disabled><i class="bi bi-lightning-charge"></i></button>
            <div class="zoom-controls">
                <button id="zoomOutBtn" class="btn-icon" title="Zoom arrière" disabled><i class="bi bi-zoom-out"></i></button>
                <span id="zoomLevel">1.0x</span>
                <button id="zoomInBtn" class="btn-icon" title="Zoom avant" disabled><i class="bi bi-zoom-in"></i></button>
            </div>
        `;
        scannerView.appendChild(controls);
    }

    if (!document.getElementById('stopScanBtn')) {
        const stopBtn = document.createElement('button');
        stopBtn.id = 'stopScanBtn';
        stopBtn.className = 'btn btn-danger';
        stopBtn.innerHTML = '<i class="bi bi-stop-fill"></i> Arrêter le scanner';
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

    // Attacher les événements pour flash et zoom
    const flashBtn = document.getElementById('flashBtn');
    if (flashBtn && !flashBtn._listenerAttached) {
        flashBtn.addEventListener('click', () => QRScanner.toggleFlash());
        flashBtn._listenerAttached = true;
    }
    const zoomInBtn = document.getElementById('zoomInBtn');
    if (zoomInBtn && !zoomInBtn._listenerAttached) {
        zoomInBtn.addEventListener('click', () => QRScanner.zoomIn());
        zoomInBtn._listenerAttached = true;
    }
    const zoomOutBtn = document.getElementById('zoomOutBtn');
    if (zoomOutBtn && !zoomOutBtn._listenerAttached) {
        zoomOutBtn.addEventListener('click', () => QRScanner.zoomOut());
        zoomOutBtn._listenerAttached = true;
    }

    QRScanner.elementsReady = true;
    return true;
};

QRScanner.getDefaultPlaceholderHTML = function() {
    return `
        <div style="text-align:center; padding:40px 20px;">
            <i class="bi bi-camera" style="font-size:48px; color:#4CAF50; margin-bottom:20px;"></i>
            <h3 style="margin:0 0 10px 0; color:white;">Scanner QR Code</h3>
            <p style="color:#aaa; margin-bottom:30px;">Positionnez le QR code dans le cadre</p>
            <button id="startScanBtn" class="btn btn-primary" style="padding:15px 40px;">
                <i class="bi bi-play-fill"></i> Démarrer
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
    const flashBtn = document.getElementById('flashBtn');
    const zoomInBtn = document.getElementById('zoomInBtn');
    const zoomOutBtn = document.getElementById('zoomOutBtn');

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

        // Activer les contrôles si supportés
        const track = QRScanner.stream.getVideoTracks()[0];
        const capabilities = track.getCapabilities && track.getCapabilities();
        if (capabilities) {
            if (capabilities.torch) {
                if (flashBtn) flashBtn.disabled = false;
            }
            if (capabilities.zoom) {
                QRScanner.zoomCapabilities = capabilities.zoom;
                QRScanner.currentZoom = capabilities.zoom.min || 1.0;
                if (zoomInBtn) zoomInBtn.disabled = false;
                if (zoomOutBtn) zoomOutBtn.disabled = false;
                QRScanner.updateZoomDisplay();
            }
        }

        QRScanner.startScanLoop();
    } catch (error) {
        console.error('❌ Erreur caméra:', error);
        QRScanner.stop();
        QRScanner.showCameraError(error.message);
    }
};

QRScanner.stop = function() {
    if (QRScanner.scanAnimation) cancelAnimationFrame(QRScanner.scanAnimation);
    if (QRScanner.stream) {
        // Éteindre le flash si allumé
        if (QRScanner.flashOn) QRScanner.toggleFlash(false);
        QRScanner.stream.getTracks().forEach(t => t.stop());
    }
    if (QRScanner.videoElement) QRScanner.videoElement.srcObject = null;
    QRScanner.isScanning = false;
    QRScanner.isStarting = false;
    QRScanner.flashOn = false;

    const scannerView = document.getElementById('scannerView');
    const startScanBtn = document.getElementById('startScanBtn');
    const stopScanBtn = document.getElementById('stopScanBtn');
    const placeholder = document.getElementById('scannerPlaceholder');
    const flashBtn = document.getElementById('flashBtn');
    const zoomInBtn = document.getElementById('zoomInBtn');
    const zoomOutBtn = document.getElementById('zoomOutBtn');

    if (scannerView) scannerView.style.display = 'none';
    if (startScanBtn) startScanBtn.style.display = 'block';
    if (stopScanBtn) stopScanBtn.style.display = 'none';
    if (placeholder) placeholder.style.display = 'block';
    if (flashBtn) flashBtn.disabled = true;
    if (zoomInBtn) zoomInBtn.disabled = true;
    if (zoomOutBtn) zoomOutBtn.disabled = true;

    // Réinitialiser l'affichage du zoom
    const zoomLevel = document.getElementById('zoomLevel');
    if (zoomLevel) zoomLevel.textContent = '1.0x';
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

// ===== RETOURS SENSORIELS =====
QRScanner.playBeep = function() {
    try {
        if (!QRScanner.audioContext) {
            QRScanner.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        }
        if (QRScanner.audioContext.state === 'suspended') {
            QRScanner.audioContext.resume();
        }
        const osc = QRScanner.audioContext.createOscillator();
        const gain = QRScanner.audioContext.createGain();
        osc.connect(gain);
        gain.connect(QRScanner.audioContext.destination);
        osc.frequency.value = 800;
        gain.gain.value = 0.1;
        osc.start();
        osc.stop(QRScanner.audioContext.currentTime + 0.1);
    } catch (e) {
        console.warn('Beep non supporté', e);
    }
};

QRScanner.vibrate = function() {
    if (navigator.vibrate) {
        navigator.vibrate(200);
    }
};

// ===== GESTION FLASH =====
QRScanner.toggleFlash = function(force) {
    if (!QRScanner.stream) return;
    const track = QRScanner.stream.getVideoTracks()[0];
    if (!track) return;
    const capabilities = track.getCapabilities && track.getCapabilities();
    if (!capabilities || !capabilities.torch) return;

    QRScanner.flashOn = force !== undefined ? force : !QRScanner.flashOn;
    track.applyConstraints({
        advanced: [{ torch: QRScanner.flashOn }]
    }).catch(e => console.warn('Flash non supporté', e));

    const flashBtn = document.getElementById('flashBtn');
    if (flashBtn) {
        flashBtn.classList.toggle('active', QRScanner.flashOn);
    }
};

// ===== GESTION ZOOM =====
QRScanner.zoomIn = function() {
    QRScanner.adjustZoom(0.2);
};

QRScanner.zoomOut = function() {
    QRScanner.adjustZoom(-0.2);
};

QRScanner.adjustZoom = function(delta) {
    if (!QRScanner.stream || !QRScanner.zoomCapabilities) return;
    const track = QRScanner.stream.getVideoTracks()[0];
    if (!track) return;
    const min = QRScanner.zoomCapabilities.min || 1.0;
    const max = QRScanner.zoomCapabilities.max || 1.0;
    let newZoom = QRScanner.currentZoom + delta;
    newZoom = Math.max(min, Math.min(max, newZoom));
    if (newZoom === QRScanner.currentZoom) return;
    QRScanner.currentZoom = newZoom;
    track.applyConstraints({
        advanced: [{ zoom: QRScanner.currentZoom }]
    }).catch(e => console.warn('Zoom non supporté', e));
    QRScanner.updateZoomDisplay();
};

QRScanner.updateZoomDisplay = function() {
    const zoomSpan = document.getElementById('zoomLevel');
    if (zoomSpan) zoomSpan.textContent = QRScanner.currentZoom.toFixed(1) + 'x';
};

// ===== TRAITEMENT DES CODES =====
QRScanner.processScannedCode = async function(data) {
    QRScanner.stop();

    // Retour sensoriel immédiat
    QRScanner.playBeep();
    QRScanner.vibrate();

    // Flash visuel (animation)
    const frame = document.querySelector('.scan-frame');
    if (frame) {
        frame.classList.add('scan-flash');
        setTimeout(() => frame.classList.remove('scan-flash'), 300);
    }

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
            <i class="bi bi-link"></i>
            <h4>QR de connexion détecté</h4>
        </div>
        <p>Code secret : <span class="code-masked">${masked}</span></p>
        <button id="useCodeBtn" class="btn btn-primary btn-sm">
            <i class="bi bi-check"></i> Utiliser ce code
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
        useBtn.innerHTML = '<i class="bi bi-arrow-repeat"></i> Enregistrement...';
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
            useBtn.innerHTML = '<i class="bi bi-check"></i> Utiliser ce code';
            useBtn.disabled = false;
            ignoreBtn.disabled = false;
            QRScanner.app?.showNotification('Erreur', 'Échec de l\'enregistrement', 'error');
        }
    });

    ignoreBtn.addEventListener('click', () => notif.remove());
};

// ----- QR normal avec gestion des dates -----
QRScanner.processNormalQR = async function(data) {
    let qrData;
    let formatType = 'text';
    let startTimestamp = null;
    let endTimestamp = null;
    let qrType = 'standard';

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
                start: params.get('start') ? parseInt(params.get('start'), 10) : null,
                end: params.get('end') ? parseInt(params.get('end'), 10) : null,
                s: params.get('s') || params.get('type') || 'standard'
            };
            formatType = 'url';
            startTimestamp = qrData.start;
            endTimestamp = qrData.end;
            qrType = qrData.s;
        } catch { 
            qrData = { n: 'QR Code', data }; 
        }
    } else {
        try {
            qrData = JSON.parse(data);
            formatType = 'json';
            startTimestamp = qrData.start ? parseInt(qrData.start, 10) : null;
            endTimestamp = qrData.end ? parseInt(qrData.end, 10) : null;
            qrType = qrData.s || qrData.type || 'standard';
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
    let isNotYetValid = false;

    // 1. Vérification du code secret
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
        // Code secret OK, on vérifie la période de validité
        const now = Date.now();

        if (startTimestamp && now < startTimestamp) {
            isNotYetValid = true;
            securityCheck = { valid: false, message: 'QR code pas encore valide' };
            isValid = false;
        } else if (endTimestamp && now > endTimestamp) {
            isExpired = true;
            securityCheck = { valid: false, message: 'QR code expiré' };
            isValid = false;
        } else {
            // Période OK, on vérifie les doublons
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

    const scanRecord = {
        eventName, price, location,
        valid: isValid,
        securityCode, eventId,
        securityCheck,
        isDuplicate,
        isExpired,
        isNotYetValid,
        format: formatType,
        rawData: data.substring(0, 200),
        validityStart: startTimestamp,
        validityEnd: endTimestamp,
        timestamp: new Date().toISOString(),
        qrType: qrType
    };

    await Database.saveScan(scanRecord);
    QRScanner.displayScanResult(scanRecord, isValid, isDuplicate, isExpired, isNotYetValid);
};

// ===== AFFICHAGE DES RÉSULTATS DANS UN MODAL =====
QRScanner.displayScanResult = function(scanRecord, isValid, isDuplicate, isExpired, isNotYetValid) {
    // Masquer l'ancien conteneur s'il existe
    const resultContainer = document.getElementById('scanResultContainer');
    if (resultContainer) resultContainer.style.display = 'none';

    if (isValid && !isDuplicate && !isExpired && !isNotYetValid) {
        QRScanner.showModal('success', {
            title: 'QR CODE VALIDE',
            icon: 'bi-check-circle-fill',
            fields: [
                { label: 'ID', value: scanRecord.eventId || '—', monospace: true },
                { label: 'Scannée le', value: new Date(scanRecord.timestamp).toLocaleString() },
                { label: 'Montant', value: (scanRecord.price && scanRecord.price !== '0') ? scanRecord.price : 'Gratuit', highlight: true }
            ]
        });
    } else if (isDuplicate) {
        QRScanner.showModal('warning', {
            title: 'DOUBLON DÉTECTÉ',
            icon: 'bi-exclamation-triangle-fill',
            fields: [
                { label: 'Événement', value: scanRecord.eventName || '—' },
                { label: 'ID', value: scanRecord.eventId || '—' },
                { label: 'Scanné le', value: new Date(scanRecord.timestamp).toLocaleString() },
                { label: 'Expire le', value: scanRecord.validityEnd ? new Date(scanRecord.validityEnd).toLocaleString() : 'Non défini' }
            ],
            message: 'Ce QR code a déjà été scanné.'
        });
    } else if (isExpired) {
        QRScanner.showModal('error', {
            title: 'QR CODE EXPIRÉ',
            icon: 'bi-hourglass-bottom',
            fields: [
                { label: 'Événement', value: scanRecord.eventName || '—' },
                { label: 'Expirait le', value: scanRecord.validityEnd ? new Date(scanRecord.validityEnd).toLocaleString() : 'Date inconnue' }
            ],
            message: 'Ce QR code a dépassé sa date de validité.'
        });
    } else if (isNotYetValid) {
        QRScanner.showModal('info', {
            title: 'QR CODE PAS ENCORE VALIDE',
            icon: 'bi-hourglass-split',
            fields: [
                { label: 'Événement', value: scanRecord.eventName || '—' },
                { label: 'Devient valide le', value: scanRecord.validityStart ? new Date(scanRecord.validityStart).toLocaleString() : 'Date inconnue' }
            ],
            message: 'Ce QR code n\'est pas encore valide.'
        });
    } else {
        // Cas invalide (code secret incorrect ou autre)
        QRScanner.showModal('error', {
            title: 'QR CODE INVALIDE',
            icon: 'bi-x-circle-fill',
            fields: [
                { label: 'Événement', value: scanRecord.eventName || '—' },
                { label: 'Code reçu', value: scanRecord.securityCode || 'Aucun', monospace: true },
                ...(scanRecord.location ? [{ label: 'Lieu', value: scanRecord.location }] : [])
            ],
            message: scanRecord.securityCheck?.message || 'Fraude détectée'
        });
    }
};

// ===== MODAL GÉNÉRIQUE (fluide, sans animations lourdes) =====
QRScanner.showModal = function(type, data) {
    // Définir les couleurs selon le type
    const colors = {
        success: { bg: 'linear-gradient(135deg, #10b981 0%, #059669 100%)', iconColor: '#fff' },
        error: { bg: 'linear-gradient(135deg, #ef4444 0%, #b91c1c 100%)', iconColor: '#fff' },
        warning: { bg: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)', iconColor: '#fff' },
        info: { bg: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)', iconColor: '#fff' }
    };
    const style = colors[type] || colors.error;

    // Créer l'overlay
    const overlay = document.createElement('div');
    overlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0,0,0,0.6);
        backdrop-filter: blur(4px);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 10000;
    `;

    const modal = document.createElement('div');
    modal.style.cssText = `
        background: ${style.bg};
        border-radius: 28px;
        width: 90%;
        max-width: 400px;
        color: white;
        font-family: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
        box-shadow: 0 20px 35px -8px rgba(0,0,0,0.3);
    `;

    // Construction du contenu
    let fieldsHtml = '';
    if (data.fields) {
        fieldsHtml = '<div style="background: rgba(255,255,255,0.15); backdrop-filter: blur(4px); border-radius: 24px; margin: 1rem 0; padding: 0.5rem 1rem;">';
        data.fields.forEach(field => {
            const valueStyle = field.monospace ? 'font-family: monospace; background: rgba(0,0,0,0.3); padding: 4px 10px; border-radius: 30px;' : '';
            const highlightStyle = field.highlight ? 'background: #fbbf24; color: #1e293b; padding: 4px 12px; border-radius: 30px; font-weight: 700;' : '';
            fieldsHtml += `
                <div style="display: flex; justify-content: space-between; border-bottom: 1px solid rgba(255,255,255,0.2); padding: 12px 0;">
                    <label style="font-weight: 600; opacity: 0.9;"><i class="bi ${field.icon || 'bi-info-circle'}" style="margin-right: 8px;"></i> ${field.label}</label>
                    <span style="${valueStyle} ${highlightStyle}">${field.value}</span>
                </div>
            `;
        });
        fieldsHtml += '</div>';
    }

    const messageHtml = data.message ? `<div style="text-align: center; margin: 0.5rem 0; font-size: 0.9rem; opacity: 0.9;">${data.message}</div>` : '';

    modal.innerHTML = `
        <div style="padding: 1.5rem 1.5rem 1rem;">
            <div style="display: flex; justify-content: flex-end;">
                <button class="modal-close-btn" style="background: rgba(255,255,255,0.2); border: none; border-radius: 40px; width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; cursor: pointer; color: white; font-size: 1.2rem;">✕</button>
            </div>
            <div style="text-align: center; margin-top: -0.5rem;">
                <div style="display: inline-flex; align-items: center; justify-content: center; width: 70px; height: 70px; background: rgba(255,255,255,0.2); border-radius: 50%; margin-bottom: 0.5rem;">
                    <i class="bi ${data.icon}" style="font-size: 42px; color: ${style.iconColor}; filter: drop-shadow(0 2px 4px rgba(0,0,0,0.2));"></i>
                </div>
                <h3 style="margin: 0; font-weight: 700; letter-spacing: 0.5px;">${data.title}</h3>
                <div style="width: 60px; height: 3px; background: rgba(255,255,255,0.5); margin: 10px auto 0; border-radius: 3px;"></div>
            </div>
            ${fieldsHtml}
            ${messageHtml}
            <div style="text-align: center; margin: 1rem 0 0.5rem;">
                <button class="modal-scan-again-btn" style="background: white; color: #1e293b; border: none; padding: 10px 28px; border-radius: 40px; font-weight: 700; cursor: pointer; box-shadow: 0 4px 10px rgba(0,0,0,0.1);">Scanner un autre</button>
            </div>
        </div>
    `;

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    const closeModal = () => {
        overlay.remove();
        QRScanner.start();
    };

    overlay.querySelector('.modal-close-btn').addEventListener('click', closeModal);
    overlay.querySelector('.modal-scan-again-btn').addEventListener('click', closeModal);
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) closeModal();
    });
};

// Les anciennes fonctions de création HTML sont conservées (non utilisées) pour éviter des erreurs si elles sont appelées ailleurs
QRScanner.createValidResultHTML = function(scanRecord) {
    const scanDate = new Date(scanRecord.timestamp).toLocaleString();
    const montant = scanRecord.price && scanRecord.price !== '0' ? scanRecord.price : 'Gratuit';
    const id = scanRecord.eventId || '—';
    return `<div>...</div>`;
};
QRScanner.createInvalidResultHTML = function(scanRecord) { return `<div>...</div>`; };
QRScanner.createExpiredResultHTML = function(scanRecord) { return `<div>...</div>`; };
QRScanner.createNotYetValidResultHTML = function(scanRecord) { return `<div>...</div>`; };
QRScanner.createDuplicateResultHTML = function(scanRecord) { return `<div>...</div>`; };

// ===== GESTION DES ERREURS CAMÉRA =====
QRScanner.showCameraError = function(message) {
    const placeholder = document.getElementById('scannerPlaceholder');
    if (placeholder) {
        placeholder.innerHTML = `
            <i class="bi bi-exclamation-triangle" style="color:#ef4444;"></i>
            <h3 style="color:#ef4444;">Erreur caméra</h3>
            <p style="color:#aaa;">${message}</p>
            <button id="retryBtn" class="btn btn-primary" style="margin-top:1.5rem;">
                <i class="bi bi-arrow-repeat"></i> Réessayer
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
