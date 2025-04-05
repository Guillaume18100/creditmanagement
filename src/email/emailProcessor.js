const Imap = require('imap');
const { simpleParser } = require('mailparser');
const path = require('path');
const { Readable } = require('stream');
const config = require('../config');
const logger = require('../utils/logger');
const db = require('../database');
const mistralClient = require('../llm/mistral');
const awsConfig = require('../config/aws');

class EmailProcessor {
  constructor() {
    // Configuration IMAP
    this.imap = new Imap({
      user: config.email.user,
      password: config.email.password,
      host: config.email.server,
      port: config.email.port,
      tls: config.email.tls,
      tlsOptions: { rejectUnauthorized: false } // Pour la dev/test seulement - à sécuriser en production
    });

    // Configuration AWS S3 avec la nouvelle approche
    awsConfig.configureAWS();
    this.s3 = awsConfig.getS3();

    // Initialisation des gestionnaires d'événements
    this._initializeEventHandlers();
  }

  /**
   * Initialise les gestionnaires d'événements pour IMAP
   */
  _initializeEventHandlers() {
    this.imap.on('ready', () => {
      logger.info('Connexion IMAP établie');
      this._openInbox();
    });

    this.imap.on('error', (err) => {
      logger.error('Erreur IMAP:', err);
    });

    this.imap.on('end', () => {
      logger.info('Connexion IMAP terminée');
    });
  }

  /**
   * Ouvre la boîte de réception
   */
  _openInbox() {
    this.imap.openBox('INBOX', false, (err, box) => {
      if (err) {
        logger.error('Erreur lors de l\'ouverture de la boîte de réception:', err);
        return;
      }
      
      logger.info('Boîte de réception ouverte, recherche de nouveaux emails');
      this._fetchNewEmails();
    });
  }

  /**
   * Récupère les nouveaux emails
   */
  _fetchNewEmails() {
    // Recherche des emails non lus
    this.imap.search(['UNSEEN'], (err, results) => {
      if (err) {
        logger.error('Erreur lors de la recherche d\'emails:', err);
        return;
      }

      if (!results || results.length === 0) {
        logger.info('Aucun nouvel email trouvé');
        this.imap.end();
        return;
      }

      logger.info(`${results.length} nouveaux emails trouvés`);
      
      const fetch = this.imap.fetch(results, {
        bodies: [''],
        markSeen: true
      });

      fetch.on('message', (msg, seqno) => {
        logger.debug(`Traitement de l'email #${seqno}`);
        
        msg.on('body', (stream) => {
          this._parseEmail(stream, seqno);
        });
      });

      fetch.on('error', (err) => {
        logger.error('Erreur lors de la récupération des emails:', err);
      });

      fetch.on('end', () => {
        logger.info('Récupération des emails terminée');
        this.imap.end();
      });
    });
  }

  /**
   * Parse un email à partir de son flux
   */
  async _parseEmail(stream, seqno) {
    try {
      const parsedMail = await simpleParser(stream);
      logger.debug(`Email #${seqno} parsé avec succès`);
      
      // Traitement de l'email
      await this._processEmail(parsedMail, seqno);
    } catch (error) {
      logger.error(`Erreur lors du parsing de l'email #${seqno}:`, error);
    }
  }

