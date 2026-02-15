// QRGuardian Terminal - Application principale
class QRGuardianTerminal {
    constructor() {
        this.currentPage = 'scanPage';
        this.currentTheme = 'dark';
        this.UNIQUE_SECURITY_CODE = null;
        this.isRefreshing = false;
        this.statsChart = null;
        // Clé pour stocker le mot de passe administrateur dans IndexedDB
        this.ADMIN_PASSWORD_KEY = 'adminPassword';
    }

    async init() {
        try {
            await this.loadRequiredLibraries();
            if (typeof Database !== 'undefined') {
                await Database.init();
            }
            await this.loadSecurityCode();
            // Initialiser le mot de passe administrateur s'il n'existe pas
            await this.initAdminPassword();
            this.setupNavigation();
            this.setupTheme();
            this.setupRefreshButton();
            this.setupScanner();
            this.setupHistory();
            this.setupStats();
            this.setupSettings();
            this.showNotification('QRGuardian Terminal prêt', 'Scannez un QR code pour commencer', 'info');
        } catch (error) {
            console.error('❌ Erreur initialisation:', error);
            this.showNotification('Erreur', 'Veuillez rafraîchir la page', 'error');
        }
    }

    // Initialise le mot de passe administrateur s'il n'existe pas en base
    async initAdminPassword() {
        try {
            const existing = await Database.getSetting(this.ADMIN_PASSWORD_KEY);
            if (!existing) {
                // Mot de passe par défaut
                await Database.saveSetting(this.ADMIN_PASSWORD_KEY, 'Mrichesse_2025');
                console.log('✅ Mot de passe administrateur initialisé');
            }
        } catch (error) {
            console.error('Erreur lors de l\'initialisation du mot de passe admin:', error);
        }
    }

    // Vérifie le mot de passe saisi par rapport à celui stocké
    async checkAdminPassword(inputPassword) {
        try {
            const storedPassword = await Database.getSetting(this.ADMIN_PASSWORD_KEY);
            return inputPassword === storedPassword;
        } catch (error) {
            console.error('Erreur vérification mot de passe admin:', error);
            return false;
        }
    }

    async loadRequiredLibraries() {
        return new Promise((resolve) => {
            if (typeof jsQR !== 'undefined') resolve();
            else setTimeout(resolve, 1000);
        });
    }

    // ===== GESTION DU CODE SECRET =====
    async loadSecurityCode() {
        try {
            const code = await Database.getSecurityCode();
            this.UNIQUE_SECURITY_CODE = code || null;
            this.updateSecurityCodeUI();
        } catch (error) {
            console.error('Erreur chargement code:', error);
            this.UNIQUE_SECURITY_CODE = null;
        }
    }

    async storeSecurityCode(code) {
        if (!code) return;
        await Database.setSecurityCode(code);
        this.UNIQUE_SECURITY_CODE = code;
        this.updateSecurityCodeUI();
    }

    async deleteSecurityCode() {
        if (confirm('Êtes-vous sûr de vouloir supprimer le code secret ?\nLes futurs scans échoueront jusqu\'à une nouvelle synchronisation.')) {
            await Database.deleteSecurityCode();
            this.UNIQUE_SECURITY_CODE = null;
            this.updateSecurityCodeUI();
            this.showNotification('Code secret supprimé', 'Le terminal n\'est plus synchronisé.', 'warning');
        }
    }

