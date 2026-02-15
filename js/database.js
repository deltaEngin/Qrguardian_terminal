// Gestion de la base de données IndexedDB - Version corrigée (connexion unique)
class Database {
    static DB_NAME = 'QRGuardianDB';
    static DB_VERSION = 5;
    static STORES = {
        KEYS: 'keys',
        HISTORY: 'scanHistory',
        GENERATIONS: 'generations',
        SETTINGS: 'settings',
        SECURITY_CODES: 'securityCodes',
        BATCHES: 'batches'
    };

    // Singleton : stocke la promesse d'initialisation et la connexion
    static _initPromise = null;
    static _db = null;

    // ------------------------------------------------------------------
    // Initialisation unique de la base de données
    // ------------------------------------------------------------------
    static async init() {
        if (this._db) {
            return this._db;
        }
        if (this._initPromise) {
            return this._initPromise;
        }

        this._initPromise = new Promise((resolve, reject) => {
            const request = indexedDB.open(this.DB_NAME, this.DB_VERSION);

            request.onerror = () => {
                this._initPromise = null;
                reject(request.error);
            };

            request.onsuccess = () => {
                this._db = request.result;
                this._db.onclose = () => {
                    console.warn('⚠️ Connexion DB fermée, réinitialisation...');
                    this._db = null;
                    this._initPromise = null;
                };
                resolve(this._db);
            };

            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                const oldVersion = event.oldVersion;

                if (!db.objectStoreNames.contains(this.STORES.KEYS)) {
                    const keyStore = db.createObjectStore(this.STORES.KEYS, { keyPath: 'id' });
                    keyStore.createIndex('createdAt', 'createdAt', { unique: false });
                }

                if (!db.objectStoreNames.contains(this.STORES.HISTORY)) {
                    const historyStore = db.createObjectStore(this.STORES.HISTORY, { 
                        keyPath: 'id',
                        autoIncrement: true 
                    });
                    historyStore.createIndex('timestamp', 'timestamp', { unique: false });
                    historyStore.createIndex('valid', 'valid', { unique: false });
                    historyStore.createIndex('securityCode', 'securityCode', { unique: false });
                    historyStore.createIndex('eventId', 'eventId', { unique: false });
                    historyStore.createIndex('isConnection', 'isConnection', { unique: false });
                    historyStore.createIndex('isDuplicate', 'isDuplicate', { unique: false });
                } else if (oldVersion < 5) {
                    const tx = event.target.transaction;
                    const historyStore = tx.objectStore(this.STORES.HISTORY);
                    if (!historyStore.indexNames.contains('isConnection')) {
                        historyStore.createIndex('isConnection', 'isConnection', { unique: false });
                    }
                    if (!historyStore.indexNames.contains('isDuplicate')) {
                        historyStore.createIndex('isDuplicate', 'isDuplicate', { unique: false });
                    }
                }

                if (!db.objectStoreNames.contains(this.STORES.GENERATIONS)) {
                    const genStore = db.createObjectStore(this.STORES.GENERATIONS, {
                        keyPath: 'id',
                        autoIncrement: true
                    });
                    genStore.createIndex('timestamp', 'timestamp', { unique: false });
                    genStore.createIndex('securityCode', 'securityCode', { unique: false });
                    genStore.createIndex('used', 'used', { unique: false });
                    genStore.createIndex('eventId', 'eventId', { unique: false });
                    genStore.createIndex('batchIndex', 'batchIndex', { unique: false });
                    genStore.createIndex('batchTotal', 'batchTotal', { unique: false });
                } else if (oldVersion < 5) {
                    const tx = event.target.transaction;
                    const genStore = tx.objectStore(this.STORES.GENERATIONS);
                    if (!genStore.indexNames.contains('batchIndex')) {
                        genStore.createIndex('batchIndex', 'batchIndex', { unique: false });
                    }
                    if (!genStore.indexNames.contains('batchTotal')) {
                        genStore.createIndex('batchTotal', 'batchTotal', { unique: false });
                    }
                }

                if (!db.objectStoreNames.contains(this.STORES.SETTINGS)) {
                    const settingsStore = db.createObjectStore(this.STORES.SETTINGS, { keyPath: 'key' });
                    settingsStore.createIndex('updatedAt', 'updatedAt', { unique: false });
                } else if (oldVersion < 5) {
                    const tx = event.target.transaction;
                    const settingsStore = tx.objectStore(this.STORES.SETTINGS);
                    if (!settingsStore.indexNames.contains('updatedAt')) {
                        settingsStore.createIndex('updatedAt', 'updatedAt', { unique: false });
                    }
                }

                if (!db.objectStoreNames.contains(this.STORES.SECURITY_CODES)) {
                    db.createObjectStore(this.STORES.SECURITY_CODES, { keyPath: 'code' });
                }

                if (!db.objectStoreNames.contains(this.STORES.BATCHES)) {
                    const batchesStore = db.createObjectStore(this.STORES.BATCHES, {
                        keyPath: 'batchId',
                        autoIncrement: true
                    });
                    batchesStore.createIndex('timestamp', 'timestamp', { unique: false });
                    batchesStore.createIndex('count', 'count', { unique: false });
                    batchesStore.createIndex('status', 'status', { unique: false });
                    batchesStore.createIndex('securityCode', 'securityCode', { unique: false });
                }
            };
        });

