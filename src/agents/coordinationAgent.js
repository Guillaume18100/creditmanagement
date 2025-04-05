const config = require('../config');
const logger = require('../utils/logger');
const db = require('../database');
const mistralClient = require('../llm/mistral');

class CoordinationAgent {
  constructor() {
    // Intervalle de vérification en millisecondes (par défaut: 12h)
    this.checkInterval = 12 * 60 * 60 * 1000;
  }

  /**
   * Démarre l'agent de coordination
   */
  start() {
    logger.info('Agent de coordination des corps de métiers démarré');
    
    // Exécution immédiate puis programmation périodique
    this.analyzeProjectSchedule();
    
    // Planification des vérifications régulières
    setInterval(() => {
      this.analyzeProjectSchedule();
    }, this.checkInterval);
  }

  /**
   * Analyse le planning du projet pour détecter les problèmes de coordination
   */
  async analyzeProjectSchedule() {
    logger.info('Analyse du planning des projets en cours...');
    
    try {
      // Récupérer tous les projets actifs
      const projects = await db.query(`
        SELECT id, name FROM projects WHERE status = 'active'
      `);
      
      for (const project of projects.rows) {
        await this.analyzeProjectTasks(project.id, project.name);
      }
    } catch (error) {
      logger.error('Erreur lors de l\'analyse du planning:', error);
    }
  }

  /**
   * Analyse les tâches d'un projet spécifique
   */
  async analyzeProjectTasks(projectId, projectName) {
    logger.info(`Analyse des tâches pour le projet ${projectName} (ID: ${projectId})`);
    
    try {
      // Récupérer toutes les tâches du projet
      const tasks = await db.query(`
        SELECT t.id, t.name, t.description, t.planned_start_date, t.planned_end_date, 
               t.actual_start_date, t.actual_end_date, t.status, t.depends_on,
               tr.id as trade_id, tr.name as trade_name
        FROM tasks t
        LEFT JOIN trades tr ON t.trade_id = tr.id
        WHERE t.project_id = $1
        ORDER BY t.planned_start_date ASC NULLS LAST
      `, [projectId]);
      
      if (tasks.rows.length === 0) {
        logger.info(`Aucune tâche trouvée pour le projet ${projectName}`);
        return;
      }
      
      // Construire un graphe de dépendances
      const taskMap = new Map();
      const dependencyGraph = new Map();
      
      // Initialiser le graphe
      tasks.rows.forEach(task => {
        taskMap.set(task.id, task);
        dependencyGraph.set(task.id, []);
      });
      
      // Remplir les dépendances
      tasks.rows.forEach(task => {
        if (task.depends_on && task.depends_on.length > 0) {
          task.depends_on.forEach(dependencyId => {
            if (dependencyGraph.has(dependencyId)) {
              dependencyGraph.get(dependencyId).push(task.id);
            }
          });
        }
      });
      
      // Détecter les chevauchements entre corps de métiers
      await this.detectTradeOverlaps(tasks.rows, projectId);
      
      // Détecter les tâches sans dépendances
      await this.detectMissingDependencies(tasks.rows, taskMap, dependencyGraph, projectId);
      
      // Détecter les conflits de planning
      await this.detectScheduleConflicts(tasks.rows, taskMap, dependencyGraph, projectId);
      
      logger.info(`Analyse terminée pour le projet ${projectName}`);
    } catch (error) {
      logger.error(`Erreur lors de l'analyse des tâches pour le projet ${projectId}:`, error);
    }
  }

