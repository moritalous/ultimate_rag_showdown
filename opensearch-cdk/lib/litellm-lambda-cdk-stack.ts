import { PythonLayerVersion } from '@aws-cdk/aws-lambda-python-alpha';
import * as cdk from 'aws-cdk-lib';
import { ManagedPolicy } from 'aws-cdk-lib/aws-iam';
import { Code, Function, FunctionUrlAuthType, LayerVersion, Runtime } from 'aws-cdk-lib/aws-lambda';
import { Construct } from 'constructs';
import path = require('path');

export class LiteLLMLambdaCdkStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const litellmLayer = new PythonLayerVersion(this, "LiteLLMLayer", {
      entry: "lambda/litellm-layer",
      compatibleRuntimes: [Runtime.PYTHON_3_12]
    })

    const litellmFunction = new Function(this, "litellmFunction", {
      code: Code.fromAsset(path.join(__dirname, '../lambda/litellm-on-lambda')),
      handler: "run.sh",
      runtime: Runtime.PYTHON_3_12,
      layers: [
        LayerVersion.fromLayerVersionArn(this, "LambdaAdapterLayerX86ARN", `arn:aws:lambda:${this.region}:753240598075:layer:LambdaAdapterLayerX86:23`),
        LayerVersion.fromLayerVersionArn(this, "LiteLLMLayerARN", litellmLayer.layerVersionArn),
      ],
      environment: {
        "AWS_LAMBDA_EXEC_WRAPPER": "/opt/bootstrap",
        "PORT": "4000",
        "MODEL": "bedrock/mistral.mistral-large-2407-v1:0",
        "LITELLM_MASTER_KEY": "sk-*****"
      },
      timeout: cdk.Duration.seconds(120),
      memorySize: 1024
    })
    const litellmFunctionUrl = litellmFunction.addFunctionUrl({
      authType: FunctionUrlAuthType.NONE,
    })
    litellmFunction.role?.addManagedPolicy(ManagedPolicy.fromAwsManagedPolicyName("AmazonBedrockFullAccess"))

    new cdk.CfnOutput(this, "litellm_lambda_endpoint", {
      value: litellmFunctionUrl.url
    })
  }
}
