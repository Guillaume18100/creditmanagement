const config = require('../config');
const logger = require('../utils/logger');

// Client WaterfLAI simplifié pour éviter les erreurs
class WaterfLAIClient {
  constructor() {
    this.apiKey = config.waterflai?.apiKey;
    this.baseUrl = config.waterflai?.baseUrl || 'https://api.waterflai.com';
    this.initialized = false;
    
    if (!this.apiKey) {
      logger.warn('Clé API WaterfLAI non configurée. Certaines fonctionnalités ne seront pas disponibles.');
    } else {
      logger.info('Client WaterfLAI créé (initialisation différée)');
    }
  }

  /**
   * Initialise le client avec axios si nécessaire
   */
  async initialize() {
    if (this.initialized) return true;
    
    try {
      // Tentative d'importer axios
      const axios = await import('axios').then(module => module.default);
      
      // Créer le client axios avec configuration
      this.client = axios.create({
        baseURL: this.baseUrl,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`
        },
        timeout: 30000 // 30 secondes
      });
      
      this.initialized = true;
      logger.info('Client WaterfLAI initialisé avec succès');
      return true;
    } catch (error) {
      logger.error('Erreur lors de l\'initialisation du client WaterfLAI:', error.message);
      return false;
    }
  }

  /**
   * Analyse un document de construction
   * Utilise l'IA spécialisée pour les plans et documents techniques
   */
  async analyzeConstructionDocument(documentUrl, documentType = 'blueprint') {
    try {
      const initialized = await this.initialize();
      if (!initialized) {
        return {
          success: false,
          error: 'Client non initialisé',
          message: 'Service WaterfLAI non disponible'
        };
      }

      const response = await this.client.post('/api/v1/analyze-document', {
        document_url: documentUrl,
        document_type: documentType,
        include_measurements: true,
        extract_entities: true
      });
      
      return response.data;
    } catch (error) {
      logger.error('Erreur lors de l\'analyse du document:', error.message);
      return {
        success: false,
        error: error.message,
        message: 'Échec de l\'analyse du document'
      };
    }
  }

  /**
   * Extrait des mesures et dimensions d'un plan
   */
  async extractMeasurements(documentUrl) {
    try {
      const initialized = await this.initialize();
      if (!initialized) {
        return {
          success: false,
          error: 'Client non initialisé',
          measurements: []
        };
      }

      const response = await this.client.post('/api/v1/extract-measurements', {
        document_url: documentUrl,
        units: 'metric',
        accuracy_level: 'high'
      });
      
      return response.data;
    } catch (error) {
      logger.error('Erreur lors de l\'extraction des mesures:', error.message);
      return {
        success: false,
        error: error.message,
        measurements: []
      };
    }
  }

  /**
   * Compare deux versions d'un document pour identifier les changements
   */
  async compareDocuments(originalUrl, updatedUrl, documentType = 'blueprint') {
    const endpoint = '/api/v1/compare-documents';
    
    const data = {
      original_document_url: originalUrl,
      updated_document_url: updatedUrl,
      document_type: documentType,
      highlight_changes: true
    };

    try {
      const result = await this._callWaterfLAI(endpoint, data);
      return result;
    } catch (error) {
      logger.error('Erreur lors de la comparaison des documents:', error);
      return {
        success: false,
        error: error.message,
        changes: []
      };
    }
  }

  /**
   * Détecte les conflits potentiels dans un plan de construction
   */
  async detectConflicts(documentUrl) {
    const endpoint = '/api/v1/detect-conflicts';
    
    const data = {
      document_url: documentUrl,
      conflict_types: ['spatial', 'timeline', 'regulatory']
    };

    try {
      const result = await this._callWaterfLAI(endpoint, data);
      return result;
    } catch (error) {
      logger.error('Erreur lors de la détection de conflits:', error);
      return {
        success: false,
        error: error.message,
        conflicts: []
      };
    }
  }

  /**
   * Génère une estimation des coûts et des ressources basée sur un plan
   */
  async generateEstimate(documentUrl, region = 'europe', currency = 'EUR') {
    const endpoint = '/api/v1/generate-estimate';
    
    const data = {
      document_url: documentUrl,
      region: region,
      currency: currency,
      detail_level: 'high'
    };

    try {
      const result = await this._callWaterfLAI(endpoint, data);
      return result;
    } catch (error) {
      logger.error('Erreur lors de la génération de l\'estimation:', error);
      return {
        success: false,
        error: error.message,
        estimate: null
      };
    }
  }

  /**
   * Vérifie la conformité d'un document par rapport aux régulations
   */
  async checkCompliance(documentUrl, regulationCodes = [], region = 'france') {
    const endpoint = '/api/v1/check-compliance';
    
    const data = {
      document_url: documentUrl,
      regulation_codes: regulationCodes,
      region: region
    };

    try {
      const result = await this._callWaterfLAI(endpoint, data);
      return result;
    } catch (error) {
      logger.error('Erreur lors de la vérification de conformité:', error);
      return {
        success: false,
        error: error.message,
        compliance_issues: []
      };
    }
  }
}

module.exports = new WaterfLAIClient(); 