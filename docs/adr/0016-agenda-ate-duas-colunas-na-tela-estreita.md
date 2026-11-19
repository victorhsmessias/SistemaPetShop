# 0016 — Agenda do dia: até duas colunas e "+N" na tela estreita

- Status: aceito (sessão 07, decisão do Victor). Ajusta o aceite do H6 em `sistema-banho-e-tosa.md`; o resto do
  H6 continua valendo.
- Contexto:
  - O aceite do H6 diz que "atendimentos no mesmo horário ficam lado a lado". Com 3 ou 4 sobrepostos no iPhone
    (393 px), cada bloco ficava com 70 a 90 px de largura, e o texto virava "Thor · Ana …", "Concluíd…",
    "⚠ Medo…": a observação de cuidado, feita para saltar aos olhos, sumia (auditoria de UX da sessão 07, problema 2).
  - A auditoria sugeriu trocar a grade por uma lista cronológica no celular. O Victor decidiu manter a grade
    (blocos do tamanho da duração, como pede o H6) e melhorar a leitura.
- Decisão:
  - **Abaixo de 1024 px, no máximo 2 colunas.** Num grupo de atendimentos que se tocam e que precisaria de 3 ou mais
    colunas, a 1ª coluna fica na grade, com meia largura, e na outra metade aparece um botão "+N", do início do
    primeiro atendimento oculto ao fim do último, com o nome acessível "Mais N atendimentos entre HH:MM e HH:MM".
    (Ajustado na revisão da sessão 07, antes do merge: a primeira versão ia da altura do grupo inteiro e dizia
    "às HH:MM", o início do grupo, o que cobria horários livres e indicava a hora errada.)
  - **O "+N" abre a lista do horário** (popover do HTML, sem JavaScript) com os outros blocos, com o mesmo conteúdo
    e o mesmo nome acessível dos blocos da grade. Nenhum atendimento fica inacessível.
  - **A partir de 1024 px, todas as colunas,** lado a lado, como antes.
  - A posição usa variáveis CSS (`--col`/`--cols` na tela larga e `--col-e`/`--cols-e` na estreita) e uma media
    query: o servidor desenha as duas, e o CSS escolhe. A geometria de 2 px por minuto não muda.
  - Os blocos passam a ter texto em várias linhas (sem reticências), com o cuidado logo depois do status.
- Alternativas consideradas:
  - **Lista cronológica no celular:** lê melhor, mas contraria o H6 (blocos do tamanho da duração) e perde a visão
    de ocupação do dia. Recusada pelo Victor.
  - **Todas as colunas também no celular:** é o comportamento anterior, com o texto ilegível.
  - **Limite por largura medida no navegador (JavaScript):** decide melhor em tablets, mas exige código cliente e
    desenho depois de carregar. O corte em 1024 px é o mesmo da barra lateral.
- Consequências:
  - Positivas: no iPhone, cada bloco tem pelo menos metade da largura, e o cuidado aparece; o "+N" diz quantos
    atendimentos há a mais.
  - Negativas: no celular, com 3 ou mais sobrepostos, só um fica visível na grade, e os outros pedem um toque. O
    teste de dados longos (`e2e/dados-longos.spec.ts`) prova isso no iPhone: 1 bloco e o "+3" sem se cobrir, e os
    4 atendimentos acessíveis depois do toque. No desktop, continua provando os 4 lado a lado.