  /**
   * Traite un email parsé
   */
  async _processEmail(parsedMail, seqno) {
    try {
      logger.info(`Traitement de l'email: ${parsedMail.subject}`);

      // Vérifier si l'email existe déjà
      const existingEmail = await db.query(
        'SELECT id FROM emails WHERE message_id = $1',
        [parsedMail.messageId]
      );

      if (existingEmail.rows.length > 0) {
        logger.info(`Email avec message_id ${parsedMail.messageId} déjà traité, ignoré`);
        return;
      }

      // Déterminer le projet associé (pour cet exemple, nous utiliserons le projet par défaut si existant)
      const project = await db.query('SELECT id FROM projects LIMIT 1');
      let projectId = null;
      
      if (project.rows.length > 0) {
        projectId = project.rows[0].id;
      } else {
        // Créer un projet par défaut si aucun n'existe
        const newProject = await db.query(
          'INSERT INTO projects (name, description, status) VALUES ($1, $2, $3) RETURNING id',
          ['Projet par défaut', 'Projet créé automatiquement', 'active']
        );
        projectId = newProject.rows[0].id;
        logger.info(`Nouveau projet créé avec ID: ${projectId}`);
      }

      // Analyse du contenu de l'email avec Mistral AI
      let emailAnalysis;
      try {
        emailAnalysis = await mistralClient.analyzeEmail(
          parsedMail.text || parsedMail.html || 'Contenu vide',
          parsedMail.subject || 'Sans sujet'
        );
        logger.debug('Analyse de l\'email effectuée avec succès');
      } catch (error) {
        logger.error('Erreur lors de l\'analyse de l\'email:', error);
        emailAnalysis = {
          summary: 'Analyse automatique échouée',
          classification: 'indéterminé',
          requires_follow_up: false,
          is_compliance_related: false
        };
      }

      // Insertion de l'email dans la base de données
      const emailInsert = await db.query(`
        INSERT INTO emails (
          project_id, message_id, parent_message_id, from_address, to_address, cc_address,
          subject, body_text, body_html, received_date, has_attachments, summary,
          classification, requires_follow_up, is_compliance_related
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
        RETURNING id
      `, [
        projectId,
        parsedMail.messageId,
        parsedMail.inReplyTo || null,
        parsedMail.from.text,
        Array.isArray(parsedMail.to) ? parsedMail.to.map(t => t.text) : [parsedMail.to.text],
        parsedMail.cc ? (Array.isArray(parsedMail.cc) ? parsedMail.cc.map(c => c.text) : [parsedMail.cc.text]) : [],
        parsedMail.subject || 'Sans sujet',
        parsedMail.text || null,
        parsedMail.html || null,
        parsedMail.date,
        parsedMail.attachments && parsedMail.attachments.length > 0,
        emailAnalysis.summary || 'Pas de résumé disponible',
        emailAnalysis.classification || 'indéterminé',
        emailAnalysis.requires_follow_up || false,
        emailAnalysis.is_compliance_related || false
      ]);

      const emailId = emailInsert.rows[0].id;
      logger.info(`Email inséré avec ID: ${emailId}`);

      // Traitement des pièces jointes si présentes
      if (parsedMail.attachments && parsedMail.attachments.length > 0) {
        await this._processAttachments(parsedMail.attachments, emailId, projectId);
      }

      // Traitement des tâches identifiées dans l'email
      if (emailAnalysis.tasks && emailAnalysis.tasks.length > 0) {
        await this._processTasks(emailAnalysis.tasks, emailId, projectId);
      }

      // Vérification des problèmes de conformité
      if (emailAnalysis.is_compliance_related) {
        await this._processComplianceIssue(emailAnalysis, emailId, projectId);
      }

      logger.info(`Email #${seqno} traité avec succès`);
    } catch (error) {
      logger.error(`Erreur lors du traitement de l'email #${seqno}:`, error);
    }
  }

