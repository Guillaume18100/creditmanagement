/**
 * Script de configuration et d'initialisation pour SiteManager GPT
 * Ce script initialise la base de données et crée les structures nécessaires
 */

require('dotenv').config();
const db = require('./database');
const logger = require('./utils/logger');
const path = require('path');
const fs = require('fs');

async function setup() {
  try {
    logger.info('Démarrage de la configuration de SiteManager GPT...');

    // Créer les dossiers nécessaires s'ils n'existent pas
    const folders = [
      'logs',
      'dashboard/build',
      'data'
    ];

    for (const folder of folders) {
      const folderPath = path.join(process.cwd(), folder);
      if (!fs.existsSync(folderPath)) {
        fs.mkdirSync(folderPath, { recursive: true });
        logger.info(`Dossier créé: ${folder}`);
      }
    }

    // Connexion à la base de données
    let dbConnected = false;
    try {
      await db.connect();
      logger.info('Connexion à la base de données établie');
      dbConnected = true;
    } catch (dbError) {
      logger.error('Erreur lors de la connexion à la base de données:', dbError.message);
      logger.warn('L\'application fonctionnera sans base de données - Certaines fonctionnalités seront limitées');
    }

    // Si la base de données est connectée, initialiser le schéma
    if (dbConnected) {
      try {
        await db.initDatabase();
        logger.info('Schéma de base de données initialisé');
        
        // Créer un projet de démonstration
        logger.info('Création d\'un projet de démonstration...');
        
        // Vérifions d'abord si un projet existe déjà
        const existingProjects = await db.query('SELECT * FROM projects LIMIT 1');
        
        if (existingProjects.rows.length === 0) {
          // Aucun projet existant, créons-en un
          const projectResult = await db.query(
            'INSERT INTO projects (name, description, start_date, end_date, status) VALUES ($1, $2, $3, $4, $5) RETURNING id',
            [
              'Projet Démo',
              'Projet de démonstration pour SiteManager GPT',
              new Date(), // Date de début = aujourd'hui
              new Date(new Date().setMonth(new Date().getMonth() + 6)), // Date de fin = dans 6 mois
              'active'
            ]
          );
          
          logger.info(`Projet de démonstration créé avec l'ID: ${projectResult.rows[0].id}`);
        } else {
          logger.info('Un projet existe déjà dans la base de données');
        }
      } catch (dbSchemaError) {
        logger.error('Erreur lors de l\'initialisation du schéma de la base de données:', dbSchemaError.message);
      }
    }

    // Vérification de la configuration AWS
    logger.info('Vérification de la configuration AWS...');
    
    // On évite d'importer directement aws-check pour éviter des erreurs
    // si AWS n'est pas correctement configuré
    try {
      const { checkAWSConnection } = require('./utils/aws-check');
      const awsStatus = await checkAWSConnection();
      if (awsStatus) {
        logger.info('✅ Configuration AWS validée');
      } else {
        logger.warn('⚠️ Configuration AWS invalide ou incomplète - Stockage S3 désactivé');
      }
    } catch (awsError) {
      logger.error('❌ Erreur lors de la vérification AWS:', awsError.message);
      logger.warn('⚠️ L\'application fonctionnera sans accès AWS');
    }

    logger.info('✅ Configuration terminée avec succès!');
    return true;
  } catch (error) {
    logger.error('❌ Erreur lors de la configuration:', error.message);
    return false;
  } finally {
    // Fermeture de la connexion à la base de données si elle était ouverte
    try {
      await db.disconnect();
    } catch (error) {
      // Ignorer les erreurs lors de la déconnexion
    }
  }
}

// Exécution du script si lancé directement
if (require.main === module) {
  setup()
    .then(success => {
      if (success) {
        logger.info('▶️ Vous pouvez maintenant démarrer l\'application avec: npm start');
        process.exit(0);
      } else {
        logger.error('❌ Configuration échouée');
        process.exit(1);
      }
    })
    .catch(error => {
      logger.error('Erreur non gérée lors de la configuration:', error.message);
      process.exit(1);
    });
}

module.exports = { setup }; 