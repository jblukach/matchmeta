import * as cdk from '@aws-cdk/core';
import * as ec2 from '@aws-cdk/aws-ec2';
import * as iam from '@aws-cdk/aws-iam';
import * as ssm from '@aws-cdk/aws-ssm';

export class RunmetaStack extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const vpc = new ec2.Vpc(this, 'TemporaryVPC', {
      cidr: '192.168.42.0/24',
      maxAzs: 1,
      natGateways: 0,
      enableDnsHostnames: true,
      enableDnsSupport: true,
      subnetConfiguration: [
        {
          subnetType: ec2.SubnetType.PUBLIC,
          name: 'Public',
          cidrMask: 24,
        }
      ],
    });

    const ami = ssm.StringParameter.fromStringParameterAttributes(this, 'ami', {
      parameterName: '/matchmeta/ssm/ami'
    }).stringValue;

    const ec2type = ssm.StringParameter.fromStringParameterAttributes(this, 'ec2type', {
      parameterName: '/matchmeta/ssm/ec2type'
    }).stringValue;

    const archtype = ssm.StringParameter.fromStringParameterAttributes(this, 'archtype', {
      parameterName: '/matchmeta/ssm/arch'
    }).stringValue;

    const dwarf = ssm.StringParameter.fromStringParameterAttributes(this, 'dwarf', {
      parameterName: '/matchmeta/bucket/dwarf'
    }).stringValue;
    
    const raw = ssm.StringParameter.fromStringParameterAttributes(this, 'raw', {
      parameterName: '/matchmeta/bucket/raw'
    }).stringValue;

    const linux = ec2.MachineImage.genericLinux({
      'us-west-2': ami,
    });

    const role = new iam.Role(this, 'TemporaryRole', {
      assumedBy: new iam.ServicePrincipal('ec2.amazonaws.com'),
    });

    role.addToPolicy(new iam.PolicyStatement({
      resources: ['*'],
      actions: [
        's3:ListBucket',
        's3:GetBucketAcl',
        's3:GetObject',
        's3:PutObject'
      ],
    }));

    role.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName(
        'AmazonSSMManagedInstanceCore'
      )
    );

    const instance = new ec2.Instance(this, 'TemporaryEC2', {
      instanceType: new ec2.InstanceType(ec2type),
      machineImage: linux,
      vpc: vpc,
      role: role,
      init: ec2.CloudFormationInit.fromConfigSets({
        configSets: {
          default: ['yumpackages', 'awscli2install', 'awscopydwarfs', 'awscopygetmeta'],
        },
        
        configs: {
          yumpackages: new ec2.InitConfig([
            ec2.InitPackage.yum('file-devel'),
            ec2.InitPackage.yum('python3-pip'),
            ec2.InitPackage.yum('unzip'),
            ec2.InitPackage.yum('wget'),
          ]),
          awscli2install: new ec2.InitConfig([
            ec2.InitCommand.shellCommand(
              'wget https://awscli.amazonaws.com/awscli-exe-linux-'+archtype+'.zip -P /tmp/',
            ),
            ec2.InitCommand.shellCommand(
              'unzip /tmp/awscli-exe-linux-'+archtype+'.zip -d /tmp',
            ),
            ec2.InitCommand.shellCommand(
              './tmp/aws/install',
            ),
          ]),
          awscopydwarfs: new ec2.InitConfig([
            ec2.InitCommand.shellCommand(
              'aws s3 cp /boot/System* s3://'+dwarf,
            ),
          ]),
          awscopygetmeta: new ec2.InitConfig([
            ec2.InitCommand.shellCommand(
              '/usr/bin/pip3 install getmeta',
            ),
            ec2.InitCommand.shellCommand(
              'cd /tmp && /usr/local/bin/getmeta',
            ),
            ec2.InitCommand.shellCommand(
              'aws s3 cp /tmp/ip-* s3://'+raw,
            ),
          ]),
        },
      }),
      initOptions: {
        configSets: ['default'],
        timeout: cdk.Duration.minutes(30),
      },
    });

  }
}
