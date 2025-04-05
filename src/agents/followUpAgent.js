const nodemailer = require('nodemailer');
const config = require('../config');
const logger = require('../utils/logger');
const db = require('../database');
const mistralClient = require('../llm/mistral');

class FollowUpAgent {
  constructor() {
    // Configuration du client email (SMTP)
    this.transporter = nodemailer.createTransport({
      host: config.email.server,
      port: 587, // Port standard pour SMTP avec TLS
      secure: false, // true pour 465, false pour les autres ports
      auth: {
        user: config.email.user,
        pass: config.email.password
      }
    });

    // Intervalle de vérification en millisecondes (par défaut: 24h)
    this.checkInterval = 24 * 60 * 60 * 1000;
    
    // Délai avant relance en jours
    this.followUpDelayDays = config.agents.followUpDelayDays;
  }

  /**
   * Démarre l'agent de relance
   */
  start() {
    logger.info('Agent de relance démarré');
    
    // Exécution immédiate puis programmation périodique
    this.checkForPendingFollowUps();
    
    // Planification des vérifications régulières
    setInterval(() => {
      this.checkForPendingFollowUps();
    }, this.checkInterval);
  }

  /**
   * Vérifie les emails nécessitant une relance
   */
  async checkForPendingFollowUps() {
    logger.info('Vérification des emails nécessitant une relance...');
    
    try {
      // Calculer la date limite pour les relances
      const followUpDate = new Date();
      followUpDate.setDate(followUpDate.getDate() - this.followUpDelayDays);
      
      // Requête pour trouver les emails nécessitant une relance
      const result = await db.query(`
        SELECT e.id, e.subject, e.body_text, e.from_address, e.to_address, e.received_date, 
               e.follow_up_status, p.id as project_id
        FROM emails e
        JOIN projects p ON e.project_id = p.id
        WHERE e.requires_follow_up = true
          AND (e.follow_up_status IS NULL OR e.follow_up_status = 'pending')
          AND e.received_date < $1
          AND NOT EXISTS (
            -- Vérifier si une réponse a été reçue
            SELECT 1 FROM emails reply
            WHERE reply.parent_message_id = e.message_id
          )
        ORDER BY e.received_date ASC
      `, [followUpDate.toISOString()]);
      
      logger.info(`${result.rows.length} emails nécessitent une relance`);
      
      // Traiter chaque email nécessitant une relance
      for (const email of result.rows) {
        await this.processFollowUp(email);
      }
    } catch (error) {
      logger.error('Erreur lors de la vérification des relances:', error);
    }
  }

  /**
   * Traite un email nécessitant une relance
   */
  async processFollowUp(email) {
    logger.info(`Traitement de la relance pour l'email ID ${email.id}: ${email.subject}`);
    
    try {
      // Calculer le nombre de jours depuis l'email original
      const daysSinceOriginal = Math.floor(
        (new Date() - new Date(email.received_date)) / (1000 * 60 * 60 * 24)
      );
      
      // Vérifier s'il existe déjà des relances pour cet email
      const followUpsResult = await db.query(`
        SELECT COUNT(*) as follow_up_count
        FROM emails
        WHERE subject LIKE $1 AND body_text LIKE $2
      `, [`Re: ${email.subject}%`, `%relance%${email.id}%`]);
      
      const followUpCount = parseInt(followUpsResult.rows[0].follow_up_count) || 0;
      
      // Si trop de relances ont déjà été envoyées, escalader au chef de projet
      if (followUpCount >= 2) {
        await this.escalateToManager(email, followUpCount);
        return;
      }
      
      // Générer l'email de relance
      const toAddress = Array.isArray(email.to_address) ? email.to_address[0] : email.to_address;
      
      const followUpContent = await mistralClient.generateFollowUpEmail(
        email.body_text,
        email.subject,
        toAddress,
        daysSinceOriginal
      );
      
      // Envoyer l'email de relance
      const mailOptions = {
        from: config.email.user,
        to: toAddress,
        subject: `Re: ${email.subject}`,
        text: `${followUpContent}\n\n[Relance automatique - Référence: ${email.id}]`,
        html: `<div>${followUpContent.replace(/\n/g, '<br>')}</div><p><small>[Relance automatique - Référence: ${email.id}]</small></p>`
      };
      
      await this.transporter.sendMail(mailOptions);
      logger.info(`Email de relance envoyé à ${toAddress}`);
      
      // Mettre à jour le statut de suivi dans la base de données
      await db.query(`
        UPDATE emails
        SET follow_up_status = $1, follow_up_date = CURRENT_TIMESTAMP
        WHERE id = $2
      `, [
        followUpCount === 0 ? 'first_reminder_sent' : 'second_reminder_sent',
        email.id
      ]);
      
      logger.info(`Statut de relance mis à jour pour l'email ID ${email.id}`);
    } catch (error) {
      logger.error(`Erreur lors du traitement de la relance pour l'email ID ${email.id}:`, error);
    }
  }

  /**
   * Escalade au chef de projet après plusieurs relances sans réponse
   */
  async escalateToManager(email, followUpCount) {
    logger.info(`Escalade au chef de projet pour l'email ID ${email.id} après ${followUpCount} relances`);
    
    try {
      // Récupérer l'email du chef de projet (dans un cas réel, il faudrait le stocker dans la configuration ou dans la table des projets)
      const managerEmail = config.email.user; // Pour cet exemple, on utilise le même email
      
      // Générer le contenu de l'escalade
      const escalationContent = `
Bonjour,

Après ${followUpCount} tentatives de relance, nous n'avons toujours pas reçu de réponse concernant:

Sujet: ${email.subject}
Date initiale: ${new Date(email.received_date).toLocaleDateString()}
Expéditeur original: ${email.from_address}

Résumé de la demande:
${email.body_text.substring(0, 300)}${email.body_text.length > 300 ? '...' : ''}

Vous pouvez consulter l'email complet dans le système de suivi (ID: ${email.id}).

Cordialement,
SiteManager - Agent de relance automatique
      `;
      
      // Envoyer l'email d'escalade
      const mailOptions = {
        from: config.email.user,
        to: managerEmail,
        subject: `[ESCALADE] ${followUpCount} relances sans réponse: ${email.subject}`,
        text: escalationContent,
        html: escalationContent.replace(/\n/g, '<br>')
      };
      
      await this.transporter.sendMail(mailOptions);
      logger.info(`Email d'escalade envoyé à ${managerEmail}`);
      
      // Mettre à jour le statut de suivi dans la base de données
      await db.query(`
        UPDATE emails
        SET follow_up_status = 'escalated', follow_up_date = CURRENT_TIMESTAMP
        WHERE id = $1
      `, [email.id]);
      
      logger.info(`Statut de relance mis à jour pour l'email ID ${email.id}`);
    } catch (error) {
      logger.error(`Erreur lors de l'escalade pour l'email ID ${email.id}:`, error);
    }
  }
}

module.exports = new FollowUpAgent(); 