  /**
   * Détecte les chevauchements entre différents corps de métiers
   */
  async detectTradeOverlaps(tasks, projectId) {
    logger.info('Recherche de chevauchements entre corps de métiers...');
    
    // Regrouper les tâches par corps de métier
    const tasksByTrade = new Map();
    
    tasks.forEach(task => {
      if (task.trade_id && task.planned_start_date && task.planned_end_date) {
        if (!tasksByTrade.has(task.trade_id)) {
          tasksByTrade.set(task.trade_id, []);
        }
        tasksByTrade.get(task.trade_id).push(task);
      }
    });
    
    // Comparer les périodes de travail entre corps de métiers
    const overlaps = [];
    const trades = Array.from(tasksByTrade.keys());
    
    for (let i = 0; i < trades.length; i++) {
      for (let j = i + 1; j < trades.length; j++) {
        const tradeTasks1 = tasksByTrade.get(trades[i]);
        const tradeTasks2 = tasksByTrade.get(trades[j]);
        
        for (const task1 of tradeTasks1) {
          for (const task2 of tradeTasks2) {
            // Vérifier si les périodes se chevauchent
            const startDate1 = new Date(task1.planned_start_date);
            const endDate1 = new Date(task1.planned_end_date);
            const startDate2 = new Date(task2.planned_start_date);
            const endDate2 = new Date(task2.planned_end_date);
            
            if ((startDate1 <= endDate2) && (endDate1 >= startDate2)) {
              overlaps.push({
                task1,
                task2,
                startOverlap: startDate1 > startDate2 ? startDate1 : startDate2,
                endOverlap: endDate1 < endDate2 ? endDate1 : endDate2
              });
            }
          }
        }
      }
    }
    
    // Logger les chevauchements détectés
    if (overlaps.length > 0) {
      logger.info(`${overlaps.length} chevauchements détectés entre corps de métiers`);
      
      for (const overlap of overlaps) {
        const daysOverlap = Math.ceil((overlap.endOverlap - overlap.startOverlap) / (1000 * 60 * 60 * 24));
        
        logger.info(`Chevauchement détecté: "${overlap.task1.trade_name}" (tâche: ${overlap.task1.name}) et "${overlap.task2.trade_name}" (tâche: ${overlap.task2.name}) se chevauchent pendant ${daysOverlap} jour(s) du ${overlap.startOverlap.toLocaleDateString()} au ${overlap.endOverlap.toLocaleDateString()}`);
        
        // Enregistrer le chevauchement dans la base de données ou envoyer une alerte
        // (cette partie serait à implémenter)
      }
    } else {
      logger.info('Aucun chevauchement détecté entre corps de métiers');
    }
  }

  /**
   * Détecte les tâches qui devraient avoir des dépendances mais n'en ont pas
   */
  async detectMissingDependencies(tasks, taskMap, dependencyGraph, projectId) {
    logger.info('Recherche de dépendances manquantes entre tâches...');
    
    const potentialIssues = [];
    
    // Analyser les tâches chronologiquement
    const sortedTasks = [...tasks].sort((a, b) => {
      if (!a.planned_start_date) return 1;
      if (!b.planned_start_date) return -1;
      return new Date(a.planned_start_date) - new Date(b.planned_start_date);
    });
    
    // Pour chaque tâche, vérifier si elle a des dépendances logiques
    for (let i = 0; i < sortedTasks.length; i++) {
      const currentTask = sortedTasks[i];
      
      // Ignorer les tâches sans date de début prévue
      if (!currentTask.planned_start_date) continue;
      
      const currentTaskDate = new Date(currentTask.planned_start_date);
      const hasDependencies = currentTask.depends_on && currentTask.depends_on.length > 0;
      
      // Chercher les tâches qui se terminent juste avant celle-ci
      const potentialDependencies = [];
      
      for (let j = 0; j < i; j++) {
        const prevTask = sortedTasks[j];
        
        // Ignorer les tâches sans date de fin prévue
        if (!prevTask.planned_end_date) continue;
        
        const prevTaskEndDate = new Date(prevTask.planned_end_date);
        const daysBetween = Math.ceil((currentTaskDate - prevTaskEndDate) / (1000 * 60 * 60 * 24));
        
        // Si la tâche précédente se termine peu avant la tâche actuelle (moins de 5 jours)
        // et qu'il n'y a pas déjà une dépendance
        if (daysBetween >= 0 && daysBetween <= 5 && 
            (!currentTask.depends_on || !currentTask.depends_on.includes(prevTask.id))) {
          potentialDependencies.push({
            task: prevTask,
            daysBetween
          });
        }
      }
      
      // Si on a trouvé des dépendances potentielles et que la tâche actuelle n'a pas de dépendances
      if (potentialDependencies.length > 0 && !hasDependencies) {
        potentialIssues.push({
          task: currentTask,
          potentialDependencies,
          type: 'missing_dependency'
        });
      }
    }
    
    // Logger les problèmes détectés
    if (potentialIssues.length > 0) {
      logger.info(`${potentialIssues.length} problèmes potentiels de dépendances détectés`);
      
      for (const issue of potentialIssues) {
        const dependencyNames = issue.potentialDependencies.map(d => `"${d.task.name}" (${d.task.trade_name || 'sans corps de métier'})`).join(', ');
        
        logger.info(`Dépendance manquante: La tâche "${issue.task.name}" (${issue.task.trade_name || 'sans corps de métier'}) pourrait dépendre de: ${dependencyNames}`);
        
        // Enregistrer le problème dans la base de données ou envoyer une alerte
        // (cette partie serait à implémenter)
      }
    } else {
      logger.info('Aucun problème de dépendance manquante détecté');
    }
  }

