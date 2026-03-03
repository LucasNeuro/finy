/instance/init
Criar Instancia
Cria uma nova instância do WhatsApp. Para criar uma instância você precisa:

Ter um admintoken válido
Enviar pelo menos o nome da instância
A instância será criada desconectada
Será gerado um token único para autenticação
Após criar a instância, guarde o token retornado pois ele será necessário para todas as outras operações.

Estados possíveis da instância:

disconnected: Desconectado do WhatsApp
connecting: Em processo de conexão
connected: Conectado e autenticado
Campos administrativos (adminField01/adminField02) são opcionais e podem ser usados para armazenar metadados personalizados. OS valores desses campos são vísiveis para o dono da instancia via token, porém apenas o administrador da api (via admin token) pode editá-los.

Request
Body
name
string
required
Nome da instância

Example: "minha-instancia"

systemName
string
Nome do sistema (opcional, padrão 'uazapiGO' se não informado)

Example: "apilocal"

adminField01
string
Campo administrativo 1 para metadados personalizados (opcional)

Example: "custom-metadata-1"

adminField02
string
Campo administrativo 2 para metadados personalizados (opcional)

Example: "custom-metadata-2"

fingerprintProfile
string
Perfil de fingerprint para emulação de navegador (opcional)

Example: "chrome"

browser
string
Tipo de navegador para emulação (opcional)

Example: "chrome" /admin/restart
Reiniciar a aplicação
Reinicia toda a aplicação para forçar a reconexão de todas as instâncias de uma vez.

Use apenas em situações realmente necessárias, como instabilidades gerais. Após o restart, os números entram em reconexão automática e não ficam desconectados permanentemente.

/instance/connect
Conectar instância ao WhatsApp
Inicia o processo de conexão de uma instância ao WhatsApp. Este endpoint:

Requer o token de autenticação da instância
Recebe o número de telefone associado à conta WhatsApp
Gera um QR code caso não passe o campo phone
Ou Gera código de pareamento se passar o o campo phone
Atualiza o status da instância para "connecting"
O processo de conexão permanece pendente até que:

O QR code seja escaneado no WhatsApp do celular, ou
O código de pareamento seja usado no WhatsApp
Timeout de 2 minutos para QRCode seja atingido ou 5 minutos para o código de pareamento
Use o endpoint /instance/status para monitorar o progresso da conexão.

Estados possíveis da instância:

disconnected: Desconectado do WhatsApp
connecting: Em processo de conexão
connected: Conectado e autenticado
Sincronização e armazenamento de mensagens:

Todas as mensagens recebidas da Meta durante a sincronização da conexão (leitura do QR code) são enviadas no evento history do webhook.
As mensagens dos últimos 7 dias são armazenadas no banco de dados e ficam acessíveis pelos endpoints: POST /message/find e POST /chat/find.
Depois que a instância conecta, todas as mensagens enviadas ou recebidas são armazenadas no banco de dados.
Mensagens mais antigas do que 7 dias são excluídas durante a madrugada.
Exemplo de requisição:

{
  "phone": "5511999999999"
}
Request
Body
phone
string
Número de telefone no formato internacional (ex: 5511999999999). Se informado, gera código de pareamento. Se omitido, gera QR code.

Example: "5511999999999"  /instance/disconnect
Desconectar instância
Desconecta a instância do WhatsApp, encerrando a sessão atual. Esta operação:

Encerra a conexão ativa

Requer novo QR code para reconectar

Diferenças entre desconectar e hibernar:

Desconectar: Encerra completamente a sessão, exigindo novo login

Hibernar: Mantém a sessão ativa, apenas pausa a conexão

Use este endpoint para:

Encerrar completamente uma sessão

Forçar uma nova autenticação

Limpar credenciais de uma instância

Reiniciar o processo de conexão

Estados possíveis após desconectar:

disconnected: Desconectado do WhatsApp

connecting: Em processo de reconexão (após usar /instance/connect)  /instance/status
Verificar status da instância
Retorna o status atual de uma instância, incluindo:

Estado da conexão (disconnected, connecting, connected)
QR code atualizado (se em processo de conexão)
Código de pareamento (se disponível)
Informações da última desconexão
Detalhes completos da instância
Este endpoint é particularmente útil para:

Monitorar o progresso da conexão
Obter QR codes atualizados durante o processo de conexão
Verificar o estado atual da instância
Identificar problemas de conexão
Estados possíveis:

disconnected: Desconectado do WhatsApp
connecting: Em processo de conexão (aguardando QR code ou código de pareamento)
connected: Conectado e autenticado com sucesso
/instance/updateInstanceName
Atualizar nome da instância
Atualiza o nome de uma instância WhatsApp existente. O nome não precisa ser único.

Request
Body
name
string
required
Novo nome para a instância

Example: "Minha Nova Instância 2024!@#"/instance
Deletar instância
Remove a instância do sistema.

/instance/privacy
Buscar configurações de privacidade
Busca as configurações de privacidade atuais da instância do WhatsApp.

Importante - Diferença entre Status e Broadcast:

Status: Refere-se ao recado personalizado que aparece embaixo do nome do usuário (ex: "Disponível", "Ocupado", texto personalizado)
Broadcast: Refere-se ao envio de "stories/reels" (fotos/vídeos temporários)
Limitação: As configurações de privacidade do broadcast (stories/reels) não estão disponíveis para alteração via API.

Retorna todas as configurações de privacidade como quem pode:

Adicionar aos grupos
Ver visto por último
Ver status (recado embaixo do nome)
Ver foto de perfil
Receber confirmação de leitura
Ver status online
Fazer chamadas

/instance/privacy
Alterar configurações de privacidade
Altera uma ou múltiplas configurações de privacidade da instância do WhatsApp de forma otimizada.

Importante - Diferença entre Status e Broadcast:

Status: Refere-se ao recado personalizado que aparece embaixo do nome do usuário (ex: "Disponível", "Ocupado", texto personalizado)
Broadcast: Refere-se ao envio de "stories/reels" (fotos/vídeos temporários)
Limitação: As configurações de privacidade do broadcast (stories/reels) não estão disponíveis para alteração via API.

Características:

✅ Eficiência: Altera apenas configurações que realmente mudaram
✅ Flexibilidade: Pode alterar uma ou múltiplas configurações na mesma requisição
✅ Feedback completo: Retorna todas as configurações atualizadas
Formato de entrada:

{
  "groupadd": "contacts",
  "last": "none",
  "status": "contacts"
}
Tipos de privacidade disponíveis:

groupadd: Quem pode adicionar aos grupos
last: Quem pode ver visto por último
status: Quem pode ver status (recado embaixo do nome)
profile: Quem pode ver foto de perfil
readreceipts: Confirmação de leitura
online: Quem pode ver status online
calladd: Quem pode fazer chamadas
Valores possíveis:

all: Todos
contacts: Apenas contatos
contact_blacklist: Contatos exceto bloqueados
none: Ninguém
match_last_seen: Corresponder ao visto por último (apenas para online)
known: Números conhecidos (apenas para calladd)
Request
Body
groupadd
string
Quem pode adicionar aos grupos. Valores - all, contacts, contact_blacklist, none

Valores possíveis: all, contacts, contact_blacklist, none
last
string
Quem pode ver visto por último. Valores - all, contacts, contact_blacklist, none

Valores possíveis: all, contacts, contact_blacklist, none
status
string
Quem pode ver status (recado embaixo do nome). Valores - all, contacts, contact_blacklist, none

Valores possíveis: all, contacts, contact_blacklist, none
profile
string
Quem pode ver foto de perfil. Valores - all, contacts, contact_blacklist, none

Valores possíveis: all, contacts, contact_blacklist, none
readreceipts
string
Confirmação de leitura. Valores - all, none

Valores possíveis: all, none
online
string
Quem pode ver status online. Valores - all, match_last_seen

Valores possíveis: all, match_last_seen
calladd
string
Quem pode fazer chamadas. Valores - all, known

Valores possíveis: all, known

/instance/presence
Atualizar status de presença da instância
Atualiza o status de presença global da instância do WhatsApp. Este endpoint permite:

Definir se a instância está disponível (Aparece "online") ou indisponível
Controlar o status de presença para todos os contatos
Salvar o estado atual da presença na instância
Tipos de presença suportados:

available: Marca a instância como disponível/online
unavailable: Marca a instância como indisponível/offline
Atenção:

O status de presença pode ser temporariamente alterado para "available" (online) em algumas situações internas da API, e com isso o visto por último também pode ser atualizado.
Caso isso for um problema, considere alterar suas configurações de privacidade no WhatsApp para não mostrar o visto por último e/ou quem pode ver seu status "online".
⚠️ Importante - Limitação do Presence "unavailable":

Quando a API é o único dispositivo ativo: Confirmações de entrega/leitura (ticks cinzas/azuis) não são enviadas nem recebidas
Impacto: Eventos message_update com status de entrega podem não ser recebidos
Solução: Se precisar das confirmações, mantenha WhatsApp Web ou aplicativo móvel ativo ou use presence "available"
Exemplo de requisição:

{
  "presence": "available"
}
Exemplo de resposta:

{
  "response": "Presence updated successfully"
}
Erros comuns:

401: Token inválido ou expirado
400: Valor de presença inválido
500: Erro ao atualizar presença
Request
Body
presence
string
required
Status de presença da instância

Valores possíveis: available, unavailable
Example: "available"

/instance/updateDelaySettings
Delay na fila de mensagens
Configura o intervalo de tempo entre mensagens diretas (async=true).

Detalhes
Configuração aplicada apenas para mensagens diretas (não afeta campanhas)
Delay mínimo (msg_delay_min): 0 ou mais segundos (0 = sem delay)
Delay máximo (msg_delay_max): se menor que min, será ajustado para o mesmo valor de min
Sistema ajusta automaticamente valores negativos para 0
Exemplo
{
  "msg_delay_min": 0,
  "msg_delay_max": 2
}
Request
Body
msg_delay_min
integer
required
Delay mínimo em segundos (0 = sem delay)

0
msg_delay_max
integer
required
Delay máximo em segundos

Example: 2

/instance/proxy
Obter configuração de proxy da instância
A uazapiGO opera com um proxy interno como padrão. Observação: nossos IPs são brasileiros. Se você atende clientes internacionais, considere usar um proxy do país/região do seu cliente (via proxy_url). Você pode: (1) continuar no proxy interno padrão; (2) usar um proxy próprio informando proxy_url. Se nada for definido, seguimos no proxy interno; ou (3) usar seu celular android como proxy instalando o aplicativo disponibilizado pela uazapi em https://github.com/uazapi/silver_proxy_apk (APK direto: https://github.com/uazapi/silver_proxy_apk/raw/refs/heads/main/silver_proxy.apk).

A resposta desse endpoint traz o estado atual do proxy e o último teste de conectividade.

/instance/proxy
Configurar ou alterar o proxy
Permite habilitar ou trocar para:

Um proxy próprio (proxy_url), usando sua infraestrutura ou o aplicativo de celular para proxy próprio.
O proxy interno padrão (nenhum proxy_url enviado).
Se nada for enviado, seguimos no proxy interno. A URL é validada antes de salvar. A conexão pode ser reiniciada automaticamente para aplicar a mudança.

Opcional: você pode usar seu celular android como proxy instalando o aplicativo disponibilizado pela uazapi em https://github.com/uazapi/silver_proxy_apk (APK direto: https://github.com/uazapi/silver_proxy_apk/raw/refs/heads/main/silver_proxy.apk).

Request
Body
enable
boolean
required
Define se o proxy deve ser habilitado; se false, remove o proxy atual

proxy_url
string
URL do proxy a ser usado (obrigatória se enable=true e quiser usar um proxy próprio)

Example: "http://usuario:senha@ip:porta"

/instance/proxy
Remover o proxy configurado
Desativa e apaga o proxy personalizado, voltando ao comportamento padrão (proxy interno). Pode reiniciar a conexão para aplicar a remoção.

/profile/name
Altera o nome do perfil do WhatsApp
Altera o nome de exibição do perfil da instância do WhatsApp.

O endpoint realiza:

