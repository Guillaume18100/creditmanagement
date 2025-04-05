const config = require('../config');
const logger = require('../utils/logger');

// Créer un client qui ne dépend pas directement de Mistral API
class MistralAIClient {
  constructor() {
    this.initialized = false;
    this.apiKey = config.mistral?.apiKey;
    this.model = config.mistral?.defaultModel || 'mistral-large-latest';
    this.temperature = config.mistral?.temperature || 0.5;
    this.maxTokens = config.mistral?.maxTokens || 1000;
    
    // On ne l'initialise pas immédiatement pour éviter les erreurs au démarrage
    logger.info('Client Mistral AI créé (initialisation différée)');
  }

  /**
   * Initialisation asynchrone
   */
  async initialize() {
    if (this.initialized) return;
    
    try {
      if (!this.apiKey) {
        logger.warn('Clé API Mistral non configurée - Service désactivé');
        return;
      }
      
      // Utiliser import() dynamique pour les modules ESM
      const mistralModule = await import('@mistralai/mistralai');
      const MistralClient = mistralModule.MistralClient;
      
      if (!MistralClient) {
        throw new Error('Module Mistral introuvable');
      }
      
      this.client = new MistralClient(this.apiKey);
      this.initialized = true;
      logger.info('Client Mistral AI initialisé avec succès');
    } catch (error) {
      logger.error('Erreur lors de l\'initialisation du client Mistral:', error.message);
    }
  }

  /**
   * Analyse un email pour en extraire des informations structurées
   */
  async analyzeEmail(emailContent, subject = '') {
    try {
      await this.initialize();
      
      if (!this.initialized) {
        logger.warn('Client Mistral non initialisé - Analyse d\'email impossible');
        return {
          summary: 'Service non disponible',
          classification: 'indéterminé',
          requires_follow_up: false,
          is_compliance_related: false
        };
      }
      
      // Système et prompte pour l'analyse d'email
      const messages = [
        { 
          role: 'system', 
          content: 'Vous êtes un expert en analyse d\'emails dans le domaine de la construction.' 
        },
        { 
          role: 'user', 
          content: `Analysez cet email avec le sujet "${subject}":\n\n${emailContent}\n\nFournissez un JSON avec: summary, classification, requires_follow_up, is_compliance_related`
        }
      ];
      
      const response = await this.client.chat({
        model: this.model,
        messages: messages,
        temperature: this.temperature,
        max_tokens: this.maxTokens
      });
      
      try {
        return JSON.parse(response.choices[0].message.content);
      } catch (parseError) {
        logger.error('Erreur lors du parsing de la réponse JSON:', parseError.message);
        return {
          summary: emailContent.slice(0, 100) + '...',
          classification: 'indéterminé',
          requires_follow_up: false,
          is_compliance_related: false
        };
      }
    } catch (error) {
      logger.error('Erreur lors de l\'analyse de l\'email:', error.message);
      return {
        summary: 'Erreur du service',
        classification: 'indéterminé',
        requires_follow_up: false,
        is_compliance_related: false
      };
    }
  }

  /**
   * Génère un suivi pour un email qui nécessite une réponse
   */
  async generateFollowUp(emailContent, context = {}) {
    try {
      await this.initialize();
      
      if (!this.initialized) {
        return "Service non disponible. Veuillez configurer l'API Mistral.";
      }
      
      // Pour simplifier, nous utilisons juste un appel direct
      const response = await this.client.chat({
        model: this.model,
        messages: [
          { 
            role: 'system', 
            content: 'Vous êtes un assistant professionnel qui aide à rédiger des emails de suivi courtois.'
          },
          { 
            role: 'user', 
            content: `Rédigez un email de suivi pour ce message. Email original: ${emailContent}`
          }
        ],
        temperature: this.temperature,
        max_tokens: this.maxTokens
      });
      
      return response.choices[0].message.content;
    } catch (error) {
      logger.error('Erreur lors de la génération du suivi:', error.message);
      return "Service indisponible. Veuillez réessayer ultérieurement.";
    }
  }

