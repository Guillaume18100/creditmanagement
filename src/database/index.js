const { Pool } = require('pg');
const config = require('../config');
const logger = require('../utils/logger');

// Création du pool de connexion PostgreSQL
const pool = new Pool({
  host: config.db.host,
  port: config.db.port,
  user: config.db.user,
  password: config.db.password,
  database: config.db.name,
  max: 20, // Nombre maximum de clients dans le pool
  idleTimeoutMillis: 30000, // Temps d'inactivité avant de fermer un client
  connectionTimeoutMillis: 2000, // Temps d'attente pour une connexion
});

// Vérification de la connexion
pool.on('connect', () => {
  logger.info('Base de données PostgreSQL connectée');
});

pool.on('error', (err) => {
  logger.error('Erreur de connexion PostgreSQL:', err);
});

/**
 * Établit la connexion à la base de données
 */
async function connect() {
  try {
    const client = await pool.connect();
    client.release();
    logger.info('Connexion à la base de données PostgreSQL établie');
    return true;
  } catch (error) {
    logger.error('Erreur lors de la connexion à la base de données:', error);
    throw error;
  }
}

/**
 * Ferme la connexion à la base de données
 */
async function disconnect() {
  try {
    if (pool) {
      await pool.end();
      logger.info('Connexion à la base de données PostgreSQL fermée');
    }
    return true;
  } catch (error) {
    logger.error('Erreur lors de la fermeture de la connexion à la base de données:', error);
    throw error;
  }
}

/**
 * Initialisation des tables de la base de données
 */
async function initDatabase() {
  const client = await pool.connect();
  try {
    logger.info('Initialisation de la base de données...');
    
    // Création des tables
    await client.query(`
      CREATE TABLE IF NOT EXISTS projects (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        start_date DATE,
        end_date DATE,
        status VARCHAR(50) DEFAULT 'active',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS emails (
        id SERIAL PRIMARY KEY,
        project_id INTEGER REFERENCES projects(id),
        message_id VARCHAR(255) UNIQUE,
        parent_message_id VARCHAR(255),
        from_address VARCHAR(255) NOT NULL,
        to_address TEXT[] NOT NULL,
        cc_address TEXT[],
        subject VARCHAR(500),
        body_text TEXT,
        body_html TEXT,
        received_date TIMESTAMP,
        has_attachments BOOLEAN DEFAULT FALSE,
        summary TEXT,
        classification VARCHAR(50),
        requires_follow_up BOOLEAN DEFAULT FALSE,
        follow_up_status VARCHAR(50),
        follow_up_date TIMESTAMP,
        is_compliance_related BOOLEAN DEFAULT FALSE,
        vector_embedding JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS attachments (
        id SERIAL PRIMARY KEY,
        email_id INTEGER REFERENCES emails(id),
        filename VARCHAR(255),
        content_type VARCHAR(100),
        size INTEGER,
        s3_key VARCHAR(500),
        text_content TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS trades (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) UNIQUE NOT NULL,
        description TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS tasks (
        id SERIAL PRIMARY KEY,
        project_id INTEGER REFERENCES projects(id),
        trade_id INTEGER REFERENCES trades(id),
        name VARCHAR(255) NOT NULL,
        description TEXT,
        planned_start_date DATE,
        planned_end_date DATE,
        actual_start_date DATE,
        actual_end_date DATE,
        status VARCHAR(50) DEFAULT 'planned',
        depends_on INTEGER[] DEFAULT array[]::integer[],
        source_email_id INTEGER REFERENCES emails(id),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS compliance_issues (
        id SERIAL PRIMARY KEY,
        project_id INTEGER REFERENCES projects(id),
        email_id INTEGER REFERENCES emails(id),
        issue_type VARCHAR(100),
        description TEXT,
        detected_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        severity VARCHAR(50),
        status VARCHAR(50) DEFAULT 'detected',
        related_emails INTEGER[] DEFAULT array[]::integer[],
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS lessons_learned (
        id SERIAL PRIMARY KEY,
        project_id INTEGER REFERENCES projects(id),
        category VARCHAR(100),
        title VARCHAR(255),
        description TEXT,
        root_cause TEXT,
        solution TEXT,
        impact VARCHAR(50),
        related_emails INTEGER[] DEFAULT array[]::integer[],
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Insertion de quelques corps de métier de base
    const defaultTrades = [
      'Terrassement', 
      'Gros œuvre', 
      'Plomberie', 
      'Électricité', 
      'Menuiserie',
      'Peinture',
      'Couverture',
      'Façade',
      'Chauffage',
      'Climatisation'
    ];

    for (const trade of defaultTrades) {
      await client.query(
        'INSERT INTO trades (name) VALUES ($1) ON CONFLICT (name) DO NOTHING', 
        [trade]
      );
    }

    logger.info('Base de données initialisée avec succès');
    return true;
  } catch (error) {
    logger.error('Erreur lors de l\'initialisation de la base de données:', error);
    throw error;
  } finally {
    client.release();
  }
}

module.exports = {
  query: (text, params) => pool.query(text, params),
  getClient: () => pool.connect(),
  connect,
  disconnect,
  initDatabase
}; 