  /**
   * Traite les pièces jointes d'un email
   */
  async _processAttachments(attachments, emailId, projectId) {
    logger.info(`Traitement de ${attachments.length} pièces jointes pour l'email ${emailId}`);

    for (const attachment of attachments) {
      try {
        // Générer un nom de fichier unique
        const fileExtension = path.extname(attachment.filename) || '';
        const uniqueFilename = `${projectId}/${emailId}/${Date.now()}_${path.basename(attachment.filename, fileExtension)}${fileExtension}`;
        
        // Essayer de stocker dans S3 si configuré
        let s3Uploaded = false;
        let s3Location = null;
        
        try {
          // Uploader le fichier vers S3
          const uploadParams = {
            Bucket: config.aws.s3Bucket,
            Key: uniqueFilename,
            Body: attachment.content instanceof Readable ? attachment.content : Buffer.from(attachment.content),
            ContentType: attachment.contentType
          };

          const s3Result = await this.s3.upload(uploadParams).promise();
          s3Location = s3Result.Location;
          s3Uploaded = true;
          logger.debug(`Pièce jointe uploadée vers S3: ${s3Location}`);
        } catch (s3Error) {
          // Gestion de l'erreur S3
          logger.error(`Erreur lors de l'upload S3 pour ${attachment.filename}:`, s3Error.message);
          s3Uploaded = false;
        }

        // Extraire le texte si possible pour les fichiers texte/PDF/DOC
        let textContent = null;
        if (attachment.contentType && 
            (attachment.contentType.includes('text') || 
             attachment.contentType.includes('pdf') || 
             attachment.contentType.includes('msword') || 
             attachment.contentType.includes('officedocument'))) {
          // Pour les fichiers texte, on peut directement utiliser le contenu
          if (attachment.contentType.includes('text')) {
            textContent = attachment.content.toString('utf-8');
          }
          // Pour les PDF/DOC, il faudrait utiliser un service d'extraction de texte
          // Ce code est un placeholder, à implémenter avec un service approprié
        }

        // Insérer l'attachement dans la base de données
        await db.query(`
          INSERT INTO attachments (
            email_id, filename, content_type, size, s3_key, text_content
          ) VALUES ($1, $2, $3, $4, $5, $6)
        `, [
          emailId,
          attachment.filename,
          attachment.contentType,
          attachment.size,
          s3Uploaded ? uniqueFilename : null,
          textContent
        ]);

        logger.info(`Pièce jointe ${attachment.filename} traitée et enregistrée. S3: ${s3Uploaded ? 'Oui' : 'Non'}`);
      } catch (error) {
        logger.error(`Erreur lors du traitement de la pièce jointe ${attachment.filename}:`, error.message);
      }
    }
  }

  /**
   * Traite les tâches identifiées dans un email
   */
  async _processTasks(tasks, emailId, projectId) {
    logger.info(`Traitement de ${tasks.length} tâches pour l'email ${emailId}`);

    for (const task of tasks) {
      try {
        // Trouver le corps de métier associé
        let tradeId = null;
        if (task.trade) {
          const tradeResult = await db.query('SELECT id FROM trades WHERE name ILIKE $1', [`%${task.trade}%`]);
          if (tradeResult.rows.length > 0) {
            tradeId = tradeResult.rows[0].id;
          }
        }

        // Insérer la tâche dans la base de données
        await db.query(`
          INSERT INTO tasks (
            project_id, trade_id, name, description, 
            planned_start_date, planned_end_date, status, source_email_id
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        `, [
          projectId,
          tradeId,
          task.name || 'Tâche sans nom',
          task.description || null,
          task.start_date || null,
          task.end_date || null,
          'planned',
          emailId
        ]);

        logger.info(`Tâche "${task.name}" enregistrée avec succès`);
      } catch (error) {
        logger.error(`Erreur lors de l'enregistrement de la tâche:`, error);
      }
    }
  }

  /**
   * Traite un problème de conformité détecté dans un email
   */
  async _processComplianceIssue(emailAnalysis, emailId, projectId) {
    logger.info(`Traitement d'un problème de conformité pour l'email ${emailId}`);

    try {
      await db.query(`
        INSERT INTO compliance_issues (
          project_id, email_id, issue_type, description, severity, status
        ) VALUES ($1, $2, $3, $4, $5, $6)
      `, [
        projectId,
        emailId,
        emailAnalysis.compliance_type || 'indéterminé',
        emailAnalysis.compliance_description || emailAnalysis.summary,
        'medium', // Sévérité par défaut
        'detected'
      ]);

      logger.info('Problème de conformité enregistré avec succès');
    } catch (error) {
      logger.error('Erreur lors de l\'enregistrement du problème de conformité:', error);
    }
  }

  /**
   * Démarre le processus de récupération d'emails
   */
  start() {
    logger.info('Démarrage du processus de récupération d\'emails');
    this.imap.connect();
  }
}

module.exports = new EmailProcessor(); 