    updateSecurityCodeUI() {
        const displayEl = document.getElementById('currentSecurityCodeDisplay');
        const statusIndicator = document.getElementById('codeStatusIndicator');
        const statusText = document.getElementById('codeStatusText');
        const statusDetail = document.getElementById('codeStatusDetail');
        const deleteBtn = document.getElementById('deleteCodeBtn');
        const copyBtn = document.getElementById('copyCodeBtn');

        if (this.UNIQUE_SECURITY_CODE) {
            const masked = this.UNIQUE_SECURITY_CODE.substring(0, 12) + '…' + this.UNIQUE_SECURITY_CODE.slice(-4);
            if (displayEl) displayEl.textContent = masked;
            if (statusIndicator) {
                statusIndicator.className = 'status-indicator active';
            }
            if (statusText) statusText.textContent = 'Code actif';
            if (statusDetail) statusDetail.textContent = `Synchronisé le ${new Date().toLocaleDateString()}`;
            if (deleteBtn) deleteBtn.disabled = false;
            if (copyBtn) copyBtn.disabled = false;
        } else {
            if (displayEl) displayEl.textContent = '--- aucun code ---';
            if (statusIndicator) {
                statusIndicator.className = 'status-indicator inactive';
            }
            if (statusText) statusText.textContent = 'Non défini';
            if (statusDetail) statusDetail.textContent = 'Aucun code secret';
            if (deleteBtn) deleteBtn.disabled = true;
            if (copyBtn) copyBtn.disabled = true;
        }
    }

