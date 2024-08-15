import * as cdk from 'aws-cdk-lib';
import { CfnRole, ManagedPolicy, Role, ServicePrincipal } from 'aws-cdk-lib/aws-iam';
import { Domain, EngineVersion } from 'aws-cdk-lib/aws-opensearchservice';
import { CfnEndpoint, CfnEndpointConfig, CfnModel } from 'aws-cdk-lib/aws-sagemaker';
import { Secret } from 'aws-cdk-lib/aws-secretsmanager';
import { Construct } from 'constructs';

export class OpensearchCdkStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const masterUserArn = new cdk.CfnParameter(this, "masterUserArn", {
      type: "String",
    })

    const deployRerankModel = new cdk.CfnParameter(this, "deployRerankModel", {
      type: "String",
      allowedValues: ["true", "false"],
      default: "false"
    })

    if (deployRerankModel) {
      // https://github.com/cohere-ai/cohere-aws/blob/main/notebooks/sagemaker/rerank_v3_notebooks/Deploy%20rerank%20multilingual%20v3.0%20model.ipynb

      const coherePackage = "cohere-rerank-multilingual-v3--13dba038aab73b11b3f0b17fbdb48ea0"

      type RegionMap = {
        [key: string]: string;
      };
      const modelPackageMap: RegionMap = {
        "us-east-1": `arn:aws:sagemaker:us-east-1:865070037744:model-package/${coherePackage}`,
        "us-east-2": `arn:aws:sagemaker:us-east-2:057799348421:model-package/${coherePackage}`,
        "us-west-1": `arn:aws:sagemaker:us-west-1:382657785993:model-package/${coherePackage}`,
        "us-west-2": `arn:aws:sagemaker:us-west-2:594846645681:model-package/${coherePackage}`,
        "ca-central-1": `arn:aws:sagemaker:ca-central-1:470592106596:model-package/${coherePackage}`,
        "eu-central-1": `arn:aws:sagemaker:eu-central-1:446921602837:model-package/${coherePackage}`,
        "eu-west-1": `arn:aws:sagemaker:eu-west-1:985815980388:model-package/${coherePackage}`,
        "eu-west-2": `arn:aws:sagemaker:eu-west-2:856760150666:model-package/${coherePackage}`,
        "eu-west-3": `arn:aws:sagemaker:eu-west-3:843114510376:model-package/${coherePackage}`,
        "eu-north-1": `arn:aws:sagemaker:eu-north-1:136758871317:model-package/${coherePackage}`,
        "ap-southeast-1": `arn:aws:sagemaker:ap-southeast-1:192199979996:model-package/${coherePackage}`,
        "ap-southeast-2": `arn:aws:sagemaker:ap-southeast-2:666831318237:model-package/${coherePackage}`,
        "ap-northeast-2": `arn:aws:sagemaker:ap-northeast-2:745090734665:model-package/${coherePackage}`,
        "ap-northeast-1": `arn:aws:sagemaker:ap-northeast-1:977537786026:model-package/${coherePackage}`,
        "ap-south-1": `arn:aws:sagemaker:ap-south-1:077584701553:model-package/${coherePackage}`,
        "sa-east-1": `arn:aws:sagemaker:sa-east-1:270155090741:model-package/${coherePackage}`,
      }

      const region = this.region
      const modelPackageArn = modelPackageMap[region]

      const sagemakerExecutionRole = new Role(this, "sagemakerExecutionRole", {
        assumedBy: new ServicePrincipal("sagemaker.amazonaws.com"),
        managedPolicies: [ManagedPolicy.fromAwsManagedPolicyName("AmazonSageMakerFullAccess")]
      })

      const rerankModel = new CfnModel(this, "rerank3Model", {
        modelName: "Rerank3Model",
        primaryContainer: {
          modelPackageName: modelPackageArn
        },
        executionRoleArn: sagemakerExecutionRole.roleArn,
        enableNetworkIsolation: true
      })
      rerankModel.addDependency(sagemakerExecutionRole.node.defaultChild as CfnRole)

      const rerankEndpointConfig = new CfnEndpointConfig(this, "rerank3EndpointConfig", {
        endpointConfigName: "Rerank3EndpointConfig",
        productionVariants: [{
          variantName: "default-variant",
          modelName: rerankModel.modelName,
          initialInstanceCount: 1,
          instanceType: "ml.g5.xlarge",
        }],
      })
      rerankEndpointConfig.addDependency(rerankModel)

      const rerankEndpoint = new CfnEndpoint(this, "rerank3Endpoint", {
        endpointName: "Rerank3Endpoint",
        endpointConfigName: rerankEndpointConfig.endpointConfigName!,
      })
      rerankEndpoint.addDependency(rerankEndpointConfig)

      new cdk.CfnOutput(this, "sagemaker_rerank_endpoint", {
        value: `https://runtime.sagemaker.${region}.amazonaws.com/endpoints/${rerankEndpoint.attrEndpointName}/invocations`
      })
    }

    // OpenSearchがBedrockなどにアクセスする際に使用するIAMロール
    const opensearchRole = new Role(this, 'role_for_opensearch', {
      assumedBy: new ServicePrincipal("opensearchservice.amazonaws.com"),
      managedPolicies: [
        ManagedPolicy.fromAwsManagedPolicyName("AmazonBedrockFullAccess"),
        ManagedPolicy.fromAwsManagedPolicyName("AmazonSageMakerFullAccess"),
        ManagedPolicy.fromAwsManagedPolicyName("AWSLambda_FullAccess"),
      ]
    });

    const domain = new Domain(this, 'Domain', {
      version: EngineVersion.OPENSEARCH_2_13,
      capacity: {
        masterNodes: 0,
        dataNodes: 1,
        dataNodeInstanceType: "m6g.large.search",
        multiAzWithStandbyEnabled: false,
      },
      fineGrainedAccessControl: {
        masterUserArn: masterUserArn.valueAsString
      },
      nodeToNodeEncryption: true,
      encryptionAtRest: {
        enabled: true
      },
      enforceHttps: true,
      removalPolicy: cdk.RemovalPolicy.DESTROY
    });

    const openaiKey = new Secret(this, "openapi_dummy_key", {
      secretObjectValue: {
        "openai-key": cdk.SecretValue.unsafePlainText("sk-*****"),
      },
      removalPolicy: cdk.RemovalPolicy.DESTROY
    })

    openaiKey.grantRead(opensearchRole)

    new cdk.CfnOutput(this, "oss_domain_name", {
      value: domain.domainName
    })
    new cdk.CfnOutput(this, "oss_domain_endpoint", {
      value: domain.domainEndpoint
    })
    new cdk.CfnOutput(this, "oss_execution_role", {
      value: opensearchRole.roleArn
    })

    new cdk.CfnOutput(this, "oss_secret_arn", {
      value: openaiKey.secretArn
    })

  }
}
