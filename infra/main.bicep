targetScope = 'subscription'

@minLength(1)
@maxLength(64)
@description('azd 환경 이름 — 리소스 이름 시드로 사용')
param environmentName string

@minLength(1)
@description('리소스 기본 리전')
param location string

@secure()
@description('승인 토큰 서명용 HMAC 시크릿')
param hmacSecret string

@secure()
@description('GitHub API 토큰 — 미설정 시 GitHub 연동 비활성')
param githubToken string = ''

@secure()
@description('Judge Mode 읽기 전용 GitHub 토큰 — 미설정 시 githubToken 사용')
param judgeGithubToken string = ''

@description('기본 연결 저장소 (owner/repo)')
param firstMoveRepo string = ''

@description('기본 ICS 일정 URL')
param firstMoveIcsUrl string = ''

@description('Foundry(AI Services) 리전 — 모델 가용성에 따라 분리 가능')
param foundryLocation string = location

@description('Foundry 모델 배포 이름 (구조화 출력 지원 모델)')
param foundryModelName string = 'gpt-4o'

@description('Foundry 모델 버전')
param foundryModelVersion string = '2024-11-20'

@description('Foundry 모델 배포 용량 (K TPM)')
param foundryModelCapacity int = 10

var tags = { 'azd-env-name': environmentName }

resource rg 'Microsoft.Resources/resourceGroups@2024-03-01' = {
  name: 'rg-${environmentName}'
  location: location
  tags: tags
}

module resources 'resources.bicep' = {
  name: 'resources'
  scope: rg
  params: {
    location: location
    environmentName: environmentName
    hmacSecret: hmacSecret
    githubToken: githubToken
    judgeGithubToken: judgeGithubToken
    firstMoveRepo: firstMoveRepo
    firstMoveIcsUrl: firstMoveIcsUrl
    foundryLocation: foundryLocation
    foundryModelName: foundryModelName
    foundryModelVersion: foundryModelVersion
    foundryModelCapacity: foundryModelCapacity
  }
}

output AZURE_LOCATION string = location
output AZURE_RESOURCE_GROUP string = rg.name
output AZURE_KEY_VAULT_NAME string = resources.outputs.keyVaultName
output APPLICATIONINSIGHTS_CONNECTION_STRING string = resources.outputs.appInsightsConnectionString
output COSMOS_ENDPOINT string = resources.outputs.cosmosEndpoint
output FOUNDRY_ENDPOINT string = resources.outputs.foundryEndpoint
output FOUNDRY_DEPLOYMENT string = resources.outputs.foundryDeployment
output WEB_URI string = resources.outputs.webUri
