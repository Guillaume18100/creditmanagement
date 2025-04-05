/**
 * Configuration du système SiteManager GPT
 * Ce fichier centralise toutes les configurations de l'application
 */
require('dotenv').config();

const path = require('path');

const config = {
  // Configuration de l'environnement
  env: process.env.NODE_ENV || 'development',
  port: process.env.PORT || 3000,

  // Configuration de la base de données PostgreSQL
  db: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    name: process.env.DB_NAME || 'sitemanager',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'password'
  },

  // Configuration du serveur de mail
  email: {
    server: process.env.EMAIL_SERVER || 'imap.example.com',
    port: parseInt(process.env.EMAIL_PORT || '993', 10),
    user: process.env.EMAIL_USER || 'sitemanager@example.com',
    password: process.env.EMAIL_PASSWORD || 'password',
    tls: process.env.EMAIL_TLS === 'true' || true,
    // Intervalle de vérification des nouveaux emails (en millisecondes)
    checkInterval: parseInt(process.env.EMAIL_CHECK_INTERVAL || '300000', 10)
  },

  // Configuration de l'IA : Mistral
  mistral: {
    apiKey: process.env.MISTRAL_API_KEY,
    // Modèle à utiliser par défaut
    defaultModel: 'mistral-large-latest',
    // Température pour les réponses (0 = déterministe, 1 = créatif)
    temperature: 0.5,
    // Nombre maximum de tokens en sortie
    maxTokens: 1000
  },

  // Configuration de WaterfLAI
  waterflai: {
    apiKey: process.env.WATERFLAI_API_KEY,
    baseUrl: process.env.WATERFLAI_BASE_URL || 'https://api.waterflai.com'
  },

  // Configuration AWS
  aws: {
    region: process.env.AWS_DEFAULT_REGION || 'us-west-2',
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    sessionToken: process.env.AWS_SESSION_TOKEN,
    s3Bucket: process.env.S3_BUCKET_NAME || 'sitemanager-attachments'
  },

  // Configuration des chemins du système de fichiers
  paths: {
    root: path.resolve(__dirname, '../..'),
    src: path.resolve(__dirname, '..'),
    logs: path.resolve(__dirname, '../../logs'),
    data: path.resolve(__dirname, '../../data'),
    public: path.resolve(__dirname, '../../public'),
    dashboard: path.resolve(__dirname, '../../dashboard')
  },

  // Configuration de la journalisation
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    file: path.resolve(__dirname, '../../logs/sitemanager.log'),
    maxSize: '20m',
    maxFiles: '14d'
  },

  // Paramètres relatifs aux agents
  agents: {
    // Délai avant de considérer qu'un email nécessite un suivi (en jours)
    followUpDelayDays: parseInt(process.env.FOLLOW_UP_DELAY_DAYS || '3', 10),
    // Nombre maximal de tentatives de suivi
    maxFollowUpAttempts: parseInt(process.env.MAX_FOLLOW_UP_ATTEMPTS || '3', 10)
  }
};

module.exports = config; 