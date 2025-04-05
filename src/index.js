/**
 * SiteManager GPT - Point d'entrée principal de l'application
 * Ce fichier initialise l'application, configure les routes et démarre le serveur
 */

// Charger les variables d'environnement
require('dotenv').config();

// Importations des modules
const express = require('express');
const path = require('path');
const fs = require('fs');
const config = require('./config');
const logger = require('./utils/logger');

// Création de l'application Express
const app = express();
const PORT = config.port;

// Middleware pour le parsing du JSON et des URL encoded
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// S'assurer que les dossiers nécessaires existent
const requiredDirs = ['logs', 'dashboard/build', 'data'];
for (const dir of requiredDirs) {
  const dirPath = path.join(__dirname, '..', dir);
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
    logger.info(`Répertoire créé: ${dir}`);
  }
}

// Servir les fichiers statiques du dashboard
app.use(express.static(path.join(__dirname, '../dashboard/build')));

// Route pour servir le dashboard
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../dashboard/build/index.html'));
});

// API de diagnostic
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    version: '1.0.0',
    environment: config.env,
    timestamp: new Date().toISOString()
  });
});

// Route API principale - on n'importe les routes que si nécessaire
app.get('/api/info', (req, res) => {
  res.json({
    name: 'SiteManager GPT',
    description: 'Assistant IA pour la gestion de chantiers de construction',
    services: {
      database: false,
      mistral: false,
      waterflai: false,
      aws: false
    }
  });
});

// Démarrage du serveur
app.listen(PORT, () => {
  logger.info(`Serveur SiteManager GPT démarré sur le port ${PORT}`);
  logger.info(`Environnement: ${config.env}`);
  logger.info(`Dashboard disponible sur http://localhost:${PORT}`);
  
  // Initialisation des composants en arrière-plan pour ne pas bloquer le démarrage
  initComponents().catch(error => {
    logger.error('Erreur lors de l\'initialisation des composants:', error.message);
  });
});

// Initialisation asynchrone des différents composants
async function initComponents() {
  try {
    // Initialisation de la base de données si nécessaire
    try {
      const db = require('./database');
      await db.connect();
      logger.info('✅ Base de données connectée');
      
      // Initialiser les routes API une fois la DB connectée
      const apiRoutes = require('./routes/api');
      app.use('/api', apiRoutes);
    } catch (dbError) {
      logger.error('❌ Erreur de connexion à la base de données:', dbError.message);
    }
    
    // Initialisation AWS si possible
    try {
      const awsConfig = require('./config/aws');
      awsConfig.configureAWS();
      logger.info('✅ Configuration AWS chargée');
    } catch (awsError) {
      logger.error('❌ Erreur de configuration AWS:', awsError.message);
    }
    
    // Démarrage des agents en arrière-plan après un délai
    setTimeout(() => {
      try {
        // Essai de démarrage des agents
        const emailProcessor = require('./email/emailProcessor');
        const followUpAgent = require('./agents/followUpAgent');
        const coordinationAgent = require('./agents/coordinationAgent');
        
        // Démarrage du processeur d'emails
        try {
          emailProcessor.start();
          logger.info('✅ Processeur d\'emails démarré');
        } catch (emailError) {
          logger.error('❌ Erreur de démarrage du processeur d\'emails:', emailError.message);
        }
        
        // Démarrage de l'agent de suivi
        try {
          followUpAgent.start();
          logger.info('✅ Agent de suivi démarré');
        } catch (followUpError) {
          logger.error('❌ Erreur de démarrage de l\'agent de suivi:', followUpError.message);
        }
        
        // Démarrage de l'agent de coordination
        try {
          coordinationAgent.start();
          logger.info('✅ Agent de coordination démarré');
        } catch (coordError) {
          logger.error('❌ Erreur de démarrage de l\'agent de coordination:', coordError.message);
        }
      } catch (agentError) {
        logger.error('❌ Erreur lors du chargement des agents:', agentError.message);
      }
    }, 5000); // Attendre 5 secondes avant de démarrer les agents
    
  } catch (error) {
    logger.error('❌ Erreur d\'initialisation globale:', error.message);
  }
}

// Gestion des erreurs non capturées
process.on('uncaughtException', (error) => {
  logger.error('Erreur non capturée:', error.message);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Promesse rejetée non gérée:', reason);
});

// Gestion de la terminaison propre
process.on('SIGINT', async () => {
  logger.info('Application en cours d\'arrêt...');
  
  try {
    // Fermeture de la connexion à la base de données
    const db = require('./database');
    await db.disconnect().catch(() => {});
    logger.info('Connexion à la base de données fermée');
  } catch (error) {
    // Ignorer les erreurs lors de l'arrêt
  }
  
  process.exit(0);
}); 