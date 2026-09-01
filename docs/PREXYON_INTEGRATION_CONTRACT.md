# Contrato pendente de integração Prexyon → ArteCheck

O ArteCheck está preparado para operar como módulo da Prexyon. Este documento registra exclusivamente o trabalho que deve ser concluído quando o shell e a autenticação da Prexyon estiverem prontos.

## Identidade recebida

A Prexyon deverá fornecer ao ArteCheck:

- `accessToken`: JWT curto e verificável pelo backend;
- `userId`: identificador imutável do usuário;
- `organizationId`: empresa ativa;
- `displayName`: nome apresentado no shell global;
- `roles`: permissões do usuário na organização;
- `planCode` e limites: definidos e exibidos somente pela Prexyon.

O ArteCheck não deve possuir formulário próprio de login, cadastro, planos ou checkout.

## Transporte da sessão

Preferência: abrir o ArteCheck como rota/módulo do mesmo domínio e compartilhar a sessão por cookie seguro `HttpOnly`, `Secure` e `SameSite=Lax` ou por troca de token de curta duração no backend.

Se o módulo for hospedado em domínio distinto, a Prexyon deverá fornecer um token de inicialização de uso único. Não transmitir JWT persistente por query string e não usar `localStorage` como fonte autoritativa da sessão.

## Validação no backend

Antes de uploads, correções e relatórios persistidos, o backend deverá:

1. validar assinatura, emissor, audiência e expiração do token;
2. resolver usuário e organização sem confiar em IDs enviados no corpo;
3. validar membership e permissões na organização ativa;
4. aplicar limites fornecidos pelo serviço de entitlement da Prexyon;
5. registrar auditoria por `userId`, `organizationId`, `analysisId` e `requestId`.

## Integração visual

O shell global deverá substituir o indicador “Integração Prexyon pendente” pelos dados reais de empresa e usuário. Notificações, configurações, ajuda e troca de produto só devem aparecer quando houver rotas ou ações reais fornecidas pela Prexyon.

## Critérios de aceite

- sessão expirada redireciona para a Prexyon sem exibir login interno;
- troca de empresa altera o escopo de histórico e perfis;
- usuário não acessa dados de outra organização;
- logout global invalida o acesso ao ArteCheck;
- limites e planos não são duplicados no módulo;
- CORS permite apenas origens oficiais configuradas;
- nenhum segredo ou token aparece em logs, URLs ou mensagens públicas.
