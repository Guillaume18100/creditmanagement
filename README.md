# SiteManager GPT

SiteManager GPT est un assistant intelligent dédié aux projets de construction, capable de lire, comprendre et structurer l'intégralité de l'historique d'un chantier à partir de sa boîte mail dédiée.

## Fonctionnalités Clés

### 1. Lecture intelligente du chantier (LLM Core)
- Analyse sémantique de tous les mails, pièces jointes et photos
- Résumés, réponses et synthèses à la demande
- Recherche contextuelle ultra-précise

### 2. Agent de relance automatique (Smart Follow-up Agent)
- Identification des demandes sans réponse
- Relance automatique des intervenants
- Escalade hiérarchique paramétrable

### 3. Agent litige & conformité (Compliance Sentinel Agent)
- Détection des engagements contractuels
- Archivage des preuves clés
- Génération de dossiers litige

### 4. Dashboard de coordination des corps de métiers
- Vue timeline des différents corps de métiers
- Alerte sur les conflits potentiels de planning
- Mise à jour en temps réel

### 5. Agent de capitalisation automatique (Lessons Learned Agent)
- Analyse post-chantier automatisée
- Identification des causes racines des problèmes
- Génération de fiches "retour d'expérience"

## Architecture Technique

Ce projet utilise:
- WaterfLAI pour l'orchestration des agents IA
- Mistral AI pour le traitement du langage naturel
- AWS pour l'infrastructure cloud (S3, RDS, etc.)
- Interface web pour le dashboard de coordination

## Installation

```bash
npm install
npm run setup
```

## Configuration

Editez le fichier `.env` avec vos clés API et paramètres:

```
MISTRAL_API_KEY=votre_clé_api
AWS_ACCESS_KEY=votre_clé_aws
AWS_SECRET_KEY=votre_secret_aws
EMAIL_SERVER=imap.exemple.com
EMAIL_USER=chantier@exemple.com
EMAIL_PASSWORD=votre_mot_de_passe
```

## Démarrage

```bash
npm run dev
```

Le dashboard sera accessible à l'adresse: http://localhost:3000 