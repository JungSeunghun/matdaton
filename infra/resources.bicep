param location string
param environmentName string

@secure()
param hmacSecret string

param foundryLocation string
param foundryModelName string
param foundryModelVersion string
param foundryModelCapacity int

var tags = { 'azd-env-name': environmentName }
var resourceToken = toLower(uniqueString(subscription().id, resourceGroup().id, environmentName))
var cosmosDatabaseName = 'firstmove'
// Key Vault Secrets User 빌트인 역할
var keyVaultSecretsUserRoleId = '4633458b-17de-408a-b874-0445c86b69e6'

// ---------- 관측: Log Analytics + Application Insights ----------

resource logAnalytics 'Microsoft.OperationalInsights/workspaces@2023-09-01' = {
  name: 'log-${resourceToken}'
  location: location
  tags: tags
  properties: {
    sku: { name: 'PerGB2018' }
    retentionInDays: 30
  }
}

resource appInsights 'Microsoft.Insights/components@2020-02-02' = {
  name: 'appi-${resourceToken}'
  location: location
  kind: 'web'
  tags: tags
  properties: {
    Application_Type: 'web'
    WorkspaceResourceId: logAnalytics.id
  }
}

// ---------- 데이터: Cosmos DB (NoSQL serverless) ----------

resource cosmos 'Microsoft.DocumentDB/databaseAccounts@2024-11-15' = {
  name: 'cosmos-${resourceToken}'
  location: location
  kind: 'GlobalDocumentDB'
  tags: tags
  properties: {
    databaseAccountOfferType: 'Standard'
    consistencyPolicy: { defaultConsistencyLevel: 'Session' }
    capabilities: [{ name: 'EnableServerless' }]
    locations: [
      {
        locationName: location
        failoverPriority: 0
        isZoneRedundant: false
      }
    ]
  }
}

// 컨테이너(executions/metrics/drafts)는 앱이 createIfNotExists로 생성한다
resource cosmosDatabase 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases@2024-11-15' = {
  parent: cosmos
  name: cosmosDatabaseName
  properties: {
    resource: { id: cosmosDatabaseName }
  }
}

// ---------- 추론: Microsoft Foundry (AI Services) ----------

resource foundry 'Microsoft.CognitiveServices/accounts@2024-10-01' = {
  name: 'aif-${resourceToken}'
  location: foundryLocation
  kind: 'AIServices'
  sku: { name: 'S0' }
  tags: tags
  properties: {
    customSubDomainName: 'aif-${resourceToken}'
    publicNetworkAccess: 'Enabled'
  }
}

resource foundryModelDeployment 'Microsoft.CognitiveServices/accounts/deployments@2024-10-01' = {
  parent: foundry
  name: foundryModelName
  sku: {
    // 이 구독은 GlobalStandard 쿼터가 0 — 리전 Standard만 가용
    name: 'Standard'
    capacity: foundryModelCapacity
  }
  properties: {
    model: {
      format: 'OpenAI'
      name: foundryModelName
      version: foundryModelVersion
    }
  }
}

// ---------- 비밀: Key Vault (RBAC) ----------

resource keyVault 'Microsoft.KeyVault/vaults@2023-07-01' = {
  name: 'kv-${resourceToken}'
  location: location
  tags: tags
  properties: {
    sku: { family: 'A', name: 'standard' }
    tenantId: tenant().tenantId
    enableRbacAuthorization: true
  }
}

resource secretCosmosKey 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: keyVault
  name: 'cosmos-key'
  properties: { value: cosmos.listKeys().primaryMasterKey }
}

resource secretFoundryApiKey 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: keyVault
  name: 'foundry-api-key'
  properties: { value: foundry.listKeys().key1 }
}

resource secretHmac 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: keyVault
  name: 'first-move-hmac-secret'
  properties: { value: hmacSecret }
}

// ---------- 호스팅: App Service (Linux, Node 20) ----------

resource appServicePlan 'Microsoft.Web/serverfarms@2024-04-01' = {
  name: 'plan-${resourceToken}'
  location: location
  kind: 'linux'
  tags: tags
  sku: { name: 'B1' }
  properties: { reserved: true }
}

resource web 'Microsoft.Web/sites@2024-04-01' = {
  name: 'app-${resourceToken}'
  location: location
  tags: union(tags, { 'azd-service-name': 'web' })
  identity: { type: 'SystemAssigned' }
  properties: {
    serverFarmId: appServicePlan.id
    httpsOnly: true
    siteConfig: {
      linuxFxVersion: 'NODE|20-lts'
      alwaysOn: true
      ftpsState: 'Disabled'
      minTlsVersion: '1.2'
      // Next.js standalone 출력 실행 — 정적 자산 복사 후 서버 기동
      appCommandLine: 'cp -r .next/static .next/standalone/.next/static && HOSTNAME=0.0.0.0 node .next/standalone/server.js'
      appSettings: [
        { name: 'SCM_DO_BUILD_DURING_DEPLOYMENT', value: 'true' }
        { name: 'ENABLE_ORYX_BUILD', value: 'true' }
        { name: 'APPLICATIONINSIGHTS_CONNECTION_STRING', value: appInsights.properties.ConnectionString }
        { name: 'COSMOS_ENDPOINT', value: cosmos.properties.documentEndpoint }
        { name: 'COSMOS_DATABASE', value: cosmosDatabaseName }
        { name: 'COSMOS_KEY', value: '@Microsoft.KeyVault(SecretUri=${secretCosmosKey.properties.secretUri})' }
        { name: 'FOUNDRY_ENDPOINT', value: 'https://aif-${resourceToken}.openai.azure.com' }
        { name: 'FOUNDRY_DEPLOYMENT', value: foundryModelDeployment.name }
        { name: 'FOUNDRY_API_KEY', value: '@Microsoft.KeyVault(SecretUri=${secretFoundryApiKey.properties.secretUri})' }
        { name: 'FIRST_MOVE_HMAC_SECRET', value: '@Microsoft.KeyVault(SecretUri=${secretHmac.properties.secretUri})' }
      ]
    }
  }
}

// App Service managed identity에만 Key Vault 비밀 읽기 권한 부여
resource webKeyVaultSecretsUser 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  scope: keyVault
  name: guid(keyVault.id, web.id, keyVaultSecretsUserRoleId)
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', keyVaultSecretsUserRoleId)
    principalId: web.identity.principalId
    principalType: 'ServicePrincipal'
  }
}

output keyVaultName string = keyVault.name
output appInsightsConnectionString string = appInsights.properties.ConnectionString
output cosmosEndpoint string = cosmos.properties.documentEndpoint
output foundryEndpoint string = 'https://aif-${resourceToken}.openai.azure.com'
output foundryDeployment string = foundryModelDeployment.name
output webUri string = 'https://${web.properties.defaultHostName}'