Atualiza o nome do perfil usando o WhatsApp AppState
Sincroniza a mudança com o servidor do WhatsApp
Retorna confirmação da alteração
Importante:

A instância deve estar conectada ao WhatsApp
O nome será visível para todos os contatos
Pode haver um limite de alterações por período (conforme WhatsApp)
Request
Body
name
string
required
Novo nome do perfil do WhatsApp

Example: "Minha Empresa - Atendimento"

/profile/image
Altera a imagem do perfil do WhatsApp
Altera a imagem de perfil da instância do WhatsApp.

O endpoint realiza:

Atualiza a imagem do perfil usando
Processa a imagem (URL, base64 ou comando de remoção)
Sincroniza a mudança com o servidor do WhatsApp
Retorna confirmação da alteração
Importante:

A instância deve estar conectada ao WhatsApp
A imagem será visível para todos os contatos
A imagem deve estar em formato JPEG e tamanho 640x640 pixels
Request
Body
image
string
required
Imagem do perfil. Pode ser:

URL da imagem (http/https)
String base64 da imagem
"remove" ou "delete" para remover a imagem atual
Example: "https://picsum.photos/640/640.jpg"

/business/get/profile
Obter o perfil comercial
Retorna o perfil comercial da instância do WhatsApp.

Request
Body
jid
string
JID do perfil comercial a consultar

Example: "5511999999999@s.whatsapp.net"

/business/get/categories
Obter as categorias de negócios
Retorna as categorias de negócios disponíveis.

/business/update/profile
Atualizar o perfil comercial
Atualiza os dados do perfil comercial da instância do WhatsApp. Todos os campos são opcionais; apenas os enviados serão atualizados.

Request
Body
description
string
Nova descrição do perfil comercial.

Example: "Loja de eletrônicos e acessórios"

address
string
Novo endereço do perfil comercial.

Example: "Rua das Flores, 123 - Centro"

email
string
Novo email do perfil comercial.

Example: "contato@empresa.com"
/business/catalog/list
Listar os produtos do catálogo
Lista os produtos do catálogo da instância do WhatsApp.

Request
Body
jid
string
required
JID do catálogo a consultar

Example: "5511999999999@s.whatsapp.net"

/business/catalog/info
Obter informações de um produto do catálogo
Retorna as informações de um produto específico do catálogo.

Request
Body
jid
string
required
JID do catálogo a consultar

Example: "5511999999999@s.whatsapp.net"

id
string
required
O ID do produto.


/business/catalog/delete
Deletar um produto do catálogo
Deleta um produto específico do catálogo.

Request
Body
id
string
required
O ID do produto.

/business/catalog/show
Mostrar um produto do catálogo
Mostra um produto específico do catálogo.

Request
Body
id
string
required
O ID do produto.

/business/catalog/hide
Ocultar um produto do catálogo
Oculta um produto específico do catálogo.

Request
Body
id
string
required
O ID do produto.

/call/make
Iniciar chamada de voz
Inicia uma chamada de voz para um contato específico. Este endpoint permite:

Iniciar chamadas de voz para contatos
Funciona apenas com números válidos do WhatsApp
O contato receberá uma chamada de voz
Nota: O telefone do contato tocará normalmente, mas ao contato atender, ele não ouvirá nada, e você também não ouvirá nada. Este endpoint apenas inicia a chamada, não estabelece uma comunicação de voz real.

Exemplo de requisição:

{
  "number": "5511999999999"
}
Exemplo de resposta:

{
  "response": "Call successful"
}
Erros comuns:

401: Token inválido ou expirado
400: Número inválido ou ausente
500: Erro ao iniciar chamada
Request
Body
number
string
required
Número do contato no formato internacional (ex: 5511999999999)

Example: "5511999999999"

/call/reject
Rejeitar chamada recebida
Rejeita uma chamada recebida do WhatsApp.

O body pode ser enviado vazio {}. Os campos number e id são opcionais e podem ser usados para especificar uma chamada específica.

Exemplo de requisição (recomendado):

{}
Exemplo de requisição com campos opcionais:

{
  "number": "5511999999999",
  "id": "ABEiGmo8oqkAcAKrBYQAAAAA_1"
}
Exemplo de resposta:

{
  "response": "Call rejected"
}
Erros comuns:

401: Token inválido ou expirado
400: Número inválido
500: Erro ao rejeitar chamada
Request
Body
number
string
(Opcional) Número do contato no formato internacional (ex: 5511999999999)

id
string
(Opcional) ID único da chamada a ser rejeitada


/webhook
Ver Webhook da Instância
Retorna a configuração atual do webhook da instância, incluindo:

URL configurada
Eventos ativos
Filtros aplicados
Configurações adicionais
Exemplo de resposta:

[
  {
    "id": "123e4567-e89b-12d3-a456-426614174000",
    "enabled": true,
    "url": "https://example.com/webhook",
    "events": ["messages", "messages_update"],
    "excludeMessages": ["wasSentByApi", "isGroupNo"],
    "addUrlEvents": true,
    "addUrlTypesMessages": true
  },
  {
    "id": "987fcdeb-51k3-09j8-x543-864297539100",
    "enabled": true,
    "url": "https://outro-endpoint.com/webhook",
    "events": ["connection", "presence"],
    "excludeMessages": [],
    "addUrlEvents": false,
    "addUrlTypesMessages": false
  }
]
A resposta é sempre um array, mesmo quando há apenas um webhook configurado.


/webhook
Configurar Webhook da Instância
Gerencia a configuração de webhooks para receber eventos em tempo real da instância. Permite gerenciar múltiplos webhooks por instância através do campo ID e action.

🚀 Modo Simples (Recomendado)
Uso mais fácil - sem complexidade de IDs:

Não inclua action nem id no payload
Gerencia automaticamente um único webhook por instância
Cria novo ou atualiza o existente automaticamente
Recomendado: Sempre use "excludeMessages": ["wasSentByApi"] para evitar loops
Exemplo: {"url": "https://meusite.com/webhook", "events": ["messages"], "excludeMessages": ["wasSentByApi"]}
🧪 Sites para Testes (ordenados por qualidade)
Para testar webhooks durante desenvolvimento:

https://webhook.cool/ - ⭐ Melhor opção (sem rate limit, interface limpa)
https://rbaskets.in/ - ⭐ Boa alternativa (confiável, baixo rate limit)
https://webhook.site/ - ⚠️ Evitar se possível (rate limit agressivo)
⚙️ Modo Avançado (Para múltiplos webhooks)
Para usuários que precisam de múltiplos webhooks por instância:

💡 Dica: Mesmo precisando de múltiplos webhooks, considere usar addUrlEvents no modo simples. Um único webhook pode receber diferentes tipos de eventos em URLs específicas (ex: /webhook/message, /webhook/connection), eliminando a necessidade de múltiplos webhooks.

Criar Novo Webhook:

Use action: "add"
Não inclua id no payload
O sistema gera ID automaticamente
Atualizar Webhook Existente:

Use action: "update"
Inclua o id do webhook no payload
Todos os campos serão atualizados
Remover Webhook:

Use action: "delete"
Inclua apenas o id do webhook
Outros campos são ignorados
Eventos Disponíveis
connection: Alterações no estado da conexão
history: Recebimento de histórico de mensagens
messages: Novas mensagens recebidas
messages_update: Atualizações em mensagens existentes
call: Eventos de chamadas VoIP
contacts: Atualizações na agenda de contatos
presence: Alterações no status de presença
groups: Modificações em grupos
labels: Gerenciamento de etiquetas
chats: Eventos de conversas
chat_labels: Alterações em etiquetas de conversas
blocks: Bloqueios/desbloqueios
leads: Atualizações de leads
sender: Atualizações de campanhas, quando inicia, e quando completa
Remover mensagens com base nos filtros:

wasSentByApi: Mensagens originadas pela API ⚠️ IMPORTANTE: Use sempre este filtro para evitar loops em automações
wasNotSentByApi: Mensagens não originadas pela API
fromMeYes: Mensagens enviadas pelo usuário
fromMeNo: Mensagens recebidas de terceiros
isGroupYes: Mensagens em grupos
isGroupNo: Mensagens em conversas individuais
💡 Prevenção de Loops: Se você tem automações que enviam mensagens via API, sempre inclua "excludeMessages": ["wasSentByApi"] no seu webhook. Caso prefira receber esses eventos, certifique-se de que sua automação detecta mensagens enviadas pela própria API para não criar loops infinitos.

Ações Suportadas:

add: Registrar novo webhook
delete: Remover webhook existente
Parâmetros de URL:

addUrlEvents (boolean): Quando ativo, adiciona o tipo do evento como path parameter na URL. Exemplo: https://api.example.com/webhook/{evento}
addUrlTypesMessages (boolean): Quando ativo, adiciona o tipo da mensagem como path parameter na URL. Exemplo: https://api.example.com/webhook/{tipo_mensagem}
Combinações de Parâmetros:

Ambos ativos: https://api.example.com/webhook/{evento}/{tipo_mensagem} Exemplo real: https://api.example.com/webhook/message/conversation
Apenas eventos: https://api.example.com/webhook/message
Apenas tipos: https://api.example.com/webhook/conversation
Notas Técnicas:

Os parâmetros são adicionados na ordem: evento → tipo mensagem
A URL deve ser configurada para aceitar esses parâmetros dinâmicos
Funciona com qualquer combinação de eventos/mensagens
Request
Body
id
string
ID único do webhook (necessário para update/delete)

Example: "123e4567-e89b-12d3-a456-426614174000"

enabled
boolean
Habilita/desabilita o webhook

Example: true

url
string
required
URL para receber os eventos

Example: "https://example.com/webhook"

events
array
Lista de eventos monitorados

excludeMessages
array
Filtros para excluir tipos de mensagens

addUrlEvents
boolean
Adiciona o tipo do evento como parâmetro na URL.

false (padrão): URL normal
true: Adiciona evento na URL (ex: /webhook/message)
addUrlTypesMessages
boolean
Adiciona o tipo da mensagem como parâmetro na URL.

false (padrão): URL normal
true: Adiciona tipo da mensagem (ex: /webhook/conversation)
action
string
Ação a ser executada:

add: criar novo webhook
update: atualizar webhook existente (requer id)
delete: remover webhook (requer apenas id) Se não informado, opera no modo simples (único webhook)
Valores possíveis: add, update, delete


/sse
Server-Sent Events (SSE)
Receber eventos em tempo real via Server-Sent Events (SSE)

Funcionalidades Principais:
Configuração de URL para recebimento de eventos
Seleção granular de tipos de eventos
Filtragem avançada de mensagens
Parâmetros adicionais na URL
Gerenciamento múltiplo de webhooks
Eventos Disponíveis:

connection: Alterações no estado da conexão
history: Recebimento de histórico de mensagens
messages: Novas mensagens recebidas
messages_update: Atualizações em mensagens existentes
call: Eventos de chamadas VoIP
contacts: Atualizações na agenda de contatos
presence: Alterações no status de presença
groups: Modificações em grupos
labels: Gerenciamento de etiquetas
chats: Eventos de conversas
chat_labels: Alterações em etiquetas de conversas
blocks: Bloqueios/desbloqueios
leads: Atualizações de leads
Estabelece uma conexão persistente para receber eventos em tempo real. Este endpoint:

Requer autenticação via token

Mantém uma conexão HTTP aberta com o cliente

Envia eventos conforme ocorrem no servidor

Suporta diferentes tipos de eventos

Exemplo de uso:


const eventSource = new
EventSource('/sse?token=SEU_TOKEN&events=chats,messages');


eventSource.onmessage = function(event) {
  const data = JSON.parse(event.data);
  console.log('Novo evento:', data);
};


eventSource.onerror = function(error) {
  console.error('Erro na conexão SSE:', error);
};

Estrutura de um evento:


{
  "type": "message",
  "data": {
    "id": "3EB0538DA65A59F6D8A251",
    "from": "5511999999999@s.whatsapp.net",
    "to": "5511888888888@s.whatsapp.net",
    "text": "Olá!",
    "timestamp": 1672531200000
  }
}

Parameters
Query Parameters
token
string
required
Token de autenticação da instância

events
string
required
Tipos de eventos a serem recebidos. Suporta dois formatos:

