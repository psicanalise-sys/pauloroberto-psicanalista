# Integração A Estrada → Google Sheets → E-mail

Status: código preparado na branch `dev`. A publicação do Web App do Google Apps Script ainda precisa ser feita pelo proprietário da conta Google.

## O que o backend faz

1. recebe a conclusão da experiência;
2. valida nome, e-mail, WhatsApp e consentimento;
3. cria um `Lead ID`;
4. registra o lead em `LEADS`;
5. grava respostas completas em `A_ESTRADA`;
6. registra eventos em `INTERACOES`;
7. agenda referência de follow-up de 48h em `FOLLOW_UP`;
8. envia e-mail de devolutiva/registro;
9. mantém a interpretação automática desligada enquanto a matriz não estiver validada.

## Governança

`ENABLE_INTERPRETIVE_RESULT` permanece `false`. Mesmo quando for ativado, o código só usa linhas da aba `MATRIZ_RESPOSTAS` cujo campo `Revisão Paulo` esteja exatamente como `Aprovado`.

## Implantação

Criar um projeto do Google Apps Script na conta operacional do Paulo, copiar `Code.gs` e `appsscript.json`, implantar como Web App executando como o proprietário e permitir acesso ao público necessário para o formulário.

Após o deploy, copiar a URL `/exec` e colocá-la em `API_ENDPOINT` dentro de `experiencias/a-estrada/index.html` na branch `dev`.

Antes de qualquer merge para `main`, executar teste completo com um lead fictício e conferir as quatro abas do CRM e o recebimento do e-mail.


# Homologação — A Estrada 2.3.1-dev

## Estado atual

Fluxo validado em ambiente `dev`:

- GitHub Pages carregando o site e A Estrada;
- Web App do Google Apps Script respondendo;
- criação de Lead ID;
- gravação em `LEADS`;
- gravação completa em `A_ESTRADA`;
- eventos em `INTERACOES`;
- referência de follow-up em `FOLLOW_UP`;
- e-mail de retorno registrado como enviado;
- interpretação automática desativada enquanto a matriz estiver pendente de validação.

## Correção 2.3.1

A resposta da etapa de trajeto possui dois componentes:

- escolha visual/comportamental (`choice`);
- observação livre (`note`).

A versão 2.3.1 normaliza esses componentes no CRM:

- `Ato 2 - Caminho`: terreno + escolha do trajeto;
- `Trajeto`: somente a escolha;
- `Micropergunta-chave`: texto livre da observação;
- `Payload JSON`: preserva a resposta original completa.

A mesma normalização é usada pelo motor interpretativo futuro, evitando que um objeto JSON seja comparado diretamente com os códigos da matriz.

## Teste final necessário após nova implantação do Apps Script

1. atualizar o Apps Script com o `Code.gs` desta branch;
2. criar nova versão da implantação existente;
3. manter a mesma URL `/exec`;
4. fazer uma nova jornada fictícia;
5. verificar se `Trajeto` contém apenas algo como `curvas`;
6. verificar se `Micropergunta-chave` contém apenas o texto digitado;
7. confirmar os eventos `estrada_completed` e `result_sent`;
8. confirmar o follow-up de 48h;
9. manter `ENABLE_INTERPRETIVE_RESULT = false`.

Somente depois dessa validação a versão deve ser considerada candidata a merge em `main`.
