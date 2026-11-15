# 0015 — Credencial do migrador num arquivo legível só pelo root, com o container trocando para node depois de migrar

- Status: aceito. Substitui, no ADR 0014, o jeito de entregar a credencial do `migrador` ao container (variável
  `DATABASE_URL_MIGRADOR` removida com `unset` antes do servidor); o resto do ADR 0014 continua valendo.
- Contexto:
  - Pelo ADR 0014, a imagem migra na subida com a credencial do `migrador` (dono das tabelas) e só então inicia o
    servidor. A credencial vinha na variável `DATABASE_URL_MIGRADOR`, e o `docker-entrypoint.sh` fazia `unset` antes
    do `exec node server.js`.
  - O `unset` só limpava o ambiente do processo do servidor. A variável continuava na configuração do container:
    o `HEALTHCHECK` e qualquer `docker exec` (inclusive o Shell do EasyPanel) nasciam com ela, com o mesmo usuário
    `node` do servidor. Um comando injetado no servidor, rodando como esse mesmo usuário, podia ler o ambiente
    desses processos em `/proc` e obter a credencial do dono das tabelas.
  - A regra 1 do `CLAUDE.md` diz que o app não tem a credencial do `migrador`.
- Decisão:
  - **A credencial vai num arquivo, não numa variável.** No EasyPanel, uma montagem de arquivo (Mounts → File Mount)
    com a URL do `migrador`, no caminho fixo `/segredos/database_url_migrador`. A variável `DATABASE_URL_MIGRADOR`
    deixa de existir no ambiente do container, e o entrypoint **recusa subir** se ela aparecer (para não ficar
    esquecida no painel).
  - **Só o root lê o arquivo.** A imagem cria `/segredos` com dono root e modo 0700. Montado ali dentro, o arquivo
    fica fora do alcance do usuário `node` qualquer que seja o modo dele, porque `node` não atravessa a pasta. O
    entrypoint confere isso antes de migrar (testa a leitura como `node`) e recusa subir se `node` conseguir ler.
  - **O container sobe como root só para migrar.** A imagem não tem mais `USER node`. O entrypoint, como root:
    1. confere o arquivo;
    2. roda `node dist/migrar.mjs /segredos/database_url_migrador`, que lê a URL do arquivo (ela nunca vira
       variável de ambiente) e aplica as migrations com a trava do ADR 0014;
    3. se falhar, sai com erro, e o servidor novo não sobe;
    4. só então troca para o usuário `node` e dá `exec` no servidor, que continua sendo o PID 1. Qualquer outro
       comando passado à imagem (por exemplo `node dist/criar-admin.mjs`) também roda como `node`.
  - **A troca de usuário usa o `su` do BusyBox, que já vem na imagem `node:alpine`.** Ele faz `exec` (não deixa um
    processo root no meio), mantém o ambiente e ajusta `HOME`. Nenhum pacote novo: o `setpriv` do BusyBox não troca
    de usuário, e `su-exec` ou `gosu` exigiriam instalar algo.
  - **O healthcheck também roda como `node`** (`su -s /bin/sh node -c ...`): sem a variável e sem acesso à pasta,
    ele não alcança a credencial.
  - **O que o root executa na subida é do root.** Os arquivos da imagem são copiados sem `--chown`: `/app`, `dist/`,
    `drizzle/`, `node_modules` e o entrypoint pertencem ao root e ninguém mais escreve neles. Sem isso, um código
    rodando como `node` poderia trocar o `dist/migrar.mjs` ou acrescentar uma migration, e no próximo início do mesmo
    container o entrypoint rodaria isso como root, com acesso ao arquivo da credencial. O `node` só escreve em
    `/app/.next/cache` (cache de imagens e de fetch do Next), que o root não executa; o app não usa ISR, então o
    Next não grava em `.next/server`.
  - O `npm run test:imagem` prova: o ambiente do container não tem a credencial; o servidor é o PID 1 com uid 1000 e
    sem a credencial no ambiente; `node` recebe "Permission denied" ao ler o arquivo; um `docker exec` não a recebe
    no ambiente; o healthcheck roda como `node`, não lê o arquivo e deixa o container saudável; a variável no
    ambiente é recusada; a senha errada no arquivo impede o servidor de subir sem criar tabela; e o `node` recebe
    "Permission denied" ao alterar `dist/`, `drizzle/`, `node_modules` ou o entrypoint e ao criar arquivos em
    `/app`, com tudo fora de `.next/cache` pertencendo ao root.
  - Consequência para o futuro: um recurso do Next que grave em disco fora de `.next/cache` (por exemplo ISR com
    `revalidate`) falha com essa imagem. Antes de adotá-lo, decidir onde ele grava sem dar ao `node` escrita no que
    o root executa.
  - Em desenvolvimento e no CI nada muda: o `npm run db:migrate` continua lendo `DATABASE_URL_MIGRADOR` do `.env`.
- Alternativas consideradas:
  - **(b) Serviço separado de migration no EasyPanel**, só com a credencial do `migrador`: tira a credencial do
    container do app por completo, mas são dois deploys cuja ordem o CI não confirma (o mesmo motivo do ADR 0014).
  - **Manter a variável e limpar só o processo do servidor** (o `unset` do ADR 0014): não protege o healthcheck nem
    o console, que é o problema.
  - **Arquivo legível pelo `node` e apagado depois de migrar:** uma montagem não pode ser apagada de dentro do
    container, e o arquivo seguiria legível pelo mesmo usuário do servidor.
  - **Instalar `su-exec` ou `gosu`:** fariam o mesmo que o `su` do BusyBox, com um pacote a mais para manter.
- Consequências:
  - Positivas:
    - O servidor, o healthcheck e qualquer comando como `node` não alcançam a credencial do dono das tabelas.
    - Uma configuração antiga (variável no painel) ou errada (arquivo fora de `/segredos`) para o deploy com uma
      mensagem clara, em vez de expor a credencial em silêncio.
  - Negativas:
    - O container inicia como root (só o entrypoint; o servidor e o healthcheck rodam como `node`).
    - O `docker exec` e o Shell do EasyPanel entram como **root** por padrão, e o root lê o arquivo. Quem tem esse
      acesso já controla a VPS e o painel (onde o conteúdo da montagem também aparece), então não é uma fronteira
      nova, mas o uso de rotina passa a ser como `node`: `su -s /bin/sh node -c '<comando>'` no Shell do EasyPanel e
      `docker exec -u node` no terminal (runbook).
    - A URL do `migrador` fica numa montagem de arquivo do serviço, um lugar a mais para lembrar quando a senha ou o
      nome do banco mudarem (runbook e checklist).