Separados por vírgula: ?events=chats,messages
Parâmetros repetidos: ?events=chats&events=messages
excludeMessages
string
Tipos de mensagens a serem excluídas do evento messages. Suporta dois formatos:

Separados por vírgula: ?excludeMessages=poll,reaction
Parâmetros repetidos: ?excludeMessages=poll&excludeMessages=reaction

/sse
Server-Sent Events (SSE)
Receber eventos em tempo real via Server-Sent Events (SSE)

Funcionalidades Principais:
Configuração de URL para recebimento de eventos
Seleção granular de tipos de eventos
Filtragem avançada de mensagens
Parâmetros adicionais na URL
Gerenciamento múltiplo de webhooks
Eventos Disponíveis:

connection: Alterações no estado da conexão
history: Recebimento de histórico de mensagens
messages: Novas mensagens recebidas
messages_update: Atualizações em mensagens existentes
call: Eventos de chamadas VoIP
contacts: Atualizações na agenda de contatos
presence: Alterações no status de presença
groups: Modificações em grupos
labels: Gerenciamento de etiquetas
chats: Eventos de conversas
chat_labels: Alterações em etiquetas de conversas
blocks: Bloqueios/desbloqueios
leads: Atualizações de leads
Estabelece uma conexão persistente para receber eventos em tempo real. Este endpoint:

Requer autenticação via token

Mantém uma conexão HTTP aberta com o cliente

Envia eventos conforme ocorrem no servidor

Suporta diferentes tipos de eventos

Exemplo de uso:


const eventSource = new
EventSource('/sse?token=SEU_TOKEN&events=chats,messages');


eventSource.onmessage = function(event) {
  const data = JSON.parse(event.data);
  console.log('Novo evento:', data);
};


eventSource.onerror = function(error) {
  console.error('Erro na conexão SSE:', error);
};

Estrutura de um evento:


{
  "type": "message",
  "data": {
    "id": "3EB0538DA65A59F6D8A251",
    "from": "5511999999999@s.whatsapp.net",
    "to": "5511888888888@s.whatsapp.net",
    "text": "Olá!",
    "timestamp": 1672531200000
  }
}

Parameters
Query Parameters
token
string
required
Token de autenticação da instância

events
string
required
Tipos de eventos a serem recebidos. Suporta dois formatos:

Separados por vírgula: ?events=chats,messages
Parâmetros repetidos: ?events=chats&events=messages
excludeMessages
string
Tipos de mensagens a serem excluídas do evento messages. Suporta dois formatos:

Separados por vírgula: ?excludeMessages=poll,reaction
Parâmetros repetidos: ?excludeMessages=poll&excludeMessages=reaction

/send/text
Enviar mensagem de texto
Envia uma mensagem de texto para um contato ou grupo.

Recursos Específicos
Preview de links com suporte a personalização automática ou customizada
Formatação básica do texto
Substituição automática de placeholders dinâmicos
Campos Comuns
Este endpoint suporta todos os campos opcionais comuns documentados na tag "Enviar Mensagem", incluindo: delay, readchat, readmessages, replyid, mentions, forward, track_source, track_id, placeholders e envio para grupos.

Preview de Links
Preview Automático
{
  "number": "5511999999999",
  "text": "Confira: https://exemplo.com",
  "linkPreview": true
}
Preview Personalizado
{
  "number": "5511999999999",
  "text": "Confira nosso site! https://exemplo.com",
  "linkPreview": true,
  "linkPreviewTitle": "Título Personalizado",
  "linkPreviewDescription": "Uma descrição personalizada do link",
  "linkPreviewImage": "https://exemplo.com/imagem.jpg",
  "linkPreviewLarge": true
}
Request
Body
number
string
required
ID do chat para o qual a mensagem será enviada. Pode ser um número de telefone em formato internacional, um ID de grupo (@g.us), um ID de usuário (com @s.whatsapp.net ou @lid).

Example: "5511999999999"

text
string
required
Texto da mensagem (aceita placeholders)

Example: "Olá {{name}}! Como posso ajudar?"

linkPreview
boolean
Ativa/desativa preview de links. Se true, procura automaticamente um link no texto para gerar preview.

Comportamento:

Se apenas linkPreview=true: gera preview automático do primeiro link encontrado no texto
Se fornecidos campos personalizados (title, description, image): usa os valores fornecidos
Se campos personalizados parciais: combina com dados automáticos do link como fallback
Example: true

linkPreviewTitle
string
Define um título personalizado para o preview do link

Example: "Título Personalizado"

linkPreviewDescription
string
Define uma descrição personalizada para o preview do link

Example: "Descrição personalizada do link"

linkPreviewImage
string
URL ou Base64 da imagem para usar no preview do link

Example: "https://exemplo.com/imagem.jpg"

linkPreviewLarge
boolean
Se true, gera um preview grande com upload da imagem. Se false, gera um preview pequeno sem upload

Example: true

replyid
string
ID da mensagem para responder

Example: "3EB0538DA65A59F6D8A251"

mentions
string
Números para mencionar (separados por vírgula)

Example: "5511999999999,5511888888888"

readchat
boolean
Marca conversa como lida após envio

Example: true

readmessages
boolean
Marca últimas mensagens recebidas como lidas

Example: true

delay
integer
Atraso em milissegundos antes do envio, durante o atraso apacerá 'Digitando...'

Example: 1000

forward
boolean
Marca a mensagem como encaminhada no WhatsApp

Example: true

track_source
string
Origem do rastreamento da mensagem

Example: "chatwoot"

track_id
string
ID para rastreamento da mensagem (aceita valores duplicados)

Example: "msg_123456789"

async
boolean
Se true, envia a mensagem de forma assíncrona via fila interna. Útil para alto volume de mensagens.

/send/media
Enviar mídia (imagem, vídeo, áudio ou documento)
Envia diferentes tipos de mídia para um contato ou grupo. Suporta URLs ou arquivos base64.

Tipos de Mídia Suportados
image: Imagens (JPG preferencialmente)
video: Vídeos (apenas MP4)
document: Documentos (PDF, DOCX, XLSX, etc)
audio: Áudio comum (MP3 ou OGG)
myaudio: Mensagem de voz (alternativa ao PTT)
ptt: Mensagem de voz (Push-to-Talk)
ptv: Mensagem de vídeo (Push-to-Video)
sticker: Figurinha/Sticker
Recursos Específicos
Upload por URL ou base64
Caption/legenda opcional com suporte a placeholders
Nome personalizado para documentos (docName)
Geração automática de thumbnails
Compressão otimizada conforme o tipo
Campos Comuns
Este endpoint suporta todos os campos opcionais comuns documentados na tag "Enviar Mensagem", incluindo: delay, readchat, readmessages, replyid, mentions, forward, track_source, track_id, placeholders e envio para grupos.

Exemplos Básicos
Imagem Simples
{
  "number": "5511999999999",
  "type": "image",
  "file": "https://exemplo.com/foto.jpg"
}
Documento com Nome
{
  "number": "5511999999999",
  "type": "document",
  "file": "https://exemplo.com/contrato.pdf",
  "docName": "Contrato.pdf",
  "text": "Segue o documento solicitado"
}
Request
Body
number
string
required
ID do chat para o qual a mensagem será enviada. Pode ser um número de telefone em formato internacional, um ID de grupo (@g.us), um ID de usuário (com @s.whatsapp.net ou @lid).

Example: "5511999999999"

type
string
required
Tipo de mídia (image, video, document, audio, myaudio, ptt, ptv, sticker)

Valores possíveis: image, video, document, audio, myaudio, ptt, ptv, sticker
Example: "image"

file
string
required
URL ou base64 do arquivo

Example: "https://exemplo.com/imagem.jpg"

text
string
Texto descritivo (caption) - aceita placeholders

Example: "Veja esta foto!"

docName
string
Nome do arquivo (apenas para documents)

Example: "relatorio.pdf"

thumbnail
string
URL ou base64 de thumbnail personalizado para vídeos e documentos

Example: "https://exemplo.com/thumb.jpg"

mimetype
string
MIME type do arquivo (opcional, detectado automaticamente)

Example: "application/pdf"

replyid
string
ID da mensagem para responder

Example: "3EB0538DA65A59F6D8A251"

mentions
string
Números para mencionar (separados por vírgula)

Example: "5511999999999,5511888888888"

readchat
boolean
Marca conversa como lida após envio

Example: true

readmessages
boolean
Marca últimas mensagens recebidas como lidas

Example: true

delay
integer
Atraso em milissegundos antes do envio, durante o atraso apacerá 'Digitando...' ou 'Gravando áudio...'

Example: 1000

forward
boolean
Marca a mensagem como encaminhada no WhatsApp

Example: true

track_source
string
Origem do rastreamento da mensagem

Example: "chatwoot"

track_id
string
ID para rastreamento da mensagem (aceita valores duplicados)

Example: "msg_123456789"

async
boolean
Se true, envia a mensagem de forma assíncrona via fila interna


/send/contact
Enviar cartão de contato (vCard)
Envia um cartão de contato (vCard) para um contato ou grupo.

Recursos Específicos
vCard completo com nome, telefones, organização, email e URL
Múltiplos números de telefone (separados por vírgula)
Cartão clicável no WhatsApp para salvar na agenda
Informações profissionais (organização/empresa)
Campos Comuns
Este endpoint suporta todos os campos opcionais comuns documentados na tag "Enviar Mensagem", incluindo: delay, readchat, readmessages, replyid, mentions, forward, track_source, track_id, placeholders e envio para grupos.

Exemplo Básico
{
  "number": "5511999999999",
  "fullName": "João Silva",
  "phoneNumber": "5511999999999,5511888888888",
  "organization": "Empresa XYZ",
  "email": "joao.silva@empresa.com",
  "url": "https://empresa.com/joao"
}
Request
Body
number
string
required
ID do chat para o qual a mensagem será enviada. Pode ser um número de telefone em formato internacional, um ID de grupo (@g.us), um ID de usuário (com @s.whatsapp.net ou @lid).

Example: "5511999999999"

fullName
string
required
Nome completo do contato

Example: "João Silva"

phoneNumber
string
required
Números de telefone (separados por vírgula)

Example: "5511999999999,5511888888888"

organization
string
Nome da organização/empresa

Example: "Empresa XYZ"

email
string
Endereço de email

Example: "joao@empresa.com"

url
string
URL pessoal ou da empresa

Example: "https://empresa.com/joao"

replyid
string
ID da mensagem para responder

Example: "3EB0538DA65A59F6D8A251"

mentions
string
Números para mencionar (separados por vírgula)

Example: "5511999999999,5511888888888"

readchat
boolean
Marca conversa como lida após envio

Example: true

readmessages
boolean
Marca últimas mensagens recebidas como lidas

Example: true

delay
integer
Atraso em milissegundos antes do envio, durante o atraso apacerá 'Digitando...'

Example: 1000

forward
boolean
Marca a mensagem como encaminhada no WhatsApp

Example: true

track_source
string
Origem do rastreamento da mensagem

Example: "chatwoot"

track_id
string
ID para rastreamento da mensagem (aceita valores duplicados)

Example: "msg_123456789"

async
boolean
Se true, envia a mensagem de forma assíncrona via fila interna

/send/location
Enviar localização geográfica
Envia uma localização geográfica para um contato ou grupo.

Recursos Específicos
Coordenadas precisas (latitude e longitude obrigatórias)
Nome do local para identificação
Endereço completo para exibição detalhada
Mapa interativo no WhatsApp para navegação
Pin personalizado com nome do local
Campos Comuns
Este endpoint suporta todos os campos opcionais comuns documentados na tag "Enviar Mensagem", incluindo: delay, readchat, readmessages, replyid, mentions, forward, track_source, track_id, placeholders e envio para grupos.

Exemplo Básico
{
  "number": "5511999999999",
  "name": "Maracanã",
  "address": "Av. Pres. Castelo Branco - Maracanã, Rio de Janeiro - RJ",
  "latitude": -22.912982815767986,
  "longitude": -43.23028153499254
}
Request
Body
number
string
required
ID do chat para o qual a mensagem será enviada. Pode ser um número de telefone em formato internacional, um ID de grupo (@g.us), um ID de usuário (com @s.whatsapp.net ou @lid).

