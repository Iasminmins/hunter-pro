# HUNTER HSG CONTROL CENTER

Painel privado do Hunter Pro para monitoramento estatístico HSG, auditoria, pesquisa de padrões residuais, snapshots e gestão de contas de trader. Os dados autenticados são sincronizados com PostgreSQL no Neon.

## Executar

Requer Node.js 20.12 ou superior.

```bash
npm install
npm start
```

Gere a senha privada e o segredo de sessão com `npm run generate-local-secrets`; a senha fica em `APP_PASSWORD` dentro do `.env` ignorado pelo Git. Copie `.env.example` se precisar criar esse arquivo manualmente. Preencha `DATABASE_URL` com a URL pooled do Neon e TLS habilitado. Abra <http://127.0.0.1:4173>. As rotas de dados exigem login; a cópia local é mantida como recuperação de alterações ainda não sincronizadas.

## Contas de trader

Abra **Contas de trader** na navegação principal. Esta área usa a chave `hunter-trader-state` separada dos registros HSG e permite cadastrar/arquivar contas, lançar resultados e movimentações, configurar limites individuais e importar operações CSV com prévia. CSVs são associados somente à conta escolhida pelo usuário; o formato aceito exige `date` (AAAA-MM-DD) e `pnl` líquido após taxas, com `id`, `fees` e `note` opcionais. O campo `fees` apenas preserva a parcela de taxas já incluída no PnL. Repetições são verificadas por identificador ou pela combinação de data e resultado.

Os dados de trader sincronizam com Neon depois da confirmação da API. CSVs são lidos no navegador e somente os registros validados são enviados. Saldo atual é uma atualização manual; resultados e movimentações não o alteram automaticamente. Drawdown fica indisponível sem histórico suficiente de equity, e valores em moedas diferentes nunca são somados.

## Testes

```bash
npm test
```

## Neon / PostgreSQL

O projeto Neon `Hunter Pro` está na região São Paulo (`sa-east-1`). O schema aplicado está versionado em `migrations/001_hunter_pro_init.sql`; ele contempla estado serializado e tabelas relacionais para meses/trades HSG, bases históricas, snapshots imutáveis, OOS, contas, operações, movimentações e auditoria.

O servidor local e as funções Vercel usam a mesma API Node. `DATABASE_URL`, `APP_PASSWORD_HASH` e `SESSION_SECRET` ficam exclusivamente no servidor. Configure esses valores no projeto `iasminmins-projects/hunter-pro` somente para Production. Preview fica sem acesso ao banco de produção até receber uma branch Neon separada. Consulte [`docs/operations/neon-vercel-setup.md`](docs/operations/neon-vercel-setup.md) antes de configurar ambientes ou importar dados.

O payload de `app_state` é a cópia canônica completa usada para restaurar a interface. As tabelas relacionais são projeções de consulta; meses versionados e snapshots permanecem como histórico e não devem ser usados para reconstruir o payload atual.

## Importação CSV

O `CSV HSG Dataset` precisa de cabeçalho com `Result R` (também aceita `R`, `Result_R` ou `PnL R`) e resultado numérico em cada registro. `Outcome` (ou `Resultado`) é opcional; sem essa coluna, W/L/BE é inferido pelo sinal de R. O parser aceita separador vírgula ou ponto e vírgula, BOM UTF-8, aspas e vírgulas dentro de campos entre aspas. O CSV NinjaTrader/Grid precisa ter cabeçalho e pelo menos uma linha de dados ou um relatório completo; ele é validado e contabilizado separadamente, sem combinação com o HSG sem um mapeamento confirmado.

Importações repetidas do mesmo mês param para uma decisão explícita: atualizar o bloco existente, registrar uma revisão ou cancelar. Snapshots congelados não podem ser alterados e nomes repetidos são recusados.

## Estrutura

- `src/model.mjs`: parser, validação e métricas.
- `src/hsg-views.mjs`: painéis de auditoria, períodos, referências e versões.
- `src/backup.mjs`: exportação e validação de backups locais HSG.
- `src/app.mjs`: navegação, renderização, importação, auditoria e snapshots.
- `styles.css`: layout responsivo e tema.
- `src/persistence.mjs`: sessão, sincronização, revisões e cache local de recuperação.
- `src/server/`: autenticação, API e persistência no PostgreSQL.
- `api/[...route].mjs`: entrada das funções de API na Vercel.
- `server.mjs`: servidor local para arquivos e API.
- `tests/`: testes unitários com `node:test`.

## Evolução

A autenticação tem um único proprietário. A API compara revisões para bloquear sobrescritas entre abas; em conflitos, recarregue o estado do Neon após guardar/exportar as alterações locais que deseja preservar. Métricas dependem da consistência dos CSVs e das definições acordadas para W/L/BE, filtros e overlaps.

## Base HSG, meses e auditoria

Na navegação HSG, **Meses** mantém fechamentos operacionais por mês e calcula o regime recente sobre até três fechamentos (pesos 50/30/20, normalizados quando há menos de três). **Versões** contém 12 slots de referência histórica por ano e permite consolidar os meses selecionados, ou importar uma base pronta. A base selecionada é comparativa e nunca é somada ao total operacional.

Filtros são calculados por `Filter Hits` (aceita também `Filters` e `Filtros`). Bloqueios e W/L bloqueados só aparecem quando o CSV inclui uma coluna explícita `Filter Blocks`, `Blocked Filters`, `Filters Blocked`, `Bloqueios` ou `Filtros Bloqueados`. Overlap conta um mesmo trade em cada filtro associado; o resultado R não é dividido. Outcomes sem uma coluna explícita de bloqueios são apenas outcomes observados, não trades que o filtro teria bloqueado.

Pesquisa RG agrupa trades sem filtros usando direção, sessão e gap quando esses campos existem. Os grupos são exploratórios; risco de overfitting e aprovação dependem de validação OOS real. Snapshots registram os blocos e a base selecionada no congelamento; OOS usa fechamentos importados após o fim do desenvolvimento.

Em **Versões**, exporte um backup JSON ou selecione um para restaurar. O backup JSON continua incluindo apenas HSG; contas de trader são mantidas separadamente e sincronizadas no Neon. As chaves `hunter-hsg-state` e `hunter-trader-state` ficam no navegador como cópia de recuperação. A importação inicial sempre mostra a contagem e exige escolher entre a cópia local e o estado do Neon.
