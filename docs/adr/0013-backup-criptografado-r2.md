# 0013 — Backup diário criptografado com age, enviado ao Cloudflare R2

- Status: aceito
- Contexto:
  - O planejamento pede `pg_dump` diário, compactado e criptografado, enviado ao Cloudflare R2, com 30 dias de retenção e restauração testada (perda máxima de 24 h, restauração em até 2 h).
  - O banco fica na mesma VPS que outros projetos (ADR 0003), então o backup precisa sair dela.
  - O backup não pode depender do app estar no ar, o que descarta o pg-boss (ADR 0007).
  - Os dados de clientes de cada banho e tosa são pessoais (LGPD): o arquivo não pode ser legível por quem tiver acesso ao bucket ou à VPS.
- Decisão:
  - **Imagem separada** (`backup/Dockerfile`), sobre `postgres:18.6-alpine3.24`, com o `pg_dump` do mesmo major do servidor, mais `age`, `rclone` e `tzdata` do apk. Ela roda como o usuário `postgres` da imagem, sem root, e não leva o app nem dependências npm.
  - **Fluxo** (`backup/backup.sh`):
    1. `pg_dump --format=custom` (já compactado).
    2. `age` com a **chave pública**, gravando num arquivo temporário. Assim, uma falha no dump nunca envia um arquivo pela metade.
    3. `rclone copyto` para `r2:<bucket>/banho-e-tosa/banho-e-tosa-<data UTC>.dump.age`.
    4. Retenção.
    5. Heartbeat opcional.
    - Qualquer falha sai com código diferente de zero, não apaga nada e chama `<heartbeat>/fail`. Nada no log mostra valores de variáveis.
    - Nenhum segredo vai nos argumentos dos programas, que aparecem no `ps` da VPS: a senha do banco vai por `PGPASSWORD` (a URL nos argumentos fica sem senha), a credencial do R2 por variáveis do rclone e a URL do heartbeat por um arquivo temporário (`rclone copyurl --urls`). O `npm run test:backup` confere os argumentos de cada programa chamado.
  - **Chave:**
    - A VPS só guarda a chave pública (`BACKUP_AGE_DESTINATARIO`).
    - A chave privada nunca fica na VPS nem no repositório. Fica no gerenciador de senhas do Victor, com **uma segunda cópia fora deste computador e fora do gerenciador**, porque sem ela os backups não abrem.
    - A chave privada só é montada no container na hora de restaurar.
  - **Papel `backup` no banco:** `LOGIN`, `BYPASSRLS` e membro de `pg_read_all_data`.
    - Lê todas as tabelas de todas as empresas, como o `pg_dump` precisa, e não grava, não apaga, não muda a estrutura e não é dono de nada. Os testes de estrutura e de integração conferem isso.
    - Criar papel com `BYPASSRLS` exige o superusuário do Postgres.
    - Não tem acesso externo: o Postgres fica só na rede interna do EasyPanel.
  - **Retenção no R2:**
    - O R2 só tem tokens "Object Read & Write" e "Object Read only" ([tokens do R2](https://developers.cloudflare.com/r2/api/tokens/)). Não existe token que grave sem poder apagar.
    - Por isso o script apaga os backups com **mais de 31 dias, e só depois de um envio bem-sucedido**. Se o backup parar de rodar, os antigos não somem.
    - **Risco aceito:** quem roubar a credencial do backup consegue apagar objetos.
    - **Mitigação:** uma regra de [Bucket Lock](https://developers.cloudflare.com/r2/buckets/bucket-locks/) de 30 dias no prefixo `banho-e-tosa/` bloqueia apagar ou sobrescrever qualquer backup mais novo que isso, mesmo com a credencial.
  - **Agendamento:**
    - Um serviço "backup" no EasyPanel com essa imagem, cujo comando padrão é `agendar.sh`: um laço em `sh` que dorme até `BACKUP_HORARIO` (padrão 03:00) no fuso `TZ` (padrão `America/Sao_Paulo`, sem horário de verão; 03:00 em São Paulo = 06:00 UTC).
    - O monitor externo recebe o heartbeat do sucesso e avisa quando ele não chega.
  - **Restauração** (`backup/restaurar.sh`):
    - Sempre num banco **separado e vazio**, criado antes junto com os quatro papéis (o `pg_dump` não leva papéis).
    - Roda `pg_restore --no-owner --exit-on-error --single-transaction` como o `migrador`.
    - Confere as linhas por tabela e o RLS. Depois rodam os testes de isolamento contra o banco restaurado.
  - **Teste automatizado** (`npm run test:backup`, em Docker, também no Windows):
    - cria duas empresas, testa os caminhos de falha, faz o backup, restaura e compara linhas, estrutura, permissões e isolamento;
    - roda os testes de isolamento contra o banco restaurado;
    - o S3 local é o próprio `rclone serve s3`, porque o MinIO parou de publicar a imagem da edição comunitária em outubro de 2025.
  - **Rotina:** restauração testada antes do lançamento e depois uma vez por mês (runbook).
- Alternativas consideradas:
  - `gpg` no lugar do `age`: também usa chave pública, mas traz chaveiro, configuração e mais maneiras de errar.
  - `aws-cli` no lugar do `rclone`: imagem bem maior (Python) e sem apagar por idade sem um script em volta.
  - Regra de ciclo de vida do R2 como retenção principal: apaga os backups antigos mesmo quando o backup parou de rodar. Pode chegar a não sobrar nenhum.
  - pg-boss ou cron dentro do app: o backup deixaria de rodar justamente quando o app estivesse fora do ar.
  - Crontab do host com `docker run`: funciona, mas fica fora do painel e é mais fácil de esquecer.
  - Fazer o dump com o `migrador`: lê tudo sem RLS, por ser o dono, mas a credencial no serviço de backup poderia apagar tabelas.
  - Backup próprio do EasyPanel: não criptografa com uma chave que fica fora da VPS, e não testamos a restauração nem o isolamento depois dela.
- Consequências:
  - Positivas:
    - O arquivo no R2 não abre sem a chave privada, que não está nem na VPS nem no bucket.
    - O backup roda mesmo com o app fora do ar.
    - A restauração e o isolamento depois dela são testados automaticamente no CI.
  - Negativas:
    - Há um quarto papel no banco, com `BYPASSRLS`, que precisa de superusuário para ser criado e de cuidado com a senha.
    - Perder as duas cópias da chave privada torna todos os backups inúteis.
    - A credencial do bucket pode apagar objetos, risco reduzido pelo Bucket Lock.
    - Mais um serviço para operar no EasyPanel.
