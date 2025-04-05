const AWS = require('aws-sdk');
const logger = require('../utils/logger');

// Configuration AWS avec les variables d'environnement ou les valeurs par défaut fournies
module.exports = {
  // Fonction pour configurer AWS avec les informations d'accès
  configureAWS: () => {
    try {
      // Utiliser les variables d'environnement si disponibles
      const awsConfig = {
        region: process.env.AWS_DEFAULT_REGION || 'us-west-2'
      };

      // Ajouter les identifiants uniquement s'ils sont définis
      if (process.env.AWS_ACCESS_KEY_ID) {
        awsConfig.accessKeyId = process.env.AWS_ACCESS_KEY_ID;
      }

      if (process.env.AWS_SECRET_ACCESS_KEY) {
        awsConfig.secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
      }

      if (process.env.AWS_SESSION_TOKEN) {
        awsConfig.sessionToken = process.env.AWS_SESSION_TOKEN;
      }

      // Configurer AWS SDK avec les informations d'identification
      AWS.config.update(awsConfig);
      
      logger.debug('Configuration AWS chargée');
      
      // Retourner la configuration pour usage externe si nécessaire
      return awsConfig;
    } catch (error) {
      logger.error('Erreur lors de la configuration AWS:', error);
      throw error;
    }
  },

  // Fonction pour obtenir une instance S3
  getS3: () => {
    return new AWS.S3({
      apiVersion: '2006-03-01'
    });
  },

  // Fonction pour obtenir une instance DynamoDB
  getDynamoDB: () => {
    return new AWS.DynamoDB.DocumentClient({
      apiVersion: '2012-08-10'
    });
  },

  // Fonction pour obtenir une instance SQS
  getSQS: () => {
    return new AWS.SQS({
      apiVersion: '2012-11-05'
    });
  },

  // Fonction pour obtenir une instance Lambda
  getLambda: () => {
    return new AWS.Lambda({
      apiVersion: '2015-03-31'
    });
  }
}; 