  /**
   * Analyse des documents de conformité
   */
  async analyzeComplianceDocument(documentContent, documentType = 'général') {
    const systemPrompt = `Vous êtes un expert en conformité dans le secteur de la construction.
    Votre tâche est d'analyser des documents pour identifier les exigences de conformité et les risques potentiels.`;
    
    const prompt = `
    Type de document : ${documentType}
    
    Contenu du document :
    ${documentContent}
    
    Analysez ce document et fournissez les informations suivantes au format JSON :
    - summary : un résumé des points clés du document
    - compliance_requirements : un tableau des exigences de conformité identifiées
    - potential_risks : un tableau des risques potentiels identifiés
    - recommended_actions : un tableau d'actions recommandées
    `;

    const response = await this._callMistral(prompt, systemPrompt);
    
    try {
      return JSON.parse(response);
    } catch (error) {
      logger.error('Erreur lors du parsing de la réponse JSON:', error);
      return {
        summary: 'Analyse échouée',
        compliance_requirements: [],
        potential_risks: [],
        recommended_actions: []
      };
    }
  }

  /**
   * Identifie les corps de métier et suggère un calendrier de coordination
   */
  async suggestCoordination(projectContext) {
    const systemPrompt = `Vous êtes un expert en planification et coordination de chantiers de construction.
    Votre tâche est d'analyser les informations du projet et de suggérer un calendrier de coordination entre les différents corps de métier.`;
    
    const prompt = `
    Contexte du projet :
    ${JSON.stringify(projectContext, null, 2)}
    
    En vous basant sur les informations fournies, identifiez les corps de métier impliqués et suggérez un calendrier
    de coordination optimisé qui minimise les conflits et les temps d'attente. Incluez également des suggestions
    pour la résolution des problèmes potentiels. Formatez votre réponse en JSON avec les clés suivantes :
    - trades : un tableau des corps de métier identifiés
    - schedule : un tableau d'événements de coordination avec dates et participants
    - potential_conflicts : un tableau des conflits potentiels
    - recommendations : un tableau de recommandations pour optimiser la coordination
    `;

    const response = await this._callMistral(prompt, systemPrompt);
    
    try {
      return JSON.parse(response);
    } catch (error) {
      logger.error('Erreur lors du parsing de la réponse JSON:', error);
      return {
        trades: [],
        schedule: [],
        potential_conflicts: [],
        recommendations: []
      };
    }
  }

  /**
   * Génère un rapport de leçons apprises à partir des données du projet
   */
  async generateLessonsLearned(projectData) {
    const systemPrompt = `Vous êtes un expert en gestion de projets de construction.
    Votre tâche est d'analyser les données du projet et d'en extraire des leçons apprises utiles pour les futurs projets.`;
    
    const prompt = `
    Données du projet :
    ${JSON.stringify(projectData, null, 2)}
    
    Analysez ces données et générez un rapport de leçons apprises incluant :
    - un résumé des points forts du projet
    - un résumé des défis rencontrés
    - des leçons spécifiques pour chaque phase du projet
    - des recommandations pour les futurs projets
    
    Formatez votre réponse en JSON avec les clés suivantes :
    - strengths : un tableau des points forts
    - challenges : un tableau des défis
    - lessons_by_phase : un objet avec les phases comme clés et les leçons comme valeurs
    - recommendations : un tableau de recommandations
    `;

    const response = await this._callMistral(prompt, systemPrompt);
    
    try {
      return JSON.parse(response);
    } catch (error) {
      logger.error('Erreur lors du parsing de la réponse JSON:', error);
      return {
        strengths: [],
        challenges: [],
        lessons_by_phase: {},
        recommendations: []
      };
    }
  }
}

module.exports = new MistralAIClient(); 