  /**
   * Détecte les conflits de planning entre tâches dépendantes
   */
  async detectScheduleConflicts(tasks, taskMap, dependencyGraph, projectId) {
    logger.info('Recherche de conflits de planning entre tâches dépendantes...');
    
    const conflicts = [];
    
    // Pour chaque tâche ayant des dépendances
    tasks.forEach(task => {
      if (task.depends_on && task.depends_on.length > 0 && task.planned_start_date) {
        const taskStartDate = new Date(task.planned_start_date);
        
        // Vérifier chaque dépendance
        task.depends_on.forEach(dependencyId => {
          const dependency = taskMap.get(dependencyId);
          
          if (dependency && dependency.planned_end_date) {
            const dependencyEndDate = new Date(dependency.planned_end_date);
            
            // Si la tâche démarre avant la fin de sa dépendance
            if (taskStartDate < dependencyEndDate) {
              conflicts.push({
                task,
                dependency,
                daysConflict: Math.ceil((dependencyEndDate - taskStartDate) / (1000 * 60 * 60 * 24))
              });
            }
          }
        });
      }
    });
    
    // Logger les conflits détectés
    if (conflicts.length > 0) {
      logger.info(`${conflicts.length} conflits de planning détectés`);
      
      for (const conflict of conflicts) {
        logger.info(`Conflit de planning: La tâche "${conflict.task.name}" (${conflict.task.trade_name || 'sans corps de métier'}) commence le ${new Date(conflict.task.planned_start_date).toLocaleDateString()} mais dépend de "${conflict.dependency.name}" qui se termine le ${new Date(conflict.dependency.planned_end_date).toLocaleDateString()} (${conflict.daysConflict} jour(s) de conflit)`);
        
        // Enregistrer le conflit dans la base de données ou envoyer une alerte
        // (cette partie serait à implémenter)
      }
    } else {
      logger.info('Aucun conflit de planning détecté');
    }
  }

  /**
   * Générer un rapport de coordination pour un projet
   */
  async generateCoordinationReport(projectId) {
    logger.info(`Génération d'un rapport de coordination pour le projet ${projectId}`);
    
    try {
      // Récupérer les informations du projet
      const projectResult = await db.query('SELECT name FROM projects WHERE id = $1', [projectId]);
      
      if (projectResult.rows.length === 0) {
        logger.error(`Projet ID ${projectId} non trouvé`);
        return null;
      }
      
      const projectName = projectResult.rows[0].name;
      
      // Récupérer toutes les tâches du projet
      const tasks = await db.query(`
        SELECT t.id, t.name, t.description, t.planned_start_date, t.planned_end_date, 
               t.actual_start_date, t.actual_end_date, t.status, t.depends_on,
               tr.id as trade_id, tr.name as trade_name
        FROM tasks t
        LEFT JOIN trades tr ON t.trade_id = tr.id
        WHERE t.project_id = $1
        ORDER BY t.planned_start_date ASC NULLS LAST
      `, [projectId]);
      
      // Regrouper les tâches par corps de métier
      const tasksByTrade = {};
      
      tasks.rows.forEach(task => {
        const tradeName = task.trade_name || 'Sans corps de métier';
        
        if (!tasksByTrade[tradeName]) {
          tasksByTrade[tradeName] = [];
        }
        
        tasksByTrade[tradeName].push({
          id: task.id,
          name: task.name,
          description: task.description,
          plannedStart: task.planned_start_date ? new Date(task.planned_start_date).toLocaleDateString() : 'Non défini',
          plannedEnd: task.planned_end_date ? new Date(task.planned_end_date).toLocaleDateString() : 'Non défini',
          actualStart: task.actual_start_date ? new Date(task.actual_start_date).toLocaleDateString() : '-',
          actualEnd: task.actual_end_date ? new Date(task.actual_end_date).toLocaleDateString() : '-',
          status: task.status
        });
      });
      
      // Structure du rapport
      const report = {
        projectName,
        generatedDate: new Date().toLocaleDateString(),
        tasksByTrade,
        totalTasks: tasks.rows.length,
        completedTasks: tasks.rows.filter(t => t.status === 'completed').length,
        inProgressTasks: tasks.rows.filter(t => t.status === 'in_progress').length,
        plannedTasks: tasks.rows.filter(t => t.status === 'planned').length,
        delayedTasks: tasks.rows.filter(t => t.status === 'delayed').length
      };
      
      return report;
    } catch (error) {
      logger.error(`Erreur lors de la génération du rapport de coordination pour le projet ${projectId}:`, error);
      return null;
    }
  }
}

module.exports = new CoordinationAgent(); 