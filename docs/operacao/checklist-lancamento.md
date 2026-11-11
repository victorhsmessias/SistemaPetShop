# Checklist de lançamento do Marco 1

Passo a passo para o Victor colocar homologação e produção no ar, em ordem. Marque cada item. Comandos e detalhes de
operação estão no [runbook](README.md), e cada variável está em [variaveis.md](variaveis.md). Nenhum segredo vai para
o repositório nem para conversas: senhas, tokens e chaves ficam no gerenciador de senhas e nas variáveis do
EasyPanel ou do GitHub.

Faça tudo primeiro na **homologação** e só depois repita na **produção**. Os dois ambientes são projetos separados
no EasyPanel, cada um com o próprio Postgres, as próprias senhas e o próprio `BETTER_AUTH_SECRET`.

## 0. Antes de começar

- [ ] Contas: GitHub (dono do repositório), EasyPanel na VPS, Cloudflare (R2), UptimeRobot e Healthchecks.io.
- [ ] O CI da `main` passou em tudo o que vem antes do deploy (Actions → CI): `verificar`, `teste-imagem`,
      `teste-backup` e `publicar` verdes. **O job `deploy-homologacao` fica vermelho de propósito** a partir do
      primeiro push depois do merge, com `Secret EASYPANEL_GATILHO_HOMOLOGACAO não configurado`: o gatilho só existe
      depois que o serviço do app for criado. Essa falha é esperada e some no passo 6, quando você cadastra o secret
      e roda o CI da `main` de novo. Até lá, cada push na `main` deixa a execução vermelha só por esse job; qualquer
      outro job vermelho é problema de verdade. (O `deploy-producao` só roda em tag `v*` e tem a mesma falha
      esperada até o secret da produção, também no passo 6.)
- [ ] O domínio ainda não está definido: tudo funciona com a URL provisória do EasyPanel, e nada no código depende
      do domínio final. Quando o domínio chegar, troque `BETTER_AUTH_URL` (e o monitor) e faça o deploy.

## 1. Postgres 18 (homologação e produção)

- [ ] No projeto do ambiente: novo serviço Postgres com a imagem **`postgres:18`**, a mesma versão do desenvolvimento
      e do CI. Guarde a senha do superusuário `postgres` no gerenciador de senhas.
- [ ] **Não exponha a porta** do Postgres para fora: ele só atende na rede interna do EasyPanel. É o que mantém o
      papel `backup` (que tem `BYPASSRLS`) sem acesso externo.