Example: "5511999999999"

name
string
Nome do local

Example: "MASP"

address
string
Endereço do local

Example: "Av. Paulista, 1578 - Bela Vista, São Paulo - SP"

latitude
number
required
Latitude (-90 a 90)

Example: -23.5616

longitude
number
required
Longitude (-180 a 180)

Example: -46.6562

replyid
string
ID da mensagem para responder

Example: "3EB0538DA65A59F6D8A251"

mentions
string
Números para mencionar (separados por vírgula)

Example: "5511999999999,5511888888888"

readchat
boolean
Marca conversa como lida após envio

Example: true

readmessages
boolean
Marca últimas mensagens recebidas como lidas

Example: true

delay
integer
Atraso em milissegundos antes do envio, durante o atraso apacerá 'Digitando...'

Example: 1000

forward
boolean
Marca a mensagem como encaminhada no WhatsApp

Example: true

track_source
string
Origem do rastreamento da mensagem

Example: "chatwoot"

track_id
string
ID para rastreamento da mensagem (aceita valores duplicados)

Example: "msg_123456789"

async
boolean
Se true, envia a mensagem de forma assíncrona via fila interna


/message/presence
Enviar atualização de presença
Envia uma atualização de presença para um contato ou grupo de forma assíncrona.

🔄 Comportamento Assíncrono:
Execução independente: A presença é gerenciada em background, não bloqueia o retorno da API
Limite máximo: 5 minutos de duração (300 segundos)
Tick de atualização: Reenvia a presença a cada 10 segundos
Cancelamento automático: Presença é cancelada automaticamente ao enviar uma mensagem para o mesmo chat
📱 Tipos de presença suportados:
composing: Indica que você está digitando uma mensagem
recording: Indica que você está gravando um áudio
paused: Remove/cancela a indicação de presença atual
⏱️ Controle de duração:
Sem delay: Usa limite padrão de 5 minutos
Com delay: Usa o valor especificado (máximo 5 minutos)
Cancelamento: Envio de mensagem cancela presença automaticamente
📋 Exemplos de uso:
Digitar por 30 segundos:
{
  "number": "5511999999999",
  "presence": "composing",
  "delay": 30000
}
Gravar áudio por 1 minuto:
{
  "number": "5511999999999",
  "presence": "recording",
  "delay": 60000
}
Cancelar presença atual:
{
  "number": "5511999999999",
  "presence": "paused"
}
Usar limite máximo (5 minutos):
{
  "number": "5511999999999",
  "presence": "composing"
}
Request
Body
number
string
required
Número do destinatário no formato internacional (ex: 5511999999999)

Example: "5511999999999"

presence
string
required
Tipo de presença a ser enviada

Valores possíveis: composing, recording, paused
Example: "composing"

delay
integer
Duração em milissegundos que a presença ficará ativa (máximo 5 minutos = 300000ms). Se não informado ou valor maior que 5 minutos, usa o limite padrão de 5 minutos. A presença é reenviada a cada 10 segundos durante este período.

Example: 30000


/send/menu
Enviar menu interativo (botões, carrosel, lista ou enquete)
Este endpoint oferece uma interface unificada para envio de quatro tipos principais de mensagens interativas:

Botões: Para ações rápidas e diretas
Carrosel de Botões: Para uma lista horizontal de botões com imagens
Listas: Para menus organizados em seções
Enquetes: Para coleta de opiniões e votações
Suporte a campos de rastreamento: Este endpoint também suporta track_source e track_id documentados na tag "Enviar Mensagem".

Estrutura Base do Payload
Todas as requisições seguem esta estrutura base:

{
  "number": "5511999999999",
  "type": "button|list|poll|carousel",
  "text": "Texto principal da mensagem",
  "choices": ["opções baseadas no tipo escolhido"],
  "footerText": "Texto do rodapé (opcional para botões e listas)",
  "listButton": "Texto do botão (para listas)",
  "selectableCount": "Número de opções selecionáveis (apenas para enquetes)"
}
Tipos de Mensagens Interativas
1. Botões (type: "button")
Cria botões interativos com diferentes funcionalidades de ação.

Campos Específicos
footerText: Texto opcional exibido abaixo da mensagem principal
choices: Array de opções que serão convertidas em botões
Formatos de Botões
Cada botão pode ser configurado usando | (pipe) ou \n (quebra de linha) como separadores:

Botão de Resposta:

"texto|id" ou
"texto\nid" ou
"texto" (ID será igual ao texto)
Botão de Cópia:

"texto|copy:código" ou
"texto\ncopy:código"
Botão de Chamada:

"texto|call:+5511999999999" ou
"texto\ncall:+5511999999999"
Botão de URL:

"texto|https://exemplo.com" ou
"texto|url:https://exemplo.com"
Botões com Imagem
Para adicionar uma imagem aos botões, use o campo imageButton no payload:

Exemplo com Imagem
{
  "number": "5511999999999",
  "type": "button",
  "text": "Escolha um produto:",
  "imageButton": "https://exemplo.com/produto1.jpg",
  "choices": [
    "Produto A|prod_a",
    "Mais Info|https://exemplo.com/produto-a",
    "Produto B|prod_b",
    "Ligar|call:+5511999999999"
  ],
  "footerText": "Produtos em destaque"
}
Suporte: O campo imageButton aceita URLs ou imagens em base64.

Exemplo Completo
{
  "number": "5511999999999",
  "type": "button",
  "text": "Como podemos ajudar?",
  "choices": [
    "Suporte Técnico|suporte",
    "Fazer Pedido|pedido",
    "Nosso Site|https://exemplo.com",
    "Falar Conosco|call:+5511999999999"
  ],
  "footerText": "Escolha uma das opções abaixo"
}
Limitações e Compatibilidade
Importante: Ao combinar botões de resposta com outros tipos (call, url, copy) na mesma mensagem, será exibido o aviso: "Não é possível exibir esta mensagem no WhatsApp Web. Abra o WhatsApp no seu celular para visualizá-la."

2. Listas (type: "list")
Cria menus organizados em seções com itens selecionáveis.

Campos Específicos
listButton: Texto do botão que abre a lista
footerText: Texto opcional do rodapé
choices: Array com seções e itens da lista
Formato das Choices
"[Título da Seção]": Inicia uma nova seção
"texto|id|descrição": Item da lista com:
texto: Label do item
id: Identificador único, opcional
descrição: Texto descritivo adicional e opcional
Exemplo Completo
{
  "number": "5511999999999",
  "type": "list",
  "text": "Catálogo de Produtos",
  "choices": [
    "[Eletrônicos]",
    "Smartphones|phones|Últimos lançamentos",
    "Notebooks|notes|Modelos 2024",
    "[Acessórios]",
    "Fones|fones|Bluetooth e com fio",
    "Capas|cases|Proteção para seu device"
  ],
  "listButton": "Ver Catálogo",
  "footerText": "Preços sujeitos a alteração"
}
3. Enquetes (type: "poll")
Cria enquetes interativas para votação.

Campos Específicos
selectableCount: Número de opções que podem ser selecionadas (padrão: 1)
choices: Array simples com as opções de voto
Exemplo Completo
{
  "number": "5511999999999",
  "type": "poll",
  "text": "Qual horário prefere para atendimento?",
  "choices": [
    "Manhã (8h-12h)",
    "Tarde (13h-17h)",
    "Noite (18h-22h)"
  ],
  "selectableCount": 1
}
4. Carousel (type: "carousel")
Cria um carrossel de cartões com imagens e botões interativos.

Campos Específicos
choices: Array com elementos do carrossel na seguinte ordem:
[Texto do cartão]: Texto do cartão entre colchetes
{URL ou base64 da imagem}: Imagem entre chaves
Botões do cartão (um por linha):
"texto|copy:código" para botão de copiar
"texto|https://url" para botão de link
"texto|call:+número" para botão de ligação
Exemplo Completo
{
  "number": "5511999999999",
  "type": "carousel",
  "text": "Conheça nossos produtos",
  "choices": [
    "[Smartphone XYZ\nO mais avançado smartphone da linha]",
    "{https://exemplo.com/produto1.jpg}",
    "Copiar Código|copy:PROD123",
    "Ver no Site|https://exemplo.com/xyz",
    "Fale Conosco|call:+5511999999999",
    "[Notebook ABC\nO notebook ideal para profissionais]",
    "{https://exemplo.com/produto2.jpg}",
    "Copiar Código|copy:NOTE456",
    "Comprar Online|https://exemplo.com/abc",
    "Suporte|call:+5511988888888"
  ]
}
Nota: Criamos outro endpoint para carrossel: /send/carousel, funciona da mesma forma, mas com outro formato de payload. Veja o que é mais fácil para você.

Termos de uso
Os recursos de botões interativos e listas podem ser descontinuados a qualquer momento sem aviso prévio. Não nos responsabilizamos por quaisquer alterações ou indisponibilidade destes recursos.

Alternativas e Compatibilidade
Considerando a natureza dinâmica destes recursos, nosso endpoint foi projetado para facilitar a migração entre diferentes tipos de mensagens (botões, listas e enquetes).

Recomendamos criar seus fluxos de forma flexível, preparados para alternar entre os diferentes tipos.

Em caso de descontinuidade de algum recurso, você poderá facilmente migrar para outro tipo de mensagem apenas alterando o campo "type" no payload, mantendo a mesma estrutura de choices.

Request
Body
number
string
required
ID do chat para o qual a mensagem será enviada. Pode ser um número de telefone em formato internacional, um ID de grupo (@g.us), um ID de usuário (com @s.whatsapp.net ou @lid).

Example: "5511999999999"

type
string
required
Tipo do menu (button, list, poll, carousel)

Valores possíveis: button, list, poll, carousel
Example: "list"

text
string
required
Texto principal (aceita placeholders)

Example: "Escolha uma opção:"

footerText
string
Texto do rodapé (opcional)

Example: "Menu de serviços"

listButton
string
Texto do botão principal

Example: "Ver opções"

selectableCount
integer
Número máximo de opções selecionáveis (para enquetes)

Example: 1

choices
array
required
Lista de opções. Use [Título] para seções em listas

Example: ["[Eletrônicos]","Smartphones|phones|Últimos lançamentos","Notebooks|notes|Modelos 2024","[Acessórios]","Fones|fones|Bluetooth e com fio","Capas|cases|Proteção para seu device"]

imageButton
string
URL da imagem para botões (recomendado para type: button)

Example: "https://exemplo.com/imagem-botao.jpg"

replyid
string
ID da mensagem para responder

Example: "3EB0538DA65A59F6D8A251"

mentions
string
Números para mencionar (separados por vírgula)

Example: "5511999999999,5511888888888"

readchat
boolean
Marca conversa como lida após envio

Example: true

readmessages
boolean
Marca últimas mensagens recebidas como lidas

Example: true

delay
integer
Atraso em milissegundos antes do envio, durante o atraso apacerá 'Digitando...'

Example: 1000

track_source
string
Origem do rastreamento da mensagem

Example: "chatwoot"

track_id
string
ID para rastreamento da mensagem (aceita valores duplicados)

Example: "msg_123456789"

async
boolean
Se true, envia a mensagem de forma assíncrona via fila interna

/send/carousel
Enviar carrossel de mídia com botões
Este endpoint permite enviar um carrossel com imagens e botões interativos. Funciona de maneira igual ao endpoint /send/menu com type: carousel, porém usando outro formato de payload.

Campos Comuns
Este endpoint suporta todos os campos opcionais comuns documentados na tag "Enviar Mensagem", incluindo: delay, readchat, readmessages, replyid, mentions, forward, track_source, track_id, placeholders e envio para grupos.

Estrutura do Payload
{
  "number": "5511999999999",
  "text": "Texto principal",
  "carousel": [
    {
      "text": "Texto do cartão",
      "image": "URL da imagem",
      "buttons": [
        {
          "id": "resposta1",
          "text": "Texto do botão",
          "type": "REPLY"
        }
      ]
    }
  ],
  "delay": 1000,
  "readchat": true
}
Tipos de Botões
REPLY: Botão de resposta rápida

Quando clicado, envia o valor do id como resposta ao chat
O id será o texto enviado como resposta
URL: Botão com link

