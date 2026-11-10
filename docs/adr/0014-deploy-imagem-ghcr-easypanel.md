# 0014 — Deploy por imagem no GHCR com gatilho do EasyPanel e migration na subida do container

- Status: aceito
- Contexto:
  - O planejamento pede que cada push na `main` vá para a homologação, que a produção suba por tag e que a migration rode antes de a nova versão entrar.
  - O app roda no EasyPanel de uma VPS que divide a máquina com outros projetos (ADR 0003).
  - O EasyPanel tem, por serviço, uma URL de "Deployment Trigger" que reimplanta a imagem configurada, mas não tem job de pré-deploy nem um gatilho que receba a tag da imagem ([docs do App Service](https://easypanel.io/docs/services/app)).
  - A regra 1 do `CLAUDE.md` diz que o app não lê a credencial do `migrador`.
- Decisão:
  - **Imagem:**
    - `Dockerfile` em etapas (dependências → build → execução), com `node:26.13.0-alpine3.24` (o mesmo Node do `.nvmrc` e do CI), usuário `node` e a saída `standalone` do Next.
    - `HEALTHCHECK` que só confere se o servidor responde, para uma queda do banco não derrubar o container em laço.
    - A imagem não leva `tsx`, código-fonte nem as dependências de desenvolvimento.
  - **Comandos dentro da imagem:** o `esbuild`, fixado como devDependency em 0.28.2 (`--save-exact`), empacota `scripts/migrar.mts` e `scripts/criar-admin.mts` em `dist/*.mjs`, cada um num arquivo só.
    - É a versão que o `tsx` e o `vite` já instalavam: o lockfile não ganhou nenhum pacote nem mudou versão (conferido com `npm ls esbuild`).
    - O `criar-admin` roda no console do EasyPanel com `node dist/criar-admin.mjs`.
  - **Migration na subida:** o `docker-entrypoint.sh` faz quatro coisas:
    1. roda `node dist/migrar.mjs` (migrator do `drizzle-orm`, dentro de `pg_advisory_lock`: dois containers que sobem juntos migram em fila);
    2. se falhar, sai com erro e o servidor novo não sobe;
    3. senão, remove `DATABASE_URL_MIGRADOR` do ambiente;
    4. só então dá `exec node server.js`.
    - O app também se recusa a subir em homologação e produção se essa variável chegar até ele.
    - Com o deploy sem queda do EasyPanel, a versão anterior continua no ar enquanto a nova migra e quando ela não fica saudável. O checklist pede para confirmar isso na primeira vez.
  - **Toda migration é compatível com a versão anterior do app** (expandir agora, contrair numa versão seguinte). Assim, a versão antiga roda sobre o schema novo durante o deploy, e voltar a imagem nunca exige restaurar o banco.
  - **Registro:** GitHub Container Registry. Cada imagem do app e do backup ganha a tag imutável `sha-<commit>`. Os serviços do EasyPanel apontam para uma etiqueta móvel por ambiente:
    - `homologacao`: movida pelo CI num push na `main`, só depois de todos os testes (lint, tipos, unitários e integração com isolamento, ponta a ponta com a meia-noite, teste da imagem e teste do backup);
    - `producao`: movida numa tag `v*`, depois da aprovação obrigatória de um revisor no Environment `producao` do GitHub. A imagem `sha-<commit>` já testada ganha `vX.Y.Z` e `producao` sem build novo, e o job falha se o commit não estiver na `main` ou se a imagem não existir.
    - **Rollback:** trocar a imagem do serviço por uma `sha-<commit>` anterior e fazer o deploy.
  - **Gatilho:** uma URL de Deployment Trigger por ambiente, guardada como secret do Environment correspondente (`EASYPANEL_GATILHO_HOMOLOGACAO`, `EASYPANEL_GATILHO_PRODUCAO`), nunca no repositório.
  - **Permissões do workflow:** `contents: read` no topo e `packages: write` só nos jobs que publicam ou etiquetam.
  - **Acesso do EasyPanel ao GHCR:** o GitHub Packages só aceita token clássico, com `read:packages` para baixar ([docs do Container registry](https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-container-registry)).
    - Esse token lê todos os pacotes que a conta alcança e não pode ser restrito a um só.
    - Por isso o checklist manda usar uma conta de máquina com acesso só de leitura a esses pacotes, token só com `read:packages`, validade de 1 ano e lembrete de rotação.
- Alternativas consideradas:
  - **O EasyPanel puxa do GitHub e faz o build na VPS:** o build do Next pesa na VPS dividida com outros projetos, o auto deploy dispara sem esperar o CI e não há suporte natural a tag.
  - **API do EasyPanel para trocar a tag da imagem a cada deploy:** permitiria apontar direto para `sha-<commit>`, mas o token da API controla o painel inteiro, inclusive os outros projetos da VPS. O risco é maior que o ganho.
  - **Migration num serviço separado do EasyPanel**, só com a credencial do `migrador`: mais limpo para a regra 1, mas são dois gatilhos cuja ordem o CI não consegue confirmar, e mais uma peça para operar. A credencial no serviço do app fica fora do processo do servidor (`unset` antes do `exec`, mais a recusa na subida).
  - **Migration pelo GitHub Actions:** exigiria expor o Postgres à internet.
  - **`tsx` e o código-fonte na imagem, sem `standalone`:** nenhuma dependência nova, mas a imagem fica várias vezes maior e leva `src/` para produção.
  - **Imagem pública:** dispensaria o token, mas publicaria o código do app.
- Consequências:
  - Positivas:
    - Produção só recebe a imagem exata que passou por todos os testes e pela homologação.
    - O build não roda na VPS.
    - Rollback em um passo, sem tocar no banco.
    - Migration falha não derruba o app no ar.
    - Imagem enxuta e sem root.
  - Negativas:
    - A credencial do `migrador` fica nas variáveis do serviço do app, visível no painel e no `docker exec`, embora não no processo do servidor.
    - Os serviços apontam para etiquetas móveis, e o rastreio da versão no ar é pelo digest registrado no CI.
    - O token de leitura do GHCR precisa ser renovado.
    - Toda migration exige o cuidado de compatibilidade com a versão anterior.
