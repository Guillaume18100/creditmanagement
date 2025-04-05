const express = require('express');
const router = express.Router();
const db = require('../database');
const logger = require('../utils/logger');
const mistralClient = require('../llm/mistral');
const coordinationAgent = require('../agents/coordinationAgent');
const emailProcessor = require('../email/emailProcessor');

// Route API - Home
router.get('/', (req, res) => {
  res.json({
    status: 'success',
    message: 'API SiteManager GPT opérationnelle',
    version: '1.0.0'
  });
});

// Liste des projets
router.get('/projects', async (req, res) => {
  try {
    const result = await db.query(`
      SELECT p.*, 
        (SELECT COUNT(*) FROM emails WHERE project_id = p.id) as email_count,
        (SELECT COUNT(*) FROM tasks WHERE project_id = p.id) as task_count
      FROM projects p
      ORDER BY p.created_at DESC
    `);
    
    res.json({
      status: 'success',
      data: result.rows
    });
  } catch (error) {
    logger.error('Erreur lors de la récupération des projets:', error);
    res.status(500).json({
      status: 'error',
      message: 'Erreur lors de la récupération des projets',
      error: error.message
    });
  }
});

// Détails d'un projet
router.get('/projects/:id', async (req, res) => {
  try {
    const projectId = req.params.id;
    
    const projectResult = await db.query(`
      SELECT * FROM projects WHERE id = $1
    `, [projectId]);
    
    if (projectResult.rows.length === 0) {
      return res.status(404).json({
        status: 'error',
        message: 'Projet non trouvé'
      });
    }
    
    // Récupérer les statistiques du projet
    const statsResult = await db.query(`
      SELECT 
        (SELECT COUNT(*) FROM emails WHERE project_id = $1) as email_count,
        (SELECT COUNT(*) FROM tasks WHERE project_id = $1) as task_count,
        (SELECT COUNT(*) FROM compliance_issues WHERE project_id = $1) as compliance_issues_count,
        (SELECT COUNT(*) FROM tasks WHERE project_id = $1 AND status = 'completed') as completed_tasks_count,
        (SELECT COUNT(*) FROM tasks WHERE project_id = $1 AND status = 'in_progress') as in_progress_tasks_count
    `, [projectId]);
    
    // Construire la réponse
    const projectData = {
      ...projectResult.rows[0],
      stats: statsResult.rows[0]
    };
    
    res.json({
      status: 'success',
      data: projectData
    });
  } catch (error) {
    logger.error(`Erreur lors de la récupération du projet ${req.params.id}:`, error);
    res.status(500).json({
      status: 'error',
      message: 'Erreur lors de la récupération du projet',
      error: error.message
    });
  }
});

// Création d'un projet
router.post('/projects', async (req, res) => {
  try {
    const { name, description, start_date, end_date } = req.body;
    
    if (!name) {
      return res.status(400).json({
        status: 'error',
        message: 'Le nom du projet est obligatoire'
      });
    }
    
    const result = await db.query(`
      INSERT INTO projects (name, description, start_date, end_date, status)
      VALUES ($1, $2, $3, $4, 'active')
      RETURNING *
    `, [name, description, start_date, end_date]);
    
    res.status(201).json({
      status: 'success',
      data: result.rows[0],
      message: 'Projet créé avec succès'
    });
  } catch (error) {
    logger.error('Erreur lors de la création du projet:', error);
    res.status(500).json({
      status: 'error',
      message: 'Erreur lors de la création du projet',
      error: error.message
    });
  }
});

// Liste des emails d'un projet
router.get('/projects/:id/emails', async (req, res) => {
  try {
    const projectId = req.params.id;
    
    const result = await db.query(`
      SELECT * FROM emails
      WHERE project_id = $1
      ORDER BY received_date DESC
    `, [projectId]);
    
    res.json({
      status: 'success',
      data: result.rows
    });
  } catch (error) {
    logger.error(`Erreur lors de la récupération des emails du projet ${req.params.id}:`, error);
    res.status(500).json({
      status: 'error',
      message: 'Erreur lors de la récupération des emails',
      error: error.message
    });
  }
});

// Liste des tâches d'un projet
router.get('/projects/:id/tasks', async (req, res) => {
  try {
    const projectId = req.params.id;
    
    const result = await db.query(`
      SELECT t.*, tr.name as trade_name
      FROM tasks t
      LEFT JOIN trades tr ON t.trade_id = tr.id
      WHERE t.project_id = $1
      ORDER BY t.planned_start_date ASC NULLS LAST
    `, [projectId]);
    
    res.json({
      status: 'success',
      data: result.rows
    });
  } catch (error) {
    logger.error(`Erreur lors de la récupération des tâches du projet ${req.params.id}:`, error);
    res.status(500).json({
      status: 'error',
      message: 'Erreur lors de la récupération des tâches',
      error: error.message
    });
  }
});

