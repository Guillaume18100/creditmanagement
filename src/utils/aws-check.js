/**
 * Utilitaire pour vérifier la configuration AWS
 * Ce script permet de tester la connexion à AWS et les services configurés
 */

const awsConfig = require('../config/aws');
const logger = require('./logger');

async function checkAWSConnection() {
  try {
    logger.info('Vérification de la configuration AWS...');
    
    // Configuration des identifiants AWS
    const config = awsConfig.configureAWS();
    logger.info(`AWS Region configurée: ${config.region}`);
    
    let isConfigValid = true;
    
    // Vérifier l'accès à S3
    try {
      const s3 = awsConfig.getS3();
      const s3Result = await s3.listBuckets().promise();
      logger.info(`Connexion S3 réussie. ${s3Result.Buckets.length} buckets disponibles.`);
      logger.debug('Buckets disponibles:', s3Result.Buckets.map(b => b.Name).join(', '));
    } catch (s3Error) {
      logger.error('Erreur lors de la connexion à S3:', s3Error.message);
      isConfigValid = false;
    }
    
    // Vérifier l'accès à DynamoDB
    try {
      const dynamoDB = awsConfig.getDynamoDB();
      const dynamoResult = await dynamoDB.listTables().promise();
      logger.info(`Connexion DynamoDB réussie. ${dynamoResult.TableNames ? dynamoResult.TableNames.length : 0} tables disponibles.`);
    } catch (dynamoError) {
      logger.warn('Erreur lors de la connexion à DynamoDB:', dynamoError.message);
    }
    
    // Vérifier l'accès à Lambda si disponible
    try {
      const lambda = awsConfig.getLambda();
      const lambdaResult = await lambda.listFunctions().promise();
      logger.info(`Connexion Lambda réussie. ${lambdaResult.Functions ? lambdaResult.Functions.length : 0} fonctions disponibles.`);
    } catch (lambdaError) {
      logger.warn('Erreur lors de la connexion à Lambda:', lambdaError.message);
    }
    
    // Vérifier l'accès à SQS si disponible
    try {
      const sqs = awsConfig.getSQS();
      const sqsResult = await sqs.listQueues().promise();
      logger.info(`Connexion SQS réussie. ${sqsResult.QueueUrls ? sqsResult.QueueUrls.length : 0} files disponibles.`);
    } catch (sqsError) {
      logger.warn('Erreur lors de la connexion à SQS:', sqsError.message);
    }
    
    return isConfigValid;
  } catch (error) {
    logger.error('Erreur lors de la vérification AWS:', error.message);
    return false;
  }
}

// Si le script est exécuté directement
if (require.main === module) {
  checkAWSConnection()
    .then(result => {
      if (result) {
        logger.info('✅ Configuration AWS valide');
        process.exit(0);
      } else {
        logger.error('❌ Configuration AWS invalide');
        process.exit(1);
      }
    })
    .catch(error => {
      logger.error('Erreur non gérée:', error.message);
      process.exit(1);
    });
}

module.exports = { checkAWSConnection }; 