Quando clicado, abre a URL especificada
O id deve conter a URL completa (ex: https://exemplo.com)
COPY: Botão para copiar texto

Quando clicado, copia o texto para a área de transferência
O id será o texto que será copiado
CALL: Botão para realizar chamada

Quando clicado, inicia uma chamada telefônica
O id deve conter o número de telefone
Exemplo de Botões
{
  "buttons": [
    {
      "id": "Sim, quero comprar!",
      "text": "Confirmar Compra",
      "type": "REPLY"
    },
    {
      "id": "https://exemplo.com/produto",
      "text": "Ver Produto",
      "type": "URL"
    },
    {
      "id": "CUPOM20",
      "text": "Copiar Cupom",
      "type": "COPY"
    },
    {
      "id": "5511999999999",
      "text": "Falar com Vendedor",
      "type": "CALL"
    }
  ]
}
Exemplo Completo de Carrossel
{
  "number": "5511999999999",
  "text": "Nossos Produtos em Destaque",
  "carousel": [
    {
      "text": "Smartphone XYZ\nO mais avançado smartphone da linha",
      "image": "https://exemplo.com/produto1.jpg",
      "buttons": [
        {
          "id": "SIM_COMPRAR_XYZ",
          "text": "Comprar Agora",
          "type": "REPLY"
        },
        {
          "id": "https://exemplo.com/xyz",
          "text": "Ver Detalhes",
          "type": "URL"
        }
      ]
    },
    {
      "text": "Cupom de Desconto\nGanhe 20% OFF em qualquer produto",
      "image": "https://exemplo.com/cupom.jpg",
      "buttons": [
        {
          "id": "DESCONTO20",
          "text": "Copiar Cupom",
          "type": "COPY"
        },
        {
          "id": "5511999999999",
          "text": "Falar com Vendedor",
          "type": "CALL"
        }
      ]
    }
  ],
  "delay": 0,
  "readchat": true
}
Request
Body
number
string
required
ID do chat para o qual a mensagem será enviada. Pode ser um número de telefone em formato internacional, um ID de grupo (@g.us), um ID de usuário (com @s.whatsapp.net ou @lid).

Example: "5511999999999"

text
string
required
Texto principal da mensagem

Example: "Nossos Produtos em Destaque"

carousel
array
required
Array de cartões do carrossel

delay
integer
Atraso em milissegundos antes do envio

Example: 1000

readchat
boolean
Marca conversa como lida após envio

Example: true

readmessages
boolean
Marca últimas mensagens recebidas como lidas

Example: true

replyid
string
ID da mensagem para responder

Example: "3EB0538DA65A59F6D8A251"

mentions
string
Números para mencionar (separados por vírgula)

Example: "5511999999999,5511888888888"

forward
boolean
Marca a mensagem como encaminhada no WhatsApp

async
boolean
Se true, envia a mensagem de forma assíncrona via fila interna

track_source
string
Origem do rastreamento da mensagem

Example: "chatwoot"

track_id
string
ID para rastreamento da mensagem (aceita valores duplicados)

Example: "msg_123456789"

/send/location-button
Solicitar localização do usuário
Este endpoint envia uma mensagem com um botão que solicita a localização do usuário. Quando o usuário clica no botão, o WhatsApp abre a interface para compartilhar a localização atual.

Campos Comuns
Este endpoint suporta todos os campos opcionais comuns documentados na tag "Enviar Mensagem", incluindo: delay, readchat, readmessages, replyid, mentions, forward, track_source, track_id, placeholders e envio para grupos.

Estrutura do Payload
{
  "number": "5511999999999",
  "text": "Por favor, compartilhe sua localização",
  "delay": 0,
  "readchat": true
}
Exemplo de Uso
{
  "number": "5511999999999",
  "text": "Para continuar o atendimento, clique no botão abaixo e compartilhe sua localização"
}
Nota: O botão de localização é adicionado automaticamente à mensagem

Request
Body
number
string
required
ID do chat para o qual a mensagem será enviada. Pode ser um número de telefone em formato internacional, um ID de grupo (@g.us), um ID de usuário (com @s.whatsapp.net ou @lid).

Example: "5511999999999"

text
string
required
Texto da mensagem que será exibida

Example: "Por favor, compartilhe sua localização"

delay
integer
Atraso em milissegundos antes do envio

0
readchat
boolean
Se deve marcar a conversa como lida após envio

Example: true

readmessages
boolean
Marca últimas mensagens recebidas como lidas

Example: true

replyid
string
ID da mensagem para responder

Example: "3EB0538DA65A59F6D8A251"

mentions
string
Números para mencionar (separados por vírgula)

Example: "5511999999999,5511888888888"

async
boolean
Se true, envia a mensagem de forma assíncrona via fila interna

track_source
string
Origem do rastreamento da mensagem

Example: "chatwoot"

track_id
string
ID para rastreamento da mensagem (aceita valores duplicados)

Example: "msg_123456789"

/message/download
Baixar arquivo de uma mensagem
Baixa o arquivo associado a uma mensagem de mídia (imagem, vídeo, áudio, documento ou sticker).

Parâmetros
id (string, obrigatório): ID da mensagem
return_base64 (boolean, default: false): Retorna arquivo em base64
generate_mp3 (boolean, default: true): Para áudios, define formato de retorno
true: Retorna MP3
false: Retorna OGG
return_link (boolean, default: true): Retorna URL pública do arquivo
transcribe (boolean, default: false): Transcreve áudios para texto
openai_apikey (string, opcional): Chave OpenAI para transcrição
Se não informada, usa a chave salva na instância
Se informada, atualiza e salva na instância para próximas chamadas
download_quoted (boolean, default: false): Baixa mídia da mensagem citada
Útil para baixar conteúdo original de status do WhatsApp
Quando uma mensagem é resposta a um status, permite baixar a mídia do status original
Contextualização: Ao baixar a mídia citada, você identifica o contexto da conversa
Exemplo: Se alguém responde a uma promoção, baixando a mídia você saberá que a pergunta é sobre aquela promoção específica
Exemplos
Baixar áudio como MP3:
{
  "id": "7EB0F01D7244B421048F0706368376E0",
  "generate_mp3": true
}
Transcrever áudio:
{
  "id": "7EB0F01D7244B421048F0706368376E0",
  "transcribe": true
}
Apenas base64 (sem salvar):
{
  "id": "7EB0F01D7244B421048F0706368376E0",
  "return_base64": true,
  "return_link": false
}
Baixar mídia de status (mensagem citada):
{
  "id": "7EB0F01D7244B421048F0706368376E0",
  "download_quoted": true
}
Útil quando o cliente responde a uma promoção/status - você baixa a mídia original para entender sobre qual produto/oferta ele está perguntando.

Resposta
{
  "fileURL": "https://api.exemplo.com/files/arquivo.mp3",
  "mimetype": "audio/mpeg",
  "base64Data": "UklGRkj...",
  "transcription": "Texto transcrito"
}
Nota:

Por padrão, se não definido o contrário:
áudios são retornados como MP3.
E todos os pedidos de download são retornados com URL pública.
Transcrição requer chave OpenAI válida. A chave pode ser configurada uma vez na instância e será reutilizada automaticamente.
Retenção de mídia: mantemos as mídias no nosso storage por 2 dias. Após 2 dias, elas são removidas na limpeza automática e o link retornado deixa de ficar disponível. Para voltar a disponibilizar a mídia, é necessário refazer o download pelo endpoint. Se o cliente solicitar novamente, a mídia será baixada do CDN da Meta, o que pode aumentar o tempo de resposta. Enquanto estiver no nosso storage, a resposta tende a ser mais rápida.
Request
Body
id
string
required
ID da mensagem contendo o arquivo

Example: "7EB0F01D7244B421048F0706368376E0"

return_base64
boolean
Se verdadeiro, retorna o conteúdo em base64

generate_mp3
boolean
Para áudios, define formato de retorno (true=MP3, false=OGG)

return_link
boolean
Salva e retorna URL pública do arquivo

transcribe
boolean
Se verdadeiro, transcreve áudios para texto

openai_apikey
string
Chave da API OpenAI para transcrição (opcional)

Example: "sk-..."

download_quoted
boolean
Se verdadeiro, baixa mídia da mensagem citada ao invés da mensagem principal

/message/find
Buscar mensagens em um chat
Busca mensagens com múltiplos filtros disponíveis. Este endpoint permite:

Busca por ID específico: Use id para encontrar uma mensagem exata
Filtrar por chat: Use chatid para mensagens de uma conversa específica
Filtrar por rastreamento: Use track_source e track_id para mensagens com dados de tracking
Limitar resultados: Use limit para controlar quantas mensagens retornar
Ordenação: Resultados ordenados por data (mais recentes primeiro)
Request
Body
id
string
ID específico da mensagem para busca exata

Example: "user123:r3EB0538"

chatid
string
ID do chat no formato internacional

Example: "5511999999999@s.whatsapp.net"

track_source
string
Origem do rastreamento para filtrar mensagens

Example: "chatwoot"

track_id
string
ID de rastreamento para filtrar mensagens

Example: "msg_123456789"

limit
integer
Numero maximo de mensagens a retornar (padrao 100)

Example: 20

offset
integer
Deslocamento para paginacao (0 retorna as mensagens mais recentes)

/message/markread
Marcar mensagens como lidas
Marca uma ou mais mensagens como lidas. Este endpoint permite:

Marcar múltiplas mensagens como lidas de uma vez
Atualizar o status de leitura no WhatsApp
Sincronizar o status de leitura entre dispositivos
Exemplo de requisição básica:

{
  "id": [
    "62AD1AD844E518180227BF68DA7ED710",
    "ECB9DE48EB41F77BFA8491BFA8D6EF9B"  
  ]
}
Exemplo de resposta:

{
  "success": true,
  "message": "Messages marked as read",
  "markedMessages": [
    {
      "id": "62AD1AD844E518180227BF68DA7ED710",
      "timestamp": 1672531200000
    },
    {
      "id": "ECB9DE48EB41F77BFA8491BFA8D6EF9B",
      "timestamp": 1672531300000
    }
  ]
}
Parâmetros disponíveis:

id: Lista de IDs das mensagens a serem marcadas como lidas
Erros comuns:

401: Token inválido ou expirado
400: Lista de IDs vazia ou inválida
404: Uma ou mais mensagens não encontradas
500: Erro ao marcar mensagens como lidas
Request
Body
id
array
required
Lista de IDs das mensagens a serem marcadas como lidas

Example: ["62AD1AD844E518180227BF68DA7ED710","ECB9DE48EB41F77BFA8491BFA8D6EF9B"]

/message/react
Enviar reação a uma mensagem
Envia uma reação (emoji) a uma mensagem específica. Este endpoint permite:

Adicionar ou remover reações em mensagens

Usar qualquer emoji Unicode válido

Reagir a mensagens em chats individuais ou grupos

Remover reações existentes

Verificar o status da reação enviada

Tipos de reações suportados:

Qualquer emoji Unicode válido (👍, ❤️, 😂, etc)

String vazia para remover reação

Exemplo de requisição básica:


{
  "number": "5511999999999@s.whatsapp.net",
  "text": "👍",
  "id": "3EB0538DA65A59F6D8A251"
}

Exemplo de requisição para remover reação:


{
  "number": "5511999999999@s.whatsapp.net",
  "text": "",
  "id": "3EB0538DA65A59F6D8A251"
}

Exemplo de resposta:


{
  "success": true,
  "message": "Reaction sent",
  "reaction": {
    "id": "3EB0538DA65A59F6D8A251",
    "emoji": "👍",
    "timestamp": 1672531200000,
    "status": "sent"
  }
}

Exemplo de resposta ao remover reação:


{
  "success": true,
  "message": "Reaction removed",
  "reaction": {
    "id": "3EB0538DA65A59F6D8A251",
    "emoji": null,
    "timestamp": 1672531200000,
    "status": "removed"
  }
}

Parâmetros disponíveis:

number: Número do chat no formato internacional (ex: 5511999999999@s.whatsapp.net)

text: Emoji Unicode da reação (ou string vazia para remover reação)

id: ID da mensagem que receberá a reação

Erros comuns:

401: Token inválido ou expirado

400: Número inválido ou emoji não suportado

404: Mensagem não encontrada

500: Erro ao enviar reação

Limitações:

Só é possível reagir a mensagens enviadas por outros usuários

Não é possível reagir a mensagens antigas (mais de 7 dias)

O mesmo usuário só pode ter uma reação ativa por mensagem

Request
Body
number
string
required
Número do chat no formato internacional

Example: "5511999999999@s.whatsapp.net"

text
string
required
Emoji Unicode da reação (ou string vazia para remover reação)

Example: "👍"

id
string
required
ID da mensagem que receberá a reação

Example: "3EB0538DA65A59F6D8A251"

/message/delete
Apagar Mensagem Para Todos
Apaga uma mensagem para todos os participantes da conversa.

Funcionalidades:
Apaga mensagens em conversas individuais ou grupos
Funciona com mensagens enviadas pelo usuário ou recebidas
Atualiza o status no banco de dados
Envia webhook de atualização
Notas Técnicas:

O ID da mensagem pode ser fornecido em dois formatos:
ID completo (contém ":"): usado diretamente
ID curto: concatenado com o owner para busca
Gera evento webhook do tipo "messages_update"
Atualiza o status da mensagem para "Deleted"
Request
Body
id
string
required
ID da mensagem a ser apagada


/message/edit
Edita uma mensagem enviada
Edita o conteúdo de uma mensagem já enviada usando a funcionalidade nativa do WhatsApp.

O endpoint realiza:

Busca a mensagem original no banco de dados usando o ID fornecido
Edita o conteúdo da mensagem para o novo texto no WhatsApp
Gera um novo ID para a mensagem editada
Retorna objeto de mensagem completo seguindo o padrão da API
Dispara eventos SSE/Webhook automaticamente
Importante:

Só é possível editar mensagens enviadas pela própria instância
A mensagem deve existir no banco de dados
O ID pode ser fornecido no formato completo (owner:messageid) ou apenas messageid
A mensagem deve estar dentro do prazo permitido pelo WhatsApp para edição
Request
Body
id
string
required
ID único da mensagem que será editada (formato owner:messageid ou apenas messageid)

Example: "3A12345678901234567890123456789012"

text
string
required
Novo conteúdo de texto da mensagem

Example: "Texto editado da mensagem"


/chat/delete
Deleta chat
Deleta um chat e/ou suas mensagens do WhatsApp e/ou banco de dados. Você pode escolher deletar:

Apenas do WhatsApp
Apenas do banco de dados
Apenas as mensagens do banco de dados
Qualquer combinação das opções acima
Request
Body
number
string
required
Número do chat no formato internacional. Para grupos use o ID completo do grupo.

Example: "5511999999999"

deleteChatDB
boolean
Se true, deleta o chat do banco de dados

Example: true

deleteMessagesDB
boolean
Se true, deleta todas as mensagens do chat do banco de dados

Example: true

deleteChatWhatsApp
boolean
Se true, deleta o chat do WhatsApp

Example: true

/chat/archive
Arquivar/desarquivar chat
Altera o estado de arquivamento de um chat do WhatsApp.

Quando arquivado, o chat é movido para a seção de arquivados no WhatsApp
A ação é sincronizada entre todos os dispositivos conectados
Não afeta as mensagens ou o conteúdo do chat
Request
Body
number
string
required
Número do telefone (formato E.164) ou ID do grupo

Example: "5511999999999"

archive
boolean
required
true para arquivar, false para desarquivar

Example: true

/chat/read
Marcar chat como lido/não lido
Atualiza o status de leitura de um chat no WhatsApp.

Quando um chat é marcado como lido:

O contador de mensagens não lidas é zerado
O indicador visual de mensagens não lidas é removido
O remetente recebe confirmação de leitura (se ativado)
Quando marcado como não lido:

O chat aparece como pendente de leitura
Não afeta as confirmações de leitura já enviadas
Request
Body
number
string
required
Identificador do chat no formato:

Para usuários: [número]@s.whatsapp.net (ex: 5511999999999@s.whatsapp.net)
Para grupos: [id-grupo]@g.us (ex: 123456789-987654321@g.us)
Example: "5511999999999@s.whatsapp.net"

read
boolean
required
true: marca o chat como lido
false: marca o chat como não lido

/chat/mute
Silenciar chat
Silencia notificações de um chat por um período específico. As opções de silenciamento são:

0 - Remove o silenciamento
8 - Silencia por 8 horas
168 - Silencia por 1 semana (168 horas)
-1 - Silencia permanentemente
Request
Body
number
string
required
ID do chat no formato 123456789@s.whatsapp.net ou 123456789-123456@g.us

Example: "5511999999999@s.whatsapp.net"

muteEndTime
integer
required
Duração do silenciamento:

0 = Remove silenciamento
8 = Silencia por 8 horas
168 = Silencia por 1 semana
-1 = Silencia permanentemente
Valores possíveis: 0, 8, 168, -1
Example: 8

/chat/pin
Fixar/desafixar chat
Fixa ou desafixa um chat no topo da lista de conversas. Chats fixados permanecem no topo mesmo quando novas mensagens são recebidas em outros chats.

Request
Body
number
string
required
Número do chat no formato internacional completo (ex: "5511999999999") ou ID do grupo (ex: "123456789-123456@g.us")

Example: "5511999999999"

pin
boolean
required
Define se o chat deve ser fixado (true) ou desafixado (false)

Example: true

/chat/find
Busca chats com filtros
Busca chats com diversos filtros e ordenação. Suporta filtros em todos os campos do chat, paginação e ordenação customizada.

Operadores de filtro:

~ : LIKE (contém)
!~ : NOT LIKE (não contém)
!= : diferente
>= : maior ou igual
> : maior que
<= : menor ou igual
< : menor que
Sem operador: LIKE (contém)
Request
Body
operator
string
Operador lógico entre os filtros

Valores possíveis: AND, OR
sort
string
Campo para ordenação (+/-campo). Ex -wa_lastMsgTimestamp

limit
integer
Quantidade máxima de resultados a retornar

offset
integer
Número de registros a pular (para paginação)

wa_fastid
string
wa_chatid
string
wa_archived
boolean
wa_contactName
string
wa_name
string
name
string
wa_isBlocked
boolean
wa_isGroup
boolean
wa_isGroup_admin
boolean
wa_isGroup_announce
boolean
wa_isGroup_member
boolean
wa_isPinned
boolean
wa_label
string
lead_tags
string
lead_isTicketOpen
boolean
lead_assignedAttendant_id
string
lead_status
string


/contacts
Retorna lista de contatos do WhatsApp
Retorna a lista de contatos salvos na agenda do celular e que estão no WhatsApp.

O endpoint realiza:

Busca todos os contatos armazenados
Retorna dados formatados incluindo JID e informações de nome



/contacts/list
Listar todos os contatos com paginacao
Retorna uma lista paginada de contatos da instancia do WhatsApp. Use este endpoint (POST) para controlar pagina, tamanho e offset via corpo da requisicao. A rota GET /contacts continua disponivel para quem prefere a lista completa sem paginacao.

Request
Body
page
integer
Numero da pagina para paginacao (padrao 1)

pageSize
integer
Quantidade de resultados por pagina (padrao 100, maximo 1000)

limit
integer
Alias opcional para pageSize

offset
integer
Deslocamento base zero para paginacao; se informado recalcula a pagina

/contact/add
Adiciona um contato à agenda
Adiciona um novo contato à agenda do celular.

O endpoint realiza:

Adiciona o contato à agenda usando o WhatsApp
Usa o campo 'name' tanto para o nome completo quanto para o primeiro nome
Salva as informações do contato na agenda do WhatsApp
Retorna informações do contato adicionado
Request
Body
phone
string
required
Número de telefone no formato internacional com código do país obrigatório. Para Brasil, deve começar com 55. Aceita variações com/sem símbolo +, com/sem parênteses, com/sem hífen e com/sem espaços. Também aceita formato JID do WhatsApp (@s.whatsapp.net). Não aceita contatos comerciais (@lid) nem grupos (@g.us).

name
string
required
Nome completo do contato (será usado como primeiro nome e nome completo)

Example: "João Silva"

/contact/remove
Remove um contato da agenda
Remove um contato da agenda do celular.

O endpoint realiza:

Remove o contato da agenda usando o WhatsApp AppState
Atualiza a lista de contatos sincronizada
Retorna confirmação da remoção
Request
Body
phone
string
required
Número de telefone no formato internacional com código do país obrigatório. Para Brasil, deve começar com 55. Aceita variações com/sem símbolo +, com/sem parênteses, com/sem hífen e com/sem espaços. Também aceita formato JID do WhatsApp (@s.whatsapp.net). Não aceita contatos comerciais (@lid) nem grupos (@g.us).



/chat/details
Obter Detalhes Completos
Retorna informações completas sobre um contato ou chat, incluindo todos os campos disponíveis do modelo Chat.

Funcionalidades:
Retorna chat completo: Todos os campos do modelo Chat (mais de 60 campos)
Busca informações para contatos individuais e grupos
URLs de imagem em dois tamanhos: preview (menor) ou full (original)
Combina informações de diferentes fontes: WhatsApp, contatos salvos, leads
Atualiza automaticamente dados desatualizados no banco
Campos Retornados:
Informações básicas: id, wa_fastid, wa_chatid, owner, name, phone
Dados do WhatsApp: wa_name, wa_contactName, wa_archived, wa_isBlocked, etc.
Dados de lead/CRM: lead_name, lead_email, lead_status, lead_field01-20, etc.
Informações de grupo: wa_isGroup, wa_isGroup_admin, wa_isGroup_announce, etc.
Chatbot: chatbot_summary, chatbot_lastTrigger_id, chatbot_disableUntil, etc.
Configurações: wa_muteEndTime, wa_isPinned, wa_unreadCount, etc.
Comportamento:

Para contatos individuais:
Busca nome verificado do WhatsApp
Verifica nome salvo nos contatos
Formata número internacional
Calcula grupos em comum
Para grupos:
Busca nome do grupo
Verifica status de comunidade
Request
Body
number
string
required
Número do telefone ou ID do grupo

Example: "5511999999999"

preview
boolean
Controla o tamanho da imagem de perfil retornada:

true: Retorna imagem em tamanho preview (menor, otimizada para listagens)
false (padrão): Retorna imagem em tamanho full (resolução original, maior qualidade)

POST
/chat/check
Verificar Números no WhatsApp
Verifica se números fornecidos estão registrados no WhatsApp e retorna informações detalhadas.

Funcionalidades:
Verifica múltiplos números simultaneamente
Suporta números individuais e IDs de grupo
Retorna nome verificado quando disponível
Identifica grupos e comunidades
Verifica subgrupos de comunidades
Comportamento específico:

Para números individuais:
Verifica registro no WhatsApp
Retorna nome verificado se disponível
Normaliza formato do número
Para grupos:
Verifica existência
Retorna nome do grupo
Retorna id do grupo de anúncios se buscado por id de comunidade
Request
Body
numbers
array
Lista de números ou IDs de grupo para verificar

Example: ["5511999999999","123456789@g.us"]


POST
/chat/block
Bloqueia ou desbloqueia contato do WhatsApp
Bloqueia ou desbloqueia um contato do WhatsApp. Contatos bloqueados não podem enviar mensagens para a instância e a instância não pode enviar mensagens para eles.

Request
Body
number
string
required
Número do WhatsApp no formato internacional (ex. 5511999999999)

Example: "5511999999999"

block
boolean
required
True para bloquear, False para desbloquear

Example: true



GET
/chat/blocklist
Lista contatos bloqueados
Retorna a lista completa de contatos que foram bloqueados pela instância. Esta lista é atualizada em tempo real conforme contatos são bloqueados/desbloqueados.

POST
/chat/labels
Gerencia labels de um chat
Atualiza as labels associadas a um chat específico. Este endpoint oferece três modos de operação:

Definir todas as labels (labelids): Define o conjunto completo de labels para o chat, substituindo labels existentes
Adicionar uma label (add_labelid): Adiciona uma única label ao chat sem afetar as existentes
Remover uma label (remove_labelid): Remove uma única label do chat sem afetar as outras
Importante: Use apenas um dos três parâmetros por requisição. Labels inexistentes serão rejeitadas.

As labels devem ser fornecidas no formato id ou labelid encontradas na função get labels.

POST
/label/edit
Editar etiqueta
Edita uma etiqueta existente na instância. Permite alterar nome, cor ou deletar a etiqueta.

Request
Body
labelid
string
required
ID da etiqueta a ser editada

Example: "25"

name
string
Novo nome da etiqueta

Example: "responder editado"

color
integer
Código numérico da nova cor (0-19)

Example: 2

delete
boolean
Indica se a etiqueta deve ser deletada


GET
/labels
Buscar todas as etiquetas
Retorna a lista completa de etiquetas da instância.

POST
/group/create
Criar um novo grupo
Cria um novo grupo no WhatsApp com participantes iniciais.

Detalhes
Requer autenticação via token da instância
Os números devem ser fornecidos sem formatação (apenas dígitos)
Limitações
Mínimo de 1 participante além do criador
Comportamento
Retorna informações detalhadas do grupo criado
Inclui lista de participantes adicionados com sucesso/falha
Request
Body
name
string
required
Nome do grupo

Example: "uazapiGO grupo"

participants
array
required
Lista de números de telefone dos participantes iniciais

Example: ["5521987905995","5511912345678"]

POST
/group/info
Obter informações detalhadas de um grupo
Recupera informações completas de um grupo do WhatsApp, incluindo:

Detalhes do grupo
Participantes
Configurações
Link de convite (opcional)
Request
Body
groupjid
string
required
Identificador único do grupo (JID)

Example: "120363153742561022@g.us"

getInviteLink
boolean
Recuperar link de convite do grupo

Example: true

getRequestsParticipants
boolean
Recuperar lista de solicitações pendentes de participação

force
boolean
Forçar atualização, ignorando cache

POST
/group/inviteInfo
Obter informações de um grupo pelo código de convite
Retorna informações detalhadas de um grupo usando um código de convite ou URL completo do WhatsApp.

Esta rota permite:

Recuperar informações básicas sobre um grupo antes de entrar
Validar um link de convite
Obter detalhes como nome do grupo, número de participantes e restrições de entrada
Request
Body
invitecode
string
required
Código de convite ou URL completo do grupo. Pode ser um código curto ou a URL completa do WhatsApp.

POST
/group/join
Entrar em um grupo usando código de convite
Permite entrar em um grupo do WhatsApp usando um código de convite ou URL completo.

Características:

Suporta código de convite ou URL completo
Valida o código antes de tentar entrar no grupo
Retorna informações básicas do grupo após entrada bem-sucedida
Trata possíveis erros como convite inválido ou expirado
Request
Body
invitecode
string
required
Código de convite ou URL completo do grupo. Formatos aceitos:

Código completo: "IYnl5Zg9bUcJD32rJrDzO7"
URL completa: "https://chat.whatsapp.com/IYnl5Zg9bUcJD32rJrDzO7"
Example: "https://chat.whatsapp.com/IYnl5Zg9bUcJD32rJrDzO7"

POST
/group/leave
Sair de um grupo
Remove o usuário atual de um grupo específico do WhatsApp.

Requisitos:

O usuário deve estar conectado a uma instância válida
O usuário deve ser um membro do grupo
Comportamentos:

Se o usuário for o último administrador, o grupo será dissolvido
Se o usuário for um membro comum, será removido do grupo
Request
Body
groupjid
string
required
Identificador único do grupo (JID)

Formato: número@g.us
Exemplo válido: 120363324255083289@g.us
Example: "120363324255083289@g.us"

GET
/group/list
Listar todos os grupos
Retorna uma lista com todos os grupos disponíveis para a instância atual do WhatsApp.

Recursos adicionais:

Suporta atualização forçada do cache de grupos
Recupera informações detalhadas de grupos conectados
Parameters
Query Parameters
force
boolean
Se definido como true, força a atualização do cache de grupos. Útil para garantir que as informações mais recentes sejam recuperadas.

Comportamentos:

false (padrão): Usa informações em cache
true: Busca dados atualizados diretamente do WhatsApp
noparticipants
boolean
Se definido como true, retorna a lista de grupos sem incluir os participantes. Útil para otimizar a resposta quando não há necessidade dos dados dos participantes.

Comportamentos:

false (padrão): Retorna grupos com lista completa de participantes
true: Retorna grupos sem incluir os participantes


POST
/group/list
Listar todos os grupos com filtros e paginacao
Retorna uma lista com todos os grupos disponiveis para a instancia atual do WhatsApp, com opcoes de filtros e paginacao via corpo (POST). A rota GET continua para quem prefere a listagem direta sem paginacao.

Request
Body
page
integer
Numero da pagina para paginacao (padrao 1)

pageSize
integer
Quantidade de resultados por pagina (padrao 50, maximo 1000)

limit
integer
Alias opcional para pageSize

offset
integer
Deslocamento base zero; se informado recalcula a pagina

search
string
Texto para filtrar grupos por nome/JID

force
boolean
Se definido como true, forca a atualizacao do cache de grupos. Util para garantir que as informacoes mais recentes sejam recuperadas.

noParticipants
boolean
Se definido como true, retorna a lista de grupos sem incluir os participantes. Util para otimizar a resposta quando nao ha necessidade dos dados dos participantes.

POST
/group/resetInviteCode
Resetar código de convite do grupo
Gera um novo código de convite para o grupo, invalidando o código de convite anterior. Somente administradores do grupo podem realizar esta ação.

Principais características:

Invalida o link de convite antigo
Cria um novo link único
Retorna as informações atualizadas do grupo
Request
Body
groupjid
string
required
Identificador único do grupo (JID)

Example: "120363308883996631@g.us"

POST
/group/updateAnnounce
Configurar permissões de envio de mensagens no grupo
Define as permissões de envio de mensagens no grupo, permitindo restringir o envio apenas para administradores.

Quando ativado (announce=true):

Apenas administradores podem enviar mensagens
Outros participantes podem apenas ler
Útil para anúncios importantes ou controle de spam
Quando desativado (announce=false):

Todos os participantes podem enviar mensagens
Configuração padrão para grupos normais
Requer que o usuário seja administrador do grupo para fazer alterações.

Request
Body
groupjid
string
required
Identificador único do grupo no formato xxxx@g.us

Example: "120363339858396166@g.us"

announce
boolean
required
Controla quem pode enviar mensagens no grupo

Example: true

POST
/group/updateDescription
Atualizar descrição do grupo
Altera a descrição (tópico) do grupo WhatsApp especificado. Requer que o usuário seja administrador do grupo. A descrição aparece na tela de informações do grupo e pode ser visualizada por todos os participantes.

Request
Body
groupjid
string
required
JID (ID) do grupo no formato xxxxx@g.us

Example: "120363339858396166@g.us"

description
string
required
Nova descrição/tópico do grupo

Example: "Grupo oficial de suporte"

POST
/group/updateImage
Atualizar imagem do grupo
Altera a imagem do grupo especificado. A imagem pode ser enviada como URL ou como string base64.

Requisitos da imagem:

Formato: JPEG
Resolução máxima: 640x640 pixels
Imagens maiores ou diferente de JPEG não são aceitas pelo WhatsApp
Para remover a imagem atual, envie "remove" ou "delete" no campo image.

Request
Body
groupjid
string
required
JID do grupo

Example: "120363308883996631@g.us"

image
string
required
URL da imagem, string base64 ou "remove"/"delete" para remover. A imagem deve estar em formato JPEG e ter resolução máxima de 640x640.

POST
/group/updateLocked
Configurar permissão de edição do grupo
Define se apenas administradores podem editar as informações do grupo. Quando bloqueado (locked=true), apenas administradores podem alterar nome, descrição, imagem e outras configurações do grupo. Quando desbloqueado (locked=false), qualquer participante pode editar as informações.

Importante:

Requer que o usuário seja administrador do grupo
Afeta edições de nome, descrição, imagem e outras informações do grupo
Não controla permissões de adição de membros
Request
Body
groupjid
string
required
Identificador único do grupo (JID)

Example: "120363308883996631@g.us"

locked
boolean
required
Define permissões de edição:

true = apenas admins podem editar infos do grupo
false = qualquer participante pode editar infos do grupo
Example: true

POST
/group/updateName
Atualizar nome do grupo
Altera o nome de um grupo do WhatsApp. Apenas administradores do grupo podem realizar esta operação. O nome do grupo deve seguir as diretrizes do WhatsApp e ter entre 1 e 25 caracteres.

Request
Body
groupjid
string
required
Identificador único do grupo no formato JID

Example: "120363339858396166@g.us"

name
string
required
Novo nome para o grupo

Example: "Grupo de Suporte"

POST
/group/updateParticipants
Gerenciar participantes do grupo
Gerencia participantes do grupo através de diferentes ações:

Adicionar ou remover participantes
Promover ou rebaixar administradores
Aprovar ou rejeitar solicitações pendentes
Requer que o usuário seja administrador do grupo para executar as ações.

Request
Body
groupjid
string
required
JID (identificador) do grupo

Example: "120363308883996631@g.us"

action
string
required
Ação a ser executada:

add: Adicionar participantes ao grupo
remove: Remover participantes do grupo
promote: Promover participantes a administradores
demote: Remover privilégios de administrador
approve: Aprovar solicitações pendentes de entrada
reject: Rejeitar solicitações pendentes de entrada
Valores possíveis: add, remove, promote, demote, approve, reject
Example: "promote"

participants
array
required
Lista de números de telefone ou JIDs dos participantes. Para números de telefone, use formato internacional sem '+' ou espaços.

Example: ["5521987654321","5511999887766"]

POST
/community/create
Criar uma comunidade
Cria uma nova comunidade no WhatsApp. Uma comunidade é uma estrutura que permite agrupar múltiplos grupos relacionados sob uma única administração.

A comunidade criada inicialmente terá apenas o grupo principal (announcements), e grupos adicionais podem ser vinculados posteriormente usando o endpoint /community/updategroups.

Observações importantes:

O número que cria a comunidade torna-se automaticamente o administrador
A comunidade terá um grupo principal de anúncios criado automaticamente
Request
Body
name
string
required
Nome da comunidade

Example: "Comunidade do Bairro"

POST
/community/editgroups
Gerenciar grupos em uma comunidade
Adiciona ou remove grupos de uma comunidade do WhatsApp. Apenas administradores da comunidade podem executar estas operações.

Funcionalidades
Adicionar múltiplos grupos simultaneamente a uma comunidade
Remover grupos de uma comunidade existente
Suporta operações em lote
Limitações
Os grupos devem existir previamente
A comunidade deve existir e o usuário deve ser administrador
Grupos já vinculados não podem ser adicionados novamente
Grupos não vinculados não podem ser removidos
Ações Disponíveis
add: Adiciona os grupos especificados à comunidade
remove: Remove os grupos especificados da comunidade
Request
Body
community
string
required
JID (identificador único) da comunidade

Example: "120363153742561022@g.us"

action
string
required
Tipo de operação a ser realizada:

add - Adiciona grupos à comunidade
remove - Remove grupos da comunidade
Valores possíveis: add, remove
groupjids
array
required
Lista de JIDs dos grupos para adicionar ou remover

Example: ["120363324255083289@g.us","120363308883996631@g.us"]

POST
/quickreply/edit
Criar, atualizar ou excluir resposta rápida
Gerencia templates de respostas rápidas para agilizar o atendimento. Suporta mensagens de texto e mídia.

Para criar: não inclua o campo id
Para atualizar: inclua o id existente
Para excluir: defina delete: true e inclua o id
Observação: Templates originados do WhatsApp (onWhatsApp=true) não podem ser modificados ou excluídos.

Request
Body
id
string
Necessário para atualizações/exclusões, omitir para criação

Example: "rb9da9c03637452"

delete
boolean
Definir como true para excluir o template

shortCut
string
required
Atalho para acesso rápido ao template

Example: "saudacao1"

type
string
required
Tipo da mensagem

Valores possíveis: text, audio, myaudio, ptt, document, video, image
text
string
Obrigatório para mensagens do tipo texto

Example: "Olá! Como posso ajudar hoje?"

file
string
URL ou Base64 para tipos de mídia

Example: "https://exemplo.com/arquivo.pdf"

docName
string
Nome do arquivo opcional para tipo documento

Example: "apresentacao.pdf"

GET
/quickreply/showall
Listar todas as respostas rápidas
Retorna todas as respostas rápidas cadastradas para a instância autenticada

POST
/instance/updateFieldsMap
Atualizar campos personalizados de leads
Atualiza os campos personalizados (custom fields) de uma instância. Permite configurar até 20 campos personalizados para armazenamento de informações adicionais sobre leads.

Cada campo pode armazenar até 255 caracteres e aceita qualquer tipo de dado.

Campos disponíveis:

lead_field01 a lead_field20
Exemplo de uso:

Armazenar informações adicionais sobre leads
Criar campos personalizados para integração com outros sistemas
Armazenar tags ou categorias personalizadas
Manter histórico de interações com o lead
Exemplo de requisição:

{
  "lead_field01": "nome",
  "lead_field02": "email",
  "lead_field03": "telefone",
  "lead_field04": "cidade",
  "lead_field05": "estado",
  "lead_field06": "idade",
  "lead_field07": "interesses",
  "lead_field08": "origem",
  "lead_field09": "status",
  "lead_field10": "valor",
  "lead_field11": "observacoes",
  "lead_field12": "ultima_interacao",
  "lead_field13": "proximo_contato",
  "lead_field14": "vendedor",
  "lead_field15": "produto_interesse",
  "lead_field16": "fonte_captacao",
  "lead_field17": "score",
  "lead_field18": "tags",
  "lead_field19": "historico",
  "lead_field20": "custom"
}
Exemplo de resposta:

{
  "success": true,
  "message": "Custom fields updated successfully",
  "instance": {
    "id": "r183e2ef9597845",
    "name": "minha-instancia",
    "fieldsMap": {
      "lead_field01": "nome",
      "lead_field02": "email",
      "lead_field03": "telefone",
      "lead_field04": "cidade",
      "lead_field05": "estado",
      "lead_field06": "idade",
      "lead_field07": "interesses",
      "lead_field08": "origem",
      "lead_field09": "status",
      "lead_field10": "valor",
      "lead_field11": "observacoes",
      "lead_field12": "ultima_interacao",
      "lead_field13": "proximo_contato",
      "lead_field14": "vendedor",
      "lead_field15": "produto_interesse",
      "lead_field16": "fonte_captacao",
      "lead_field17": "score",
      "lead_field18": "tags",
      "lead_field19": "historico",
      "lead_field20": "custom"
    }
  }
}
Erros comuns:

400: Campos inválidos ou payload mal formatado
401: Token inválido ou expirado
404: Instância não encontrada
500: Erro ao atualizar campos no banco de dados
Restrições:

Cada campo pode ter no máximo 255 caracteres
Campos vazios serão mantidos com seus valores atuais
Apenas os campos enviados serão atualizados
Request
Body
lead_field01
string
Campo personalizado 01

lead_field02
string
Campo personalizado 02

lead_field03
string
Campo personalizado 03

lead_field04
string
Campo personalizado 04

lead_field05
string
Campo personalizado 05

lead_field06
string
Campo personalizado 06

lead_field07
string
Campo personalizado 07

lead_field08
string
Campo personalizado 08

lead_field09
string
Campo personalizado 09

lead_field10
string
Campo personalizado 10

lead_field11
string
Campo personalizado 11

lead_field12
string
Campo personalizado 12

lead_field13
string
Campo personalizado 13

lead_field14
string
Campo personalizado 14

lead_field15
string
Campo personalizado 15

lead_field16
string
Campo personalizado 16

lead_field17
string
Campo personalizado 17

lead_field18
string
Campo personalizado 18

lead_field19
string
Campo personalizado 19

lead_field20
string
Campo personalizado 20

POST
/chat/editLead
Edita informações de lead
Atualiza as informações de lead associadas a um chat. Permite modificar status do ticket, atribuição de atendente, posição no kanban, tags e outros campos customizados.

As alterações são refletidas imediatamente no banco de dados e disparam eventos webhook/SSE para manter a aplicação sincronizada.

Request
Body
id
string
required
Identificador do chat. Pode ser:

wa_chatid (ex: "5511999999999@s.whatsapp.net")
wa_fastid (ex: "5511888888888:5511999999999")
Example: "5511999999999@s.whatsapp.net"

chatbot_disableUntil
integer
Timestamp UTC até quando o chatbot deve ficar desativado para este chat. Use 0 para reativar imediatamente.

Example: 1735686000

lead_isTicketOpen
boolean
Status do ticket associado ao lead.

true: Ticket está aberto/em atendimento
false: Ticket está fechado/resolvido
Example: true

lead_assignedAttendant_id
string
ID do atendente atribuído ao lead. Use string vazia ("") para remover a atribuição.

Example: "att_123456"

lead_kanbanOrder
integer
Posição do card no quadro kanban. Valores maiores aparecem primeiro.

Example: 1000

lead_tags
array
Lista de tags associadas ao lead. Tags inexistentes são criadas automaticamente. Envie array vazio ([]) para remover todas as tags.

Example: ["vip","suporte","prioridade-alta"]

lead_name
string
Nome principal do lead

Example: "João Silva"

lead_fullName
string
Nome completo do lead

Example: "João Silva Pereira"

lead_email
string
Email do lead

Example: "joao@exemplo.com"

lead_personalid
string
Documento de identificação (CPF/CNPJ) Apenas números ou formatado

Example: "123.456.789-00"

lead_status
string
Status do lead no funil de vendas

Example: "qualificado"

lead_notes
string
Anotações sobre o lead

Example: "Cliente interessado em plano premium"

lead_field01
string
Campo personalizado 1

lead_field02
string
Campo personalizado 2

lead_field03
string
Campo personalizado 3

lead_field04
string
Campo personalizado 4

lead_field05
string
Campo personalizado 5

lead_field06
string
Campo personalizado 6

lead_field07
string
Campo personalizado 7

lead_field08
string
Campo personalizado 8

lead_field09
string
Campo personalizado 9

lead_field10
string
Campo personalizado 10

lead_field11
string
Campo personalizado 11

lead_field12
string
Campo personalizado 12

lead_field13
string
Campo personalizado 13

lead_field14
string
Campo personalizado 14

lead_field15
string
Campo personalizado 15

lead_field16
string
Campo personalizado 16

lead_field17
string
Campo personalizado 17

lead_field18
string
Campo personalizado 18

lead_field19
string
Campo personalizado 19

lead_field20
string
Campo personalizado 20


POST
/sender/simple
Criar nova campanha (Simples)
Cria uma nova campanha de envio com configurações básicas

Request
Body
numbers
array
required
Lista de números para envio

Example: ["5511999999999@s.whatsapp.net"]

type
string
required
Tipo da mensagem

Valores possíveis: text, image, video, audio, document, contact, location, list, button, poll, carousel
folder
string
Nome da campanha de envio

Example: "Campanha Janeiro"

delayMin
integer
required
Delay mínimo entre mensagens em segundos

Example: 10

delayMax
integer
required
Delay máximo entre mensagens em segundos

Example: 30

scheduled_for
integer
required
Timestamp em milissegundos ou minutos a partir de agora para agendamento

Example: 1706198400000

info
string
Informações adicionais sobre a campanha

delay
integer
Delay fixo entre mensagens (opcional)

mentions
string
Menções na mensagem em formato JSON

text
string
Texto da mensagem

linkPreview
boolean
Habilitar preview de links em mensagens de texto. O preview será gerado automaticamente a partir da URL contida no texto.

linkPreviewTitle
string
Título personalizado para o preview do link (opcional)

linkPreviewDescription
string
Descrição personalizada para o preview do link (opcional)

linkPreviewImage
string
URL ou dados base64 da imagem para o preview do link (opcional)

linkPreviewLarge
boolean
Se deve usar preview grande ou pequeno (opcional, padrão false)

file
string
URL da mídia ou arquivo (quando type é image, video, audio, document, etc.)

docName
string
Nome do arquivo (quando type é document)

fullName
string
Nome completo (quando type é contact)

phoneNumber
string
Número do telefone (quando type é contact)

organization
string
Organização (quando type é contact)

email
string
Email (quando type é contact)

url
string
URL (quando type é contact)

latitude
number
Latitude (quando type é location)

longitude
number
Longitude (quando type é location)

name
string
Nome do local (quando type é location)

address
string
Endereço (quando type é location)

footerText
string
Texto do rodapé (quando type é list, button, poll ou carousel)

buttonText
string
Texto do botão (quando type é list, button, poll ou carousel)

listButton
string
Texto do botão da lista (quando type é list)

selectableCount
integer
Quantidade de opções selecionáveis (quando type é poll)

choices
array
Lista de opções (quando type é list, button, poll ou carousel). Para carousel, use formato específico com [texto], {imagem} e botões

imageButton
string
URL da imagem para o botão (quando type é button)

POST
/sender/advanced
Criar envio em massa avançado
Cria um novo envio em massa com configurações avançadas, permitindo definir múltiplos destinatários e mensagens com delays personalizados.

Request
Body
delayMin
integer
Delay mínimo entre mensagens (segundos)

Example: 3

delayMax
integer
Delay máximo entre mensagens (segundos)

Example: 6

info
string
Descrição ou informação sobre o envio em massa

Example: "Campanha de lançamento"

scheduled_for
integer
Timestamp em milissegundos (date unix) ou minutos a partir de agora para agendamento

Example: 1

messages
array
required
Lista de mensagens a serem enviadas

POST
/sender/edit
Controlar campanha de envio em massa
Permite controlar campanhas de envio de mensagens em massa através de diferentes ações:

Ações Disponíveis:
🛑 stop - Pausar campanha

Pausa uma campanha ativa ou agendada
Altera o status para "paused"
Use quando quiser interromper temporariamente o envio
Mensagens já enviadas não são afetadas
▶️ continue - Continuar campanha

Retoma uma campanha pausada
Altera o status para "scheduled"
Use para continuar o envio após pausar uma campanha
Não funciona em campanhas já concluídas ("done")
🗑️ delete - Deletar campanha

Remove completamente a campanha
Deleta apenas mensagens NÃO ENVIADAS (status "scheduled")
Mensagens já enviadas são preservadas no histórico
Operação é executada de forma assíncrona
Status de Campanhas:
scheduled: Agendada para envio
sending: Enviando mensagens
paused: Pausada pelo usuário
done: Concluída (não pode ser alterada)
deleting: Sendo deletada (operação em andamento)
Request
Body
folder_id
string
required
Identificador único da campanha de envio

Example: "folder_123"

action
string
required
Ação a ser executada na campanha:

stop: Pausa a campanha (muda para status "paused")
continue: Retoma campanha pausada (muda para status "scheduled")
delete: Remove campanha e mensagens não enviadas (assíncrono)
Valores possíveis: stop, continue, delete
Example: "stop"

POST
/sender/cleardone
Limpar mensagens enviadas
Inicia processo de limpeza de mensagens antigas em lote que já foram enviadas com sucesso. Por padrão, remove mensagens mais antigas que 7 dias.

Request
Body
hours
integer
Quantidade de horas para manter mensagens. Mensagens mais antigas que esse valor serão removidas.

Example: 168

DELETE
/sender/clearall
Limpar toda fila de mensagens
Remove todas as mensagens da fila de envio em massa, incluindo mensagens pendentes e já enviadas. Esta é uma operação irreversível.

GET
/sender/listfolders
Listar campanhas de envio
Retorna todas as campanhas de mensagens em massa com possibilidade de filtro por status

Parameters
Query Parameters
status
string
Filtrar campanhas por status

POST
/sender/listmessages
Listar mensagens de uma campanha
Retorna a lista de mensagens de uma campanha específica, com opções de filtro por status e paginação

Request
Body
folder_id
string
required
ID da campanha a ser consultada

messageStatus
string
Status das mensagens para filtrar

Valores possíveis: Scheduled, Sent, Failed
page
integer
Número da página para paginação

pageSize
integer
Quantidade de itens por página