        return this._initPromise;
    }

    // ------------------------------------------------------------------
    // Récupère la connexion (attend l'initialisation)
    // ------------------------------------------------------------------
    static async _ensureDB() {
        return await this.init();
    }

    // ===== GESTION CENTRALISÉE DU CODE SECRET =====
    static async getSecurityCode() {
        const code = localStorage.getItem('qrguardian_security_code');
        if (code) {
            return code;
        }
        try {
            const dbCode = await this.getSetting('securityCode');
            if (dbCode) {
                localStorage.setItem('qrguardian_security_code', dbCode);
                return dbCode;
            }
        } catch (e) {}
        return null;
    }

    static async setSecurityCode(code) {
        if (!code) return;
        localStorage.setItem('qrguardian_security_code', code);
        try {
            await this.saveSetting('securityCode', code);
        } catch (e) {
            console.warn('⚠️ Sauvegarde DB du code secret échouée, mais localStorage OK');
        }
    }

    // ===== CLÉS =====
    static async saveKeys(keys) {
        const db = await this._ensureDB();
        const tx = db.transaction(this.STORES.KEYS, 'readwrite');
        const store = tx.objectStore(this.STORES.KEYS);
        const keyData = {
            id: 'current_keys',
            ...keys,
            createdAt: new Date().toISOString()
        };
        return new Promise((resolve, reject) => {
            const request = store.put(keyData);
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    static async getKeys() {
        const db = await this._ensureDB();
        const tx = db.transaction(this.STORES.KEYS, 'readonly');
        const store = tx.objectStore(this.STORES.KEYS);
        return new Promise((resolve, reject) => {
            const request = store.get('current_keys');
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    // ===== HISTORIQUE DES SCANS =====
    static async checkIfEventIdExists(eventId) {
        if (!eventId) return false;
        try {
            const db = await this._ensureDB();
            const tx = db.transaction(this.STORES.HISTORY, 'readonly');
            const store = tx.objectStore(this.STORES.HISTORY);
            const index = store.index('eventId');
            return new Promise((resolve) => {
                const request = index.get(eventId);
                request.onsuccess = () => resolve(!!request.result);
                request.onerror = () => resolve(false);
            });
        } catch {
            return false;
        }
    }

    static async saveScan(scanData) {
        try {
            const isConnectionScan = scanData.isConnection || 
                (scanData.securityCheck?.message?.includes('CONNEXION') || false);
            const scanRecord = {
                ...scanData,
                isConnection: isConnectionScan,
                timestamp: new Date().toISOString()
            };

            if (scanRecord.valid && scanRecord.eventId && !scanRecord.isDuplicate) {
                const exists = await this.checkIfEventIdExists(scanRecord.eventId);
                if (exists) {
                    scanRecord.isDuplicate = true;
                    scanRecord.valid = false;
                    scanRecord.securityCheck = { valid: false, message: '⚠️ DOUBLON - Déjà utilisé' };
                }
            }

            const db = await this._ensureDB();
            const tx = db.transaction(this.STORES.HISTORY, 'readwrite');
            const store = tx.objectStore(this.STORES.HISTORY);

            return new Promise((resolve, reject) => {
                const request = store.add(scanRecord);
                request.onsuccess = (e) => {
                    resolve({ id: e.target.result, isDuplicate: scanRecord.isDuplicate });
                };
                request.onerror = (e) => {
                    console.error('❌ Erreur saveScan (add):', e.target.error);
                    reject(e.target.error);
                };
            });
        } catch (error) {
            console.error('❌ Erreur saveScan:', error);
            throw error;
        }
    }

    static async saveConnectionScan(connectionData) {
        try {
            const scanRecord = {
                eventName: 'Connexion Appareil',
                valid: true,
                timestamp: new Date().toISOString(),
                securityCode: connectionData.code || 'CONNEXION',
                eventId: `CONN-${Date.now()}`,
                securityCheck: { valid: true, message: '✅ CONNEXION RÉUSSIE' },
                isConnection: true,
                rawData: JSON.stringify(connectionData).substring(0, 200)
            };

            const db = await this._ensureDB();
            const tx = db.transaction(this.STORES.HISTORY, 'readwrite');
            const store = tx.objectStore(this.STORES.HISTORY);

            return new Promise((resolve, reject) => {
                const request = store.add(scanRecord);
                request.onsuccess = () => {
                    resolve({ id: request.result });
                };
                request.onerror = (e) => {
                    console.error('❌ Erreur saveConnectionScan (add):', e.target.error);
                    reject(e.target.error);
                };
            });
        } catch (error) {
            console.error('❌ Erreur saveConnectionScan:', error);
            throw error;
        }
    }

    // ===== AUTRES MÉTHODES =====
    static async checkSecurityCode(securityCode) {
        try {
            const db = await this._ensureDB();
            const tx = db.transaction(this.STORES.GENERATIONS, 'readonly');
            const store = tx.objectStore(this.STORES.GENERATIONS);
            const index = store.index('securityCode');
            return new Promise((resolve) => {
                const request = index.get(securityCode);
                request.onsuccess = () => resolve({
                    exists: !!request.result,
                    used: request.result ? request.result.used || false : false,
                    data: request.result
                });
                request.onerror = () => resolve({ exists: false, used: false, data: null });
            });
        } catch (error) {
            console.error('Erreur checkSecurityCode:', error);
            return { exists: false, used: false, data: null };
        }
    }

    static async markSecurityCodeAsUsed(securityCode, eventId = null) {
        try {
            const db = await this._ensureDB();
            const tx = db.transaction(this.STORES.GENERATIONS, 'readwrite');
            const store = tx.objectStore(this.STORES.GENERATIONS);
            const index = store.index('securityCode');
            return new Promise((resolve, reject) => {
                const request = index.get(securityCode);
                request.onsuccess = () => {
                    const generation = request.result;
                    if (generation) {
                        generation.used = true;
                        generation.usedAt = new Date().toISOString();
                        if (eventId) generation.usedEventId = eventId;
                        const updateRequest = store.put(generation);
                        updateRequest.onsuccess = () => resolve();
                        updateRequest.onerror = (e) => reject(e.target.error);
                    } else {
                        resolve();
                    }
                };
                request.onerror = (e) => reject(e.target.error);
            });
        } catch (error) {
            console.error('Erreur markSecurityCodeAsUsed:', error);
            throw error;
        }
    }

    static async getSecurityCodes() {
        try {
            const db = await this._ensureDB();
            const tx = db.transaction(this.STORES.GENERATIONS, 'readonly');
            const store = tx.objectStore(this.STORES.GENERATIONS);
            return new Promise((resolve, reject) => {
                const request = store.getAll();
                request.onsuccess = () => {
                    const codes = request.result.map(item => item.securityCode).filter(code => code);
                    resolve(codes);
                };
                request.onerror = () => reject(request.error);
            });
        } catch (error) {
            console.error('Erreur getSecurityCodes:', error);
            return [];
        }
    }

    static async getUnusedSecurityCodesCount() {
        try {
            const db = await this._ensureDB();
            const tx = db.transaction(this.STORES.GENERATIONS, 'readonly');
            const store = tx.objectStore(this.STORES.GENERATIONS);
            const index = store.index('used');
            return new Promise((resolve) => {
                const request = index.getAll(false);
                request.onsuccess = () => resolve(request.result.length);
                request.onerror = () => resolve(0);
            });
        } catch (error) {
            console.error('Erreur getUnusedSecurityCodesCount:', error);
            return 0;
        }
    }

    static async getTotalSecurityCodesCount() {
        try {
            const db = await this._ensureDB();
            const tx = db.transaction(this.STORES.GENERATIONS, 'readonly');
            const store = tx.objectStore(this.STORES.GENERATIONS);
            return new Promise((resolve) => {
                const request = store.count();
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => resolve(0);
            });
        } catch (error) {
            console.error('Erreur getTotalSecurityCodesCount:', error);
            return 0;
        }
    }

    static async getSecurityStats() {
        try {
            const db = await this._ensureDB();
            const tx = db.transaction([this.STORES.GENERATIONS, this.STORES.HISTORY], 'readonly');
            const genStore = tx.objectStore(this.STORES.GENERATIONS);
            const historyStore = tx.objectStore(this.STORES.HISTORY);
            return new Promise((resolve) => {
                let totalCodes = 0;
                let validScans = 0;
                let duplicateAttempts = 0;
                let connectionScans = 0;
                let recentScans = [];

                const genRequest = genStore.getAll();
                genRequest.onsuccess = () => {
                    const codes = genRequest.result;
                    totalCodes = codes.length;

                    const weekAgo = new Date();
                    weekAgo.setDate(weekAgo.getDate() - 7);

                    const historyRequest = historyStore.getAll();
                    historyRequest.onsuccess = () => {
                        const scans = historyRequest.result;
                        validScans = scans.filter(scan => scan.valid && !scan.isConnection).length;
                        duplicateAttempts = scans.filter(scan => scan.isDuplicate).length;
                        connectionScans = scans.filter(scan => scan.isConnection).length;
                        recentScans = scans.filter(scan => new Date(scan.timestamp) > weekAgo);

                        const totalScans = scans.filter(scan => !scan.isConnection).length;
                        const fraudRate = totalScans > 0 ? 
                            ((duplicateAttempts / totalScans) * 100).toFixed(2) + '%' : '0%';
                        const recentActivity = recentScans.length;

                        resolve({
                            totalCodes,
                            usedCodes: validScans,
                            duplicateAttempts,
                            connectionScans,
                            fraudRate,
                            recentActivity,
                            totalScans: scans.length
                        });
                    };
                    historyRequest.onerror = () => {
                        resolve({
                            totalCodes,
                            usedCodes: 0,
                            duplicateAttempts: 0,
                            connectionScans: 0,
                            fraudRate: '0%',
                            recentActivity: 0,
                            totalScans: 0
                        });
                    };
                };
                genRequest.onerror = () => {
                    resolve({
                        totalCodes: 0,
                        usedCodes: 0,
                        duplicateAttempts: 0,
                        connectionScans: 0,
                        fraudRate: '0%',
                        recentActivity: 0,
                        totalScans: 0
                    });
                };
            });
        } catch (error) {
            console.error('Erreur getSecurityStats:', error);
            return {
                totalCodes: 0,
                usedCodes: 0,
                duplicateAttempts: 0,
                connectionScans: 0,
                fraudRate: '0%',
                recentActivity: 0,
                totalScans: 0
            };
        }
    }

    static async getScanHistory(filter = 'all', limit = 100) {
        const db = await this._ensureDB();
        const tx = db.transaction(this.STORES.HISTORY, 'readonly');
        const store = tx.objectStore(this.STORES.HISTORY);
        return new Promise((resolve, reject) => {
            const request = store.getAll();
            request.onsuccess = () => {
                let results = request.result;
                if (filter === 'valid') {
                    results = results.filter(scan => scan.valid && !scan.isConnection);
                } else if (filter === 'invalid') {
                    results = results.filter(scan => !scan.valid && !scan.isConnection);
                } else if (filter === 'duplicate') {
                    results = results.filter(scan => scan.isDuplicate);
                } else if (filter === 'connection') {
                    results = results.filter(scan => scan.isConnection);
                }
                results.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
                if (limit > 0) results = results.slice(0, limit);
                resolve(results);
            };
            request.onerror = () => reject(request.error);
        });
    }

    // ===== GÉNÉRATIONS =====
    static async saveGeneration(genData) {
        try {
            const db = await this._ensureDB();
            const tx = db.transaction(this.STORES.GENERATIONS, 'readwrite');
            const store = tx.objectStore(this.STORES.GENERATIONS);
            const genRecord = {
                ...genData,
                timestamp: new Date().toISOString(),
                used: genData.used || false,
                scanCount: genData.scanCount || 0
            };
            return new Promise((resolve, reject) => {
                const request = store.add(genRecord);
                request.onsuccess = (event) => resolve(event.target.result);
                request.onerror = (event) => {
                    console.error('❌ Erreur saveGeneration (add):', event.target.error);
                    reject(event.target.error);
                };
            });
        } catch (error) {
            console.error('❌ Erreur saveGeneration:', error);
            throw error;
        }
    }

    // ===== PARAMÈTRES =====
    static async saveSetting(key, value) {
        try {
            const db = await this._ensureDB();
            const tx = db.transaction(this.STORES.SETTINGS, 'readwrite');
            const store = tx.objectStore(this.STORES.SETTINGS);
            const setting = { key, value, updatedAt: new Date().toISOString() };
            return new Promise((resolve, reject) => {
                const request = store.put(setting);
                request.onsuccess = () => resolve();
                request.onerror = (e) => reject(e.target.error);
            });
        } catch (error) {
            console.error('Erreur saveSetting:', error);
            throw error;
        }
    }

    static async getSetting(key) {
        try {
            const db = await this._ensureDB();
            const tx = db.transaction(this.STORES.SETTINGS, 'readonly');
            const store = tx.objectStore(this.STORES.SETTINGS);
            return new Promise((resolve, reject) => {
                const request = store.get(key);
                request.onsuccess = () => resolve(request.result?.value);
                request.onerror = (e) => reject(e.target.error);
            });
        } catch {
            return null;
        }
    }

    static async getAllSettings() {
        try {
            const db = await this._ensureDB();
            const tx = db.transaction(this.STORES.SETTINGS, 'readonly');
            const store = tx.objectStore(this.STORES.SETTINGS);
            return new Promise((resolve, reject) => {
                const request = store.getAll();
                request.onsuccess = () => {
                    const settings = {};
                    request.result.forEach(setting => {
                        settings[setting.key] = setting.value;
                    });
                    resolve(settings);
                };
                request.onerror = (e) => reject(e.target.error);
            });
        } catch (error) {
            console.error('Erreur getAllSettings:', error);
            return {};
        }
    }

    // ===== STOCKAGE =====
    static async getStorageUsage() {
        if (!navigator.storage || !navigator.storage.estimate) {
            return { usage: 'Non disponible', quota: 'Non disponible', percentage: 0 };
        }
        try {
            const estimate = await navigator.storage.estimate();
            const usageKB = (estimate.usage / 1024).toFixed(2);
            const quotaMB = (estimate.quota / 1024 / 1024).toFixed(2);
            const percentage = estimate.quota > 0 ? ((estimate.usage / estimate.quota) * 100).toFixed(2) : 0;
            return {
                usage: `${usageKB} KB`,
                quota: `${quotaMB} MB`,
                percentage: parseFloat(percentage),
                usageBytes: estimate.usage,
                quotaBytes: estimate.quota
            };
        } catch (error) {
            console.error('Erreur estimation stockage:', error);
            return { usage: 'Erreur', quota: 'Erreur', percentage: 0 };
        }
    }

    static async getDatabaseStats() {
        try {
            const db = await this._ensureDB();
            const stats = {};
            for (const [storeName, storeKey] of Object.entries(this.STORES)) {
                const tx = db.transaction(storeKey, 'readonly');
                const store = tx.objectStore(storeKey);
                stats[storeName] = await new Promise((resolve) => {
                    const request = store.count();
                    request.onsuccess = () => resolve(request.result);
                    request.onerror = () => resolve(0);
                });
            }
            const storage = await this.getStorageUsage();
            stats.storage = storage;
            const history = await this.getScanHistory('all', 1);
            stats.lastActivity = history.length > 0 ? new Date(history[0].timestamp) : null;
            return stats;
        } catch (error) {
            console.error('Erreur getDatabaseStats:', error);
            return {};
        }
    }

    // ===== NETTOYAGE =====
    static async clearAll() {
        try {
            const db = await this._ensureDB();
            const stores = Object.values(this.STORES).filter(s => s !== this.STORES.SETTINGS);
            for (const storeName of stores) {
                const tx = db.transaction(storeName, 'readwrite');
                const store = tx.objectStore(storeName);
                await new Promise((resolve, reject) => {
                    const request = store.clear();
                    request.onsuccess = resolve;
                    request.onerror = (e) => reject(e.target.error);
                });
            }
            return true;
        } catch (error) {
            console.error('❌ Erreur clearAll:', error);
            throw error;
        }
    }

    static async clearHistory() {
        try {
            const db = await this._ensureDB();
            const tx = db.transaction(this.STORES.HISTORY, 'readwrite');
            const store = tx.objectStore(this.STORES.HISTORY);
            return new Promise((resolve, reject) => {
                const request = store.clear();
                request.onsuccess = () => resolve();
                request.onerror = (e) => reject(e.target.error);
            });
        } catch (error) {
            console.error('Erreur clearHistory:', error);
            throw error;
        }
    }

    // ===== LOTS =====
    static async saveBatch(batchData) {
        try {
            const db = await this._ensureDB();
            const tx = db.transaction(this.STORES.BATCHES, 'readwrite');
            const store = tx.objectStore(this.STORES.BATCHES);
            const batchRecord = {
                ...batchData,
                timestamp: new Date().toISOString(),
                status: 'completed',
                completedAt: new Date().toISOString()
            };
            return new Promise((resolve, reject) => {
                const request = store.add(batchRecord);
                request.onsuccess = (event) => resolve(event.target.result);
                request.onerror = (event) => reject(event.target.error);
            });
        } catch (error) {
            console.error('Erreur saveBatch:', error);
            throw error;
        }
    }

    static async getBatches(limit = 10) {
        try {
            const db = await this._ensureDB();
            const tx = db.transaction(this.STORES.BATCHES, 'readonly');
            const store = tx.objectStore(this.STORES.BATCHES);
            return new Promise((resolve, reject) => {
                const request = store.getAll();
                request.onsuccess = () => {
                    let results = request.result;
                    results.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
                    if (limit > 0) results = results.slice(0, limit);
                    resolve(results);
                };
                request.onerror = () => reject(request.error);
            });
        } catch (error) {
            console.error('Erreur getBatches:', error);
            return [];
        }
    }

    static async getBatchStats() {
        try {
            const batches = await this.getBatches(0);
            const totalBatches = batches.length;
            const totalQRCodes = batches.reduce((sum, batch) => sum + (batch.count || 0), 0);
            const recentBatches = batches.filter(batch => {
                const weekAgo = new Date();
                weekAgo.setDate(weekAgo.getDate() - 7);
                return new Date(batch.timestamp) > weekAgo;
            });
            return {
                totalBatches,
                totalQRCodes,
                recentBatches: recentBatches.length,
                averageBatchSize: totalBatches > 0 ? Math.round(totalQRCodes / totalBatches) : 0
            };
        } catch (error) {
            console.error('Erreur getBatchStats:', error);
            return { totalBatches: 0, totalQRCodes: 0, recentBatches: 0, averageBatchSize: 0 };
        }
    }

    // ===== CONNEXION =====
    static async getConnectionHistory() {
        return await this.getScanHistory('connection', 50);
    }

    static async getRecentActivity(days = 7) {
        try {
            const db = await this._ensureDB();
            const tx = db.transaction(this.STORES.HISTORY, 'readonly');
            const store = tx.objectStore(this.STORES.HISTORY);
            const index = store.index('timestamp');
            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - days);
            return new Promise((resolve) => {
                const request = index.getAll();
                request.onsuccess = () => {
                    const scans = request.result.filter(scan => new Date(scan.timestamp) > cutoffDate);
                    resolve(scans);
                };
                request.onerror = () => resolve([]);
            });
        } catch (error) {
            console.error('Erreur getRecentActivity:', error);
            return [];
        }
    }

    // ===== EXPORT / IMPORT =====
    static async exportDatabase() {
        try {
            const db = await this._ensureDB();
            const exportData = {};
            for (const [storeName, storeKey] of Object.entries(this.STORES)) {
                const tx = db.transaction(storeKey, 'readonly');
                const store = tx.objectStore(storeKey);
                exportData[storeName] = await new Promise((resolve) => {
                    const request = store.getAll();
                    request.onsuccess = () => resolve(request.result);
                    request.onerror = () => resolve([]);
                });
            }
            exportData.metadata = {
                exportDate: new Date().toISOString(),
                version: this.DB_VERSION,
                dbName: this.DB_NAME
            };
            return exportData;
        } catch (error) {
            console.error('Erreur exportDatabase:', error);
            return null;
        }
    }

    static async importDatabase(data) {
        try {
            if (!data || typeof data !== 'object') throw new Error('Données d\'import invalides');
            const db = await this._ensureDB();
            if (data.metadata && data.metadata.version > this.DB_VERSION) {
                console.warn('Version de base de données plus récente détectée');
            }
            for (const [storeName, storeData] of Object.entries(data)) {
                if (storeName === 'metadata') continue;
                const storeKey = this.STORES[storeName];
                if (!storeKey) {
                    console.warn(`Store "${storeName}" non reconnu, ignoré`);
                    continue;
                }
                if (Array.isArray(storeData)) {
                    const tx = db.transaction(storeKey, 'readwrite');
                    const store = tx.objectStore(storeKey);
                    for (const item of storeData) {
                        store.put(item);
                    }
                    await new Promise((resolve, reject) => {
                        tx.oncomplete = resolve;
                        tx.onerror = () => reject(tx.error);
                    });
                }
            }
            return true;
        } catch (error) {
            console.error('❌ Erreur importDatabase:', error);
            throw error;
        }
    }
}

// Exposition globale
if (typeof window !== 'undefined') {
    window.Database = Database;
}

// Initialisation automatique en arrière-plan
document.addEventListener('DOMContentLoaded', () => {
    setTimeout(async () => {
        try {
            await Database.init();
        } catch (error) {
            console.error('❌ Erreur initialisation DB:', error);
        }
    }, 500);
});