- [ ] Recursos do serviço: limite de 1 GB e 1 CPU em produção (metade na homologação). Ver os
      [limites](README.md#limites-de-memória-e-cpu-sugeridos).
- [ ] Os quatro usuários do banco: Shell do serviço → `psql -U postgres`, e cole o SQL de
      [Papéis do banco](README.md#papéis-do-banco). Troque cada `<SENHA_...>` por uma senha forte e diferente.
      Criar o `backup` com `BYPASSRLS` exige o superusuário: é por isso que esse passo é feito como `postgres`.
- [ ] O papel `app` ficou com o limite de conexões:
      `select rolname, rolconnlimit from pg_roles where rolname = 'app';` devolve `app | 30`. O motivo do valor está
      em [Limite de conexões do papel app](README.md#limite-de-conexões-do-papel-app). Num servidor em que o papel
      já existia: `alter role app connection limit 30;`.
- [ ] Ainda no `psql`, a extensão de busca sem acento está disponível:
      `select name from pg_available_extensions where name = 'unaccent';` devolve uma linha. A primeira migration a
      cria como `migrador`, que é o dono do banco.
- [ ] Opcional, reforço do "sem acesso externo": no `pg_hba.conf`, deixe o `backup` entrar só pela rede interna,
      por exemplo `host banho_e_tosa backup 10.0.0.0/8 scram-sha-256`, antes de uma regra que o recuse de qualquer
      outro lugar (`host all backup 0.0.0.0/0 reject`).
- [ ] Anote o host interno do Postgres (aba de credenciais do serviço). Ele entra nas URLs do app e do backup.

## 2. Acesso do EasyPanel às imagens (GHCR)

O GitHub Packages só aceita **token clássico** (`read:packages`) para baixar imagens privadas
([docs](https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-container-registry)).
Esse token lê **todos** os pacotes que a conta alcança, não pode ser restrito a um só e pode nunca expirar.

- [ ] Crie uma **conta de máquina** no GitHub (por exemplo `banho-e-tosa-deploy`), sem acesso a mais nada.
- [ ] Depois que o job `publicar` passar na `main` (o `deploy-homologacao` vermelho é esperado, passo 0), em Packages → `banho-e-tosa` e `banho-e-tosa-backup` → Package
      settings, dê à conta de máquina acesso de **leitura**.
- [ ] Com a conta de máquina, crie um token clássico só com `read:packages` e **validade de 1 ano**. Ponha um lembrete
      de rotação no calendário, um mês antes de vencer.
- [ ] No EasyPanel, use esse token como credencial do registro `ghcr.io` (usuário: a conta de máquina) nos serviços
      `app` e `backup`.
- [ ] Alternativa descartada: tornar as imagens públicas dispensaria o token, mas publicaria o código do app.

## 3. Serviço do app (ainda sem deploy)

O app **não sobe** em homologação e produção sem `BETTER_AUTH_URL` com https e sem `BETTER_AUTH_TRUSTED_PROXIES`.
Por isso tudo é configurado antes do primeiro deploy, no passo 4.

- [ ] Na VPS (SSH), descubra a faixa da rede do proxy do EasyPanel (Traefik). A rede `easypanel` existe desde a
      instalação do painel, antes de qualquer serviço:
      `docker network inspect easypanel --format '{{range .IPAM.Config}}{{.Subnet}} {{end}}'`
      (por exemplo `10.0.1.0/24`). Se houver mais de uma faixa, separe-as por vírgula. Por que isso importa: passo 5.
- [ ] Novo serviço App → Source: imagem `ghcr.io/victorhsmessias/banho-e-tosa:homologacao` (na produção,
      `...:producao`), com a credencial do passo 2. **Não faça o deploy ainda.**
- [ ] Variáveis (valores reais só aqui; ver [variaveis.md](variaveis.md)):
      - `DATABASE_URL=postgres://app:<SENHA_APP>@<host interno>:5432/banho_e_tosa`
      - `DATABASE_URL_PLATAFORMA=postgres://plataforma:<SENHA_PLATAFORMA>@<host interno>:5432/banho_e_tosa`
      - `BETTER_AUTH_SECRET`: novo, 64 caracteres hex, diferente em cada ambiente
        (`node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`).
      - `BETTER_AUTH_URL`: passo 4 (antes do deploy).
      - `BETTER_AUTH_TRUSTED_PROXIES=<faixa>`: a faixa descoberta acima.
- [ ] **Credencial do migrador em arquivo, não em variável** (ADR 0015): Mounts → **File Mount**, caminho
      `/segredos/database_url_migrador` (exatamente esse), conteúdo
      `postgres://migrador:<SENHA_MIGRADOR>@<host interno>:5432/banho_e_tosa` numa linha. A imagem lê o arquivo como
      root, migra e só então troca para o usuário `node`. **Não crie** a variável `DATABASE_URL_MIGRADOR`: com ela, o
      container não sobe.
- [ ] Não defina outro usuário para o container: ele precisa subir como root para ler o arquivo (o servidor e o
      healthcheck rodam como `node`).
- [ ] Recursos: limite de 512 MB e 1 CPU em produção (metade na homologação).
- [ ] Na configuração de deploy do serviço, ligue o **deploy sem queda** (zero-downtime). Só a opção: o primeiro
      deploy é no passo 4.
- [ ] Porta do domínio: **3000**.

## 4. URL provisória, HTTPS e primeiro deploy

- [ ] No serviço do app, adicione o domínio provisório que o EasyPanel oferece, com **HTTPS** (certificado
      automático).
- [ ] `BETTER_AUTH_URL` = essa URL exata, com `https://` e sem barra no fim. Ela precisa ser a URL que o navegador
      abre (protocolo, host e porta). O app **não sobe** em homologação e produção sem https.
- [ ] Confira que as três exigências da subida estão no serviço: `BETTER_AUTH_URL` (https), `BETTER_AUTH_TRUSTED_PROXIES`
      (passo 3) e a montagem `/segredos/database_url_migrador` (passo 3).
- [ ] Primeiro deploy. No log: `Migrations: aplicando como migrador...`, depois `Migrations: em dia` e o servidor
      pronto. Se aparecer "O app não vai iniciar", a mensagem diz qual variável corrigir. Se aparecer
      `falta o arquivo /segredos/database_url_migrador` ou `o usuário node consegue ler`, confira o caminho da
      montagem do passo 3.
- [ ] Confira que a credencial ficou fora do alcance do servidor: no Shell do app,
      `su -s /bin/sh node -c 'cat /segredos/database_url_migrador'` responde `Permission denied`.
- [ ] `https://<url>/api/health` responde `{"status":"ok"}`.

## 5. Proxy confiável (conferência)

Sem `BETTER_AUTH_TRUSTED_PROXIES`, atrás do proxy do EasyPanel (Traefik), o Better Auth pode não achar o IP de cada
cliente. Aí todos dividem o mesmo limite de tentativas: **cinco senhas erradas de qualquer pessoa bloqueiam o login
de todas por um minuto**. Por isso o app não sobe sem ela em homologação e produção, e recusa faixas abertas
(`0.0.0.0/0`, `::/0`). A faixa foi configurada no passo 3, antes do primeiro deploy; aqui você confere que ela é a
certa.

- [ ] Como achar a faixa (o mesmo comando do passo 3, na VPS):
      `docker network inspect easypanel --format '{{range .IPAM.Config}}{{.Subnet}} {{end}}'`. Ela precisa ser a
      mesma que está em `BETTER_AUTH_TRUSTED_PROXIES`. Se a faixa mudar (o painel recriou a rede `easypanel`, por
      exemplo), troque a variável e faça o deploy.
- [ ] Cloudflare na frente (nuvem laranja): comece com o DNS **sem proxy** (nuvem cinza). Com o proxy da Cloudflare,
      o IP que chega ao Traefik é o da Cloudflare, e a configuração muda (faixas da Cloudflare em
      <https://www.cloudflare.com/ips/>, confiadas no Traefik e no app). Deixe isso para quando houver domínio.
- [ ] Teste: do celular no 4G, erre a senha 5 vezes. Ele fica bloqueado por um minuto, mas outro aparelho em outra
      rede (Wi-Fi) entra normalmente.
- [ ] No log do app **não** aparece `could not determine a client IP`.

## 6. Gatilhos de deploy no GitHub

- [ ] EasyPanel → serviço do app → Deployments → copie a URL do **Deployment Trigger**. Trocar o token dela invalida
      a antiga.
- [ ] GitHub → Settings → Environments:
      - `homologacao`: secret `EASYPANEL_GATILHO_HOMOLOGACAO` = URL do gatilho da homologação;
      - `producao`: secret `EASYPANEL_GATILHO_PRODUCAO` = URL do gatilho da produção; **Required reviewers**: você
        (aprovação obrigatória); Deployment branches and tags: só tags `v*`.
- [ ] Rode de novo o CI da `main` (Actions → CI → Re-run failed jobs). O job `deploy-homologacao`, vermelho desde
      o primeiro push (passo 0), fica verde, e o EasyPanel reimplanta. A partir daqui, a `main` só fica vermelha
      por problema de verdade. No resumo do job `publicar` está o digest. Confira no EasyPanel que a imagem em uso tem o mesmo
      digest.

## 7. Confirmar o deploy sem queda

O app novo só entra depois de migrar. Se a migration falhar, o container novo sai com erro, e o deploy sem queda
precisa manter o antigo no ar. Isso depende do `HEALTHCHECK` da imagem. Confirme na homologação:

- [ ] Deixe um terminal checando a saúde a cada segundo:
      `while true; do curl -s -o /dev/null -w '%{http_code}\n' https://<url>/api/health; sleep 1; done`
- [ ] No serviço do app, troque a senha no arquivo montado em `/segredos/database_url_migrador` por uma errada e
      faça o deploy.
- [ ] O log do container novo mostra `Migrations falharam` e `O app não vai iniciar`, e o terminal **continua em
      200** o tempo todo (a versão antiga segue no ar).
- [ ] Desfaça a troca da senha e faça o deploy. Continua em 200.
- [ ] Se o terminal mostrou falhas, o deploy sem queda não está funcionando (confira se a opção está ligada).
      Anote: nesse caso, uma migration que falha derruba o app até alguém voltar a imagem
      ([rollback](README.md#rollback)).

## 8. Administrador

- [ ] Shell do serviço do app → `su -s /bin/sh node -c 'node dist/criar-admin.mjs'` → e-mail e senha (guarde no
      gerenciador). O Shell entra como root; o comando roda como `node`, sem acesso à credencial do migrador.
- [ ] Entre em `https://<url>/login`. Você cai em `/admin`.
- [ ] Na homologação, crie uma empresa de teste com uma dona fictícia e faça o fluxo: agendar, concluir com Pix e ver
      no Financeiro.

## 9. Bucket do R2 com credencial restrita

- [ ] Cloudflare → R2 → crie o bucket `banho-e-tosa-backup-producao`, e outro para a homologação se quiser testar o
      backup lá.
- [ ] No bucket → Settings → **Bucket lock rules** → Add rule: prefixo `banho-e-tosa/`, retenção de **30 dias**
      ([docs](https://developers.cloudflare.com/r2/buckets/bucket-locks/)). Assim, nem com a credencial roubada dá
      para apagar ou sobrescrever um backup com menos de 30 dias. O script apaga os de mais de 31.
- [ ] **Não** crie regra de ciclo de vida para apagar backups. Ela apagaria os antigos mesmo se o backup parasse de
      rodar (ADR 0013).
- [ ] R2 → Manage API tokens → token com **Object Read & Write**, só nesse bucket. O R2 não tem token que grave sem
      poder apagar ([docs](https://developers.cloudflare.com/r2/api/tokens/)); a trava do bucket cobre isso.
      Guarde o Access Key ID e o Secret Access Key.
- [ ] Confirme que a trava vale também para esse token. A documentação diz que a trava bloqueia apagar pela API S3
      (erro 409 `ObjectLockedByBucketPolicy`), mas não cita o tipo de token. Depois do primeiro backup (passo 11),
      no Shell do serviço de backup, tente apagar o arquivo recém-enviado:
      `RCLONE_CONFIG_D_TYPE=s3 RCLONE_CONFIG_D_PROVIDER=Cloudflare RCLONE_CONFIG_D_ENDPOINT="$BACKUP_S3_ENDPOINT" RCLONE_CONFIG_D_ACCESS_KEY_ID="$BACKUP_S3_ACCESS_KEY_ID" RCLONE_CONFIG_D_SECRET_ACCESS_KEY="$BACKUP_S3_SECRET_ACCESS_KEY" rclone deletefile "d:$BACKUP_S3_BUCKET/banho-e-tosa/<arquivo>"`.
      O certo é **falhar** com `ObjectLockedByBucketPolicy` e o arquivo continuar no bucket. Se apagar, a trava não
      está valendo: revise a regra antes do lançamento.
- [ ] Crie também um token **Object Read only** do mesmo bucket, para os testes de restauração no seu computador.
- [ ] Anote o endpoint S3 da conta: `https://<id da conta>.r2.cloudflarestorage.com`.

## 10. Chave do backup (age)

- [ ] No **seu computador** (nunca na VPS), gere o par de chaves:
      `docker run --rm ghcr.io/victorhsmessias/banho-e-tosa-backup:homologacao age-keygen`.
      Rode `docker login ghcr.io` antes, se a imagem pedir.
- [ ] A saída tem a chave **privada** (linha `AGE-SECRET-KEY-...`) e a pública (`# public key: age1...`).
- [ ] Guarde as três linhas no **gerenciador de senhas**.
- [ ] **Segunda cópia, obrigatória, fora deste computador e fora do gerenciador de senhas**: por exemplo impressa
      num envelope guardado em outro lugar, ou num pendrive guardado em outro lugar. **Sem a chave privada, nenhum
      backup abre.**
- [ ] A chave pública vai para `BACKUP_AGE_DESTINATARIO` (não é segredo). A privada **nunca** vai para a VPS, o
      EasyPanel, o repositório ou o bucket. Ela só aparece na hora de restaurar.

## 11. Serviço de backup e agendamento

- [ ] No projeto da produção: novo serviço App com a imagem `ghcr.io/victorhsmessias/banho-e-tosa-backup:producao`
      e a credencial do passo 2. Sem domínio e sem porta.
- [ ] Variáveis: `DATABASE_URL_BACKUP=postgres://backup:<SENHA_BACKUP>@<host interno>:5432/banho_e_tosa`,
      `BACKUP_AGE_DESTINATARIO`, `BACKUP_S3_ENDPOINT`, `BACKUP_S3_BUCKET`, `BACKUP_S3_ACCESS_KEY_ID`,
      `BACKUP_S3_SECRET_ACCESS_KEY` e `BACKUP_HEARTBEAT_URL` (passo 12).
- [ ] Recursos: limite de 256 MB e 0,5 CPU.
- [ ] **Horário:** o agendador da imagem roda às **03:00 de São Paulo** (`TZ=America/Sao_Paulo` e
      `BACKUP_HORARIO=03:00`, já definidos na imagem). Se um dia o agendamento passar para o cron do host ou do
      painel, que normalmente roda em **UTC**: 03:00 em São Paulo (UTC−3, sem horário de verão) = **06:00 UTC**,
      cron `0 6 * * *`.
- [ ] O log do serviço mostra `agendador: próximo backup em ... 03:00 -03`.
- [ ] Faça o primeiro backup agora: Shell do serviço → `backup.sh`. Termina com `concluído`, e o arquivo
      `banho-e-tosa/banho-e-tosa-<data>.dump.age` aparece no bucket.
- [ ] No dia seguinte, confira que o das 03:00 rodou (log e bucket).

## 12. Monitor externo e teste de alerta

Os dois serviços ficam **fora da VPS**, para não caírem junto com ela. Reconfira os termos do plano gratuito no
cadastro, porque eles mudam:

- **UptimeRobot:** a [página de preços](https://uptimerobot.com/pricing/) diz que o plano grátis é "Good for
  personal and commercial projects". Os [termos](https://uptimerobot.com/terms) dizem "available for any use,
  including commercial and business use". O plano grátis checa a cada 5 min.
- **Healthchecks.io:** o plano Hobbyist grátis tem 20 checks ([preços](https://healthchecks.io/pricing/)), e os
  [termos](https://healthchecks.io/terms/) não restringem uso comercial.

Passos:

- [ ] UptimeRobot → monitor HTTP(s) para `https://<url de produção>/api/health`, a cada 5 min, com alerta por e-mail.
      Repita para a homologação, se quiser.
- [ ] Healthchecks.io → check "Backup produção": Schedule cron `0 3 * * *`, fuso `America/Sao_Paulo`, tolerância
      (grace) de 2 h. Integração por e-mail, e Telegram se quiser. Copie a URL de ping para `BACKUP_HEARTBEAT_URL`
      do serviço de backup e faça o deploy.
- [ ] **Teste do alerta de app fora do ar** (homologação): pare o Postgres da homologação. O `/api/health` passa a
      responder 503, e o alerta chega em até ~10 min. Ligue o Postgres de novo e confira a mensagem de volta.
- [ ] **Teste do alerta de backup:** no Shell do serviço de backup, `wget -q -O /dev/null "$BACKUP_HEARTBEAT_URL/fail"`.
      O Healthchecks.io avisa. Depois rode `backup.sh`, e o check volta ao verde.
- [ ] Fila de tarefas: ainda não existe (entra no M3, com o pg-boss). Quando entrar, ela ganha um check próprio no
      Healthchecks.io, e cada tarefa que esgotar as novas tentativas chama o `/fail` dele
      ([runbook](README.md#monitor-e-alertas)).

## 13. Teste de restauração antes do lançamento

- [ ] Siga [Teste de restauração](README.md#teste-de-restauração-antes-do-lançamento-e-depois-uma-vez-por-mês) com o
      backup do passo 11, usando a **segunda cópia** da chave, para provar que ela funciona.
- [ ] As contagens batem, a conferência de RLS passa e os testes de isolamento passam contra o banco restaurado.
- [ ] Anote a data, o tempo total (meta: até 2 h) e o nome do backup. Marque no calendário o próximo teste (mensal).

## 14. iPhone da piloto

- [ ] No iPhone dela, abra `https://<url de produção>` no **Safari** → Compartilhar → **Adicionar à Tela de Início**.
- [ ] Abra pelo ícone, entre com a conta dela e faça junto o fluxo do M1: agendar, concluir com a forma de pagamento
      e ver a receita do dia no Financeiro.
- [ ] **Notificação:** o resumo do dia por notificação (Web Push, H9, ADR 0009) entra no **M3**. No M1 ainda não há
      notificação para testar. Hoje o app também não tem manifesto de app instalável, então o ícone abre como um
      atalho do Safari. Quando o M3 chegar, teste no aparelho dela: iOS 16.4 ou mais novo, app aberto pela Tela de
      Início e permissão concedida depois de um toque dela.

## 15. Acordo com a piloto sobre os dados dos clientes

Antes de ela cadastrar clientes reais (planejamento, "Dependências" e seção 5, LGPD):

- [ ] Um acordo simples e assinado, cobrindo:
      - ela é a **controladora** dos dados dos clientes dela (nome e telefone do tutor, dados e observações dos
        pets), e o Victor é o **operador**: trata os dados só para prestar o serviço, sem outro uso;
      - como os dados são protegidos:
        - cada empresa isolada no banco (RLS);
        - HTTPS e senha com hash;
        - backups diários criptografados, guardados por 30 dias;
        - logs sem nome nem telefone;
      - o que **não** registrar nas observações: documentos e dados sensíveis do tutor (o app avisa nos campos);
      - pedido de um tutor para apagar os dados: anonimização (H12, prevista para o M4; até lá, o Victor atende
        manualmente);
      - aviso em caso de incidente de segurança;
      - fim do uso: 90 dias para exportar, depois exclusão. Os backups expiram em 30 dias.
- [ ] Só depois disso, crie a empresa e a conta dela na produção ([passo 8](#8-administrador)) e passe a senha
      provisória pessoalmente.

## 16. Pronto para a piloto

- [ ] `https://<url de produção>/api/health` → `{"status":"ok"}`, e o monitor está verde.
- [ ] O backup das 03:00 rodou, o arquivo está no bucket e o heartbeat está verde.
- [ ] A restauração foi testada, e a data está anotada.
- [ ] O administrador está criado e a conta da piloto também, depois do acordo assinado.
- [ ] O app está na Tela de Início do iPhone dela, e o fluxo agendar → concluir → financeiro funcionou.
