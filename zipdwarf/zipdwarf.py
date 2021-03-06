import boto3
import json
import logging
import os
import zipfile
from boto3.dynamodb.conditions import Key

logger = logging.getLogger()
logger.setLevel(logging.INFO)

def handler(event, context):
    
    objectname = event['Records'][0]['s3']['object']['key']

    parameter = boto3.client('ssm')
    
    ami_response = parameter.get_parameter(
        Name = os.environ['AMI_ID']
    )
    ami_value = ami_response['Parameter']['Value']
    
    dynamodb = boto3.resource('dynamodb')
    table = dynamodb.Table(os.environ['DYNAMODB_TABLE'])

    response = table.query(KeyConditionExpression=Key('pk').eq('AMAZON#'))
    responsedata = response['Items']
    while 'LastEvaluatedKey' in response:
        response = table.query(
            KeyConditionExpression=Key('pk').eq('AMAZON#'),
            ExclusiveStartKey=response['LastEvaluatedKey']
        )
        responsedata.update(response['Items'])

    for item in responsedata:
        if item['imageid'] == ami_value:
            name = item['name']
            parse = item['creation'].split('T')
            out = parse[0].split('-') 
            year = out[0]
            month = out[1]
            day = out[2]
            
    s3 = boto3.client('s3')
    s3.download_file(os.environ['DWARF_S3'], objectname, '/tmp/'+objectname)

    with zipfile.ZipFile('/tmp/'+objectname+'.zip', 'w', compression=zipfile.ZIP_LZMA) as zipf:
        zipf.write('/tmp/'+objectname,objectname)

    s3.upload_file('/tmp/'+objectname+'.zip',os.environ['UPLOAD_S3'],year+'/'+month+'/'+day+'/'+name+'/'+objectname+'.zip')

    return {
        'statusCode': 200,
        'body': json.dumps('Compress Dwarf for Volatility3 Profile')
    }