// Rapport de coordination d'un projet
router.get('/projects/:id/coordination-report', async (req, res) => {
  try {
    const projectId = req.params.id;
    
    const report = await coordinationAgent.generateCoordinationReport(projectId);
    
    if (!report) {
      return res.status(404).json({
        status: 'error',
        message: 'Impossible de générer le rapport de coordination'
      });
    }
    
    res.json({
      status: 'success',
      data: report
    });
  } catch (error) {
    logger.error(`Erreur lors de la génération du rapport de coordination pour le projet ${req.params.id}:`, error);
    res.status(500).json({
      status: 'error',
      message: 'Erreur lors de la génération du rapport de coordination',
      error: error.message
    });
  }
});

// Liste des corps de métiers
router.get('/trades', async (req, res) => {
  try {
    const result = await db.query(`
      SELECT * FROM trades
      ORDER BY name ASC
    `);
    
    res.json({
      status: 'success',
      data: result.rows
    });
  } catch (error) {
    logger.error('Erreur lors de la récupération des corps de métiers:', error);
    res.status(500).json({
      status: 'error',
      message: 'Erreur lors de la récupération des corps de métiers',
      error: error.message
    });
  }
});

// Trigger de récupération des emails
router.post('/trigger-email-fetch', async (req, res) => {
  try {
    // Lancer la récupération des emails de façon asynchrone
    emailProcessor.start();
    
    res.json({
      status: 'success',
      message: 'Récupération des emails démarrée'
    });
  } catch (error) {
    logger.error('Erreur lors du démarrage de la récupération des emails:', error);
    res.status(500).json({
      status: 'error',
      message: 'Erreur lors du démarrage de la récupération des emails',
      error: error.message
    });
  }
});

// Analyse de texte ad-hoc avec Mistral
router.post('/analyze-text', async (req, res) => {
  try {
    const { text, context } = req.body;
    
    if (!text) {
      return res.status(400).json({
        status: 'error',
        message: 'Le texte à analyser est obligatoire'
      });
    }
    
    const prompt = `
Analyse ce texte ${context ? `dans le contexte de "${context}"` : ''}:

${text}

Fournis une analyse détaillée incluant:
1. Résumé concis
2. Points clés
3. Actions requises
4. Risques potentiels
5. Recommandations
`;
    
    const analysis = await mistralClient.generateText(prompt, {
      temperature: 0.3,
      max_tokens: 1500
    });
    
    res.json({
      status: 'success',
      data: {
        analysis
      }
    });
  } catch (error) {
    logger.error('Erreur lors de l\'analyse du texte:', error);
    res.status(500).json({
      status: 'error',
      message: 'Erreur lors de l\'analyse du texte',
      error: error.message
    });
  }
});

// Recherche contextuelle dans les emails
router.post('/search-emails', async (req, res) => {
  try {
    const { query, projectId } = req.body;
    
    if (!query) {
      return res.status(400).json({
        status: 'error',
        message: 'La requête de recherche est obligatoire'
      });
    }
    
    // Pour une vraie implémentation, il faudrait utiliser une base de données vectorielle
    // Ici on fait une recherche simple dans la base de données
    const queryParams = [
      `%${query}%`,
      `%${query}%`,
      `%${query}%`
    ];
    
    let sqlQuery = `
      SELECT e.*, p.name as project_name
      FROM emails e
      JOIN projects p ON e.project_id = p.id
      WHERE (e.subject ILIKE $1 OR e.body_text ILIKE $2 OR e.summary ILIKE $3)
    `;
    
    if (projectId) {
      sqlQuery += ` AND e.project_id = $4`;
      queryParams.push(projectId);
    }
    
    sqlQuery += ` ORDER BY e.received_date DESC LIMIT 20`;
    
    const result = await db.query(sqlQuery, queryParams);
    
    res.json({
      status: 'success',
      data: result.rows,
      count: result.rows.length
    });
  } catch (error) {
    logger.error('Erreur lors de la recherche d\'emails:', error);
    res.status(500).json({
      status: 'error',
      message: 'Erreur lors de la recherche d\'emails',
      error: error.message
    });
  }
});

module.exports = router; 