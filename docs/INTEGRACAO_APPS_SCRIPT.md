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