    // ===== NAVIGATION =====
    setupNavigation() {
        document.querySelectorAll('.nav-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const pageId = e.currentTarget.getAttribute('data-page');
                this.switchPage(pageId);
            });
        });
        this.switchPage('scanPage');
    }

    switchPage(pageId) {
        document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
        document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
        const targetPage = document.getElementById(pageId);
        if (targetPage) targetPage.classList.add('active');
        else return;
        const targetBtn = document.querySelector(`[data-page="${pageId}"]`);
        if (targetBtn) targetBtn.classList.add('active');
        this.currentPage = pageId;

        if (pageId === 'historyPage') {
            this.loadHistory();
        } else if (pageId === 'statsPage') {
            this.loadStatistics();
        } else if (pageId === 'settingsPage') {
            this.updateSettings();
        }
    }

    // ===== THÈME =====
    setupTheme() {
        const themeToggle = document.getElementById('themeToggle');
        if (!themeToggle) return;
        const savedTheme = localStorage.getItem('qrguardian_terminal_theme') || 'dark';
        const applyTheme = (isLight) => {
            document.body.classList.toggle('light-theme', isLight);
            document.body.classList.toggle('dark-theme', !isLight);
            const icon = themeToggle.querySelector('i');
            if (icon) icon.className = isLight ? 'fas fa-sun' : 'fas fa-moon';
        };
        applyTheme(savedTheme === 'light');
        themeToggle.addEventListener('click', () => {
            const isLight = document.body.classList.contains('light-theme');
            localStorage.setItem('qrguardian_terminal_theme', isLight ? 'dark' : 'light');
            applyTheme(!isLight);
        });
    }

    // ===== BOUTON RAFRAÎCHIR =====
    setupRefreshButton() {
        const refreshBtn = document.getElementById('refreshBtn');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', (e) => {
                e.preventDefault();
                const icon = refreshBtn.querySelector('i');
                if (icon) icon.classList.add('fa-spin');
                if (this.currentPage === 'scanPage') this.refreshScanPage();
                else if (this.currentPage === 'historyPage') this.refreshHistoryPage();
                else if (this.currentPage === 'statsPage') this.refreshStatsPage();
                else if (this.currentPage === 'settingsPage') this.refreshSettingsPage();
                setTimeout(() => { if (icon) icon.classList.remove('fa-spin'); }, 1000);
            });
        }
    }

    refreshScanPage() {
        if (typeof QRScanner !== 'undefined') QRScanner.stop();
        const resultContainer = document.getElementById('scanResultContainer');
        if (resultContainer) resultContainer.style.display = 'none';
        this.showNotification('Scanner réinitialisé', '', 'info');
    }

    refreshHistoryPage() {
        this.loadHistory();
    }

    refreshStatsPage() {
        this.loadStatistics();
    }

    refreshSettingsPage() {
        this.updateSettings();
    }

    // ===== SCANNER =====
    setupScanner() {
        if (typeof QRScanner !== 'undefined') {
            QRScanner.init(this);
        }
    }

    // ===== HISTORIQUE =====
    setupHistory() {
        document.querySelectorAll('.filter-tab').forEach(tab => {
            tab.addEventListener('click', (e) => {
                document.querySelectorAll('.filter-tab').forEach(t => t.classList.remove('active'));
                e.currentTarget.classList.add('active');
                this.loadHistory(e.currentTarget.dataset.filter);
            });
        });
    }

    async loadHistory(filter = 'all') {
        try {
            const history = await Database.getScanHistory(filter, 100);
            const list = document.getElementById('historyList');
            if (!list) return;

            if (history.length === 0) {
                list.innerHTML = `
                    <div class="empty-history">
                        <i class="fas fa-history fa-3x"></i>
                        <h4>Aucun scan</h4>
                        <p>Utilisez le scanner pour commencer</p>
                    </div>
                `;
                return;
            }

            list.innerHTML = history.map(scan => `
                <div class="history-item ${scan.valid ? 'valid' : 'invalid'} ${scan.isDuplicate ? 'duplicate' : ''}">
                    <div class="history-item-header">
                        <i class="fas fa-${scan.isDuplicate ? 'exclamation-triangle' : scan.valid ? 'check-circle' : 'times-circle'}"></i>
                        <span class="history-event">${scan.eventName || 'QR Code'}</span>
                        <span class="history-date">${new Date(scan.timestamp).toLocaleDateString()}</span>
                    </div>
                    <div class="history-item-details">
                        ${scan.location ? `<p><i class="fas fa-map-marker-alt"></i> ${scan.location}</p>` : ''}
                        ${scan.price ? `<p><i class="fas fa-tag"></i> ${scan.price}</p>` : ''}
                        <p><i class="fas fa-clock"></i> ${new Date(scan.timestamp).toLocaleTimeString()}</p>
                        ${scan.isDuplicate ? '<span class="duplicate-badge"><i class="fas fa-exclamation-circle"></i> Doublon</span>' : ''}
                    </div>
                </div>
            `).join('');
        } catch (error) {
            console.error('Erreur chargement historique:', error);
        }
    }

    // ===== STATISTIQUES =====
    setupStats() {
        const exportJSON = document.getElementById('exportJSONBtn');
        const exportCSV = document.getElementById('exportCSVBtn');
        if (exportJSON) exportJSON.addEventListener('click', () => this.exportStats('json'));
        if (exportCSV) exportCSV.addEventListener('click', () => this.exportStats('csv'));
    }

    async loadStatistics() {
        try {
            const history = await Database.getScanHistory('all', 0);
            const valid = history.filter(s => s.valid && !s.isDuplicate).length;
            const invalid = history.filter(s => !s.valid && !s.isDuplicate).length;
            const duplicate = history.filter(s => s.isDuplicate).length;
            const total = history.length;

            document.getElementById('statValid').textContent = valid;
            document.getElementById('statInvalid').textContent = invalid;
            document.getElementById('statDuplicate').textContent = duplicate;
            document.getElementById('statTotal').textContent = total;

            if (typeof Chart !== 'undefined' && document.getElementById('statsChart')) {
                const ctx = document.getElementById('statsChart').getContext('2d');
                if (this.statsChart) this.statsChart.destroy();
                this.statsChart = new Chart(ctx, {
                    type: 'doughnut',
                    data: {
                        labels: ['Valides', 'Invalides', 'Doublons'],
                        datasets: [{
                            data: [valid, invalid, duplicate],
                            backgroundColor: ['#10b981', '#ef4444', '#f59e0b'],
                            borderWidth: 0
                        }]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: { legend: { labels: { color: document.body.classList.contains('light-theme') ? '#1e293b' : '#fff' } } }
                    }
                });
            }
        } catch (error) {
            console.error('Erreur chargement stats:', error);
        }
    }

    async exportStats(format) {
        const history = await Database.getScanHistory('all', 0);
        if (history.length === 0) {
            this.showNotification('Aucune donnée', 'Rien à exporter', 'warning');
            return;
        }

        if (format === 'json') {
            const exportData = {
                generatedAt: new Date().toISOString(),
                totalScans: history.length,
                scans: history.map(s => ({
                    ...s,
                    timestamp: s.timestamp,
                    valid: s.valid,
                    isDuplicate: s.isDuplicate,
                    eventName: s.eventName,
                    location: s.location,
                    price: s.price,
                    eventId: s.eventId,
                    securityCode: s.securityCode
                }))
            };
            const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `qrguardian_stats_${Date.now()}.json`;
            a.click();
            URL.revokeObjectURL(url);
        } else if (format === 'csv') {
            const headers = ['Date', 'Heure', 'Événement', 'Prix', 'Lieu', 'ID', 'Code secret', 'Valide', 'Doublon'];
            const rows = history.map(s => [
                new Date(s.timestamp).toLocaleDateString(),
                new Date(s.timestamp).toLocaleTimeString(),
                s.eventName || '',
                s.price || '',
                s.location || '',
                s.eventId || '',
                s.securityCode || '',
                s.valid ? 'Oui' : 'Non',
                s.isDuplicate ? 'Oui' : 'Non'
            ]);
            const csv = [headers.join(','), ...rows.map(r => r.map(c => `"${c}"`).join(','))].join('\n');
            const blob = new Blob([csv], { type: 'text/csv' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `qrguardian_stats_${Date.now()}.csv`;
            a.click();
            URL.revokeObjectURL(url);
        }
        this.showNotification('Export réussi', `Fichier ${format.toUpperCase()} téléchargé`, 'success');
    }

    // ===== PARAMÈTRES =====
    setupSettings() {
        const deleteCodeBtn = document.getElementById('deleteCodeBtn');
        if (deleteCodeBtn) deleteCodeBtn.addEventListener('click', () => this.deleteSecurityCode());
        const copyCodeBtn = document.getElementById('copyCodeBtn');
        if (copyCodeBtn) copyCodeBtn.addEventListener('click', () => this.copySecurityCode());
        
        const clearStorageBtn = document.getElementById('clearStorageBtn');
        const adminContainer = document.getElementById('adminPasswordContainer');
        const cancelBtn = document.getElementById('cancelAdminPasswordBtn');
        const confirmBtn = document.getElementById('confirmAdminPasswordBtn');
        const passwordInput = document.getElementById('adminPasswordInput');
        const errorMsg = document.getElementById('adminPasswordError');
        const confirmSpinner = document.getElementById('confirmSpinner');
        const confirmBtnText = document.getElementById('confirmBtnText');

        if (clearStorageBtn) {
            clearStorageBtn.addEventListener('click', () => {
                // Afficher le bloc de saisie
                if (adminContainer) adminContainer.classList.add('show');
                // Cacher le message d'erreur précédent
                if (errorMsg) errorMsg.classList.remove('show');
                // Vider le champ
                if (passwordInput) passwordInput.value = '';
                // Focus
                if (passwordInput) passwordInput.focus();
            });
        }

        if (cancelBtn) {
            cancelBtn.addEventListener('click', () => {
                if (adminContainer) adminContainer.classList.remove('show');
                if (errorMsg) errorMsg.classList.remove('show');
            });
        }

        if (confirmBtn) {
            confirmBtn.addEventListener('click', async () => {
                const password = passwordInput.value.trim();
                if (!password) {
                    errorMsg.textContent = 'Veuillez saisir le mot de passe';
                    errorMsg.classList.add('show');
                    return;
                }

                // Afficher le spinner et désactiver le bouton
                confirmBtn.disabled = true;
                if (confirmSpinner) confirmSpinner.style.display = 'inline-block';
                if (confirmBtnText) confirmBtnText.style.opacity = '0.5';

                try {
                    const isValid = await this.checkAdminPassword(password);
                    if (isValid) {
                        // Masquer le bloc
                        if (adminContainer) adminContainer.classList.remove('show');
                        if (errorMsg) errorMsg.classList.remove('show');
                        
                        // Procéder au nettoyage
                        if (confirm('⚠️ Effacer TOUTES les données locales ?\nL\'historique et les paramètres seront supprimés. Le code secret sera conservé dans localStorage.')) {
                            // Afficher un spinner sur le bouton "Nettoyer tout"
                            clearStorageBtn.disabled = true;
                            const originalText = clearStorageBtn.innerHTML;
                            clearStorageBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Nettoyage...';
                            
                            try {
                                await Database.clearAll();
                                await this.loadSecurityCode();
                                this.updateSettings();
                                this.showNotification('Stockage nettoyé', 'Les données ont été effacées', 'success');
                            } catch (error) {
                                this.showNotification('Erreur', 'Impossible de nettoyer', 'error');
                            } finally {
                                clearStorageBtn.disabled = false;
                                clearStorageBtn.innerHTML = originalText;
                            }
                        }
                    } else {
                        // Mot de passe incorrect
                        errorMsg.textContent = 'Mot de passe incorrect';
                        errorMsg.classList.add('show');
                        passwordInput.value = '';
                        passwordInput.focus();
                    }
                } catch (error) {
                    errorMsg.textContent = 'Erreur de vérification';
                    errorMsg.classList.add('show');
                } finally {
                    // Réactiver le bouton et cacher le spinner
                    confirmBtn.disabled = false;
                    if (confirmSpinner) confirmSpinner.style.display = 'none';
                    if (confirmBtnText) confirmBtnText.style.opacity = '1';
                }
            });
        }

        this.updateSecurityCodeUI();
        this.updateStorageUsage();
    }

    copySecurityCode() {
        if (!this.UNIQUE_SECURITY_CODE) {
            this.showNotification('Aucun code', 'Rien à copier', 'error');
            return;
        }
        navigator.clipboard.writeText(this.UNIQUE_SECURITY_CODE)
            .then(() => this.showNotification('Code copié', 'Code secret copié dans le presse-papier', 'success'))
            .catch(() => this.showNotification('Erreur', 'Impossible de copier', 'error'));
    }

    async updateSettings() {
        this.updateSecurityCodeUI();
        await this.updateStorageUsage();
    }

    async updateStorageUsage() {
        try {
            const usage = await Database.getStorageUsage();
            const storageUsage = document.getElementById('storageUsage');
            const storageUsed = document.getElementById('storageUsed');
            const storageFill = document.getElementById('storageFill');
            if (storageUsage) storageUsage.textContent = `${usage.usage} / ${usage.quota}`;
            if (storageUsed) storageUsed.textContent = usage.usage;
            if (storageFill) storageFill.style.width = `${Math.min(usage.percentage, 100)}%`;
        } catch (error) {
            console.error('Erreur storage:', error);
        }
    }

    // La méthode clearStorage n'est plus utilisée directement, mais on la garde pour compatibilité
    async clearStorage() {
        // Cette méthode n'est plus appelée
    }

    // ===== NOTIFICATIONS =====
    showNotification(title, message, type = 'info') {
        try {
            const old = document.querySelectorAll('.notification');
            if (old.length > 3) old[0].remove();
            const notif = document.createElement('div');
            notif.className = `notification ${type}`;
            notif.innerHTML = `
                <div class="notification-header">
                    <i class="fas fa-${type === 'success' ? 'check-circle' : type === 'error' ? 'exclamation-circle' : 'info-circle'}"></i>
                    <h4>${title}</h4>
                </div>
                <p>${message}</p>
            `;
            document.body.appendChild(notif);
            setTimeout(() => notif.classList.add('show'), 10);
            setTimeout(() => {
                notif.classList.remove('show');
                setTimeout(() => notif.remove(), 300);
            }, 5000);
        } catch (e) {}
    }
}

// Initialisation
document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
        if (typeof window.qrGuardianTerminal === 'undefined') {
            window.qrGuardianTerminal = new QRGuardianTerminal();
            window.qrGuardianTerminal.init();
        }
    }, 500);
});