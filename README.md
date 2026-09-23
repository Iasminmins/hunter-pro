# HUNTER HSG CONTROL CENTER

Painel local para monitoramento estatístico, auditoria de filtros, pesquisa de padrões residuais e congelamento de versões.

## Executar

Requer Node.js 20 ou superior. Não há dependências externas.

```bash
npm start
```

Abra <http://127.0.0.1:4173>. Os registros importados, snapshots e auditoria ficam no `localStorage` deste navegador. Os CSVs são lidos no navegador e não são enviados a um servidor.

## Contas de trader

Abra **Contas de trader** na navegação principal. Esta área usa a chave `hunter-trader-state` separada dos registros HSG e permite cadastrar/arquivar contas, lançar resultados e movimentações, configurar limites individuais e importar operações CSV com prévia. CSVs são associados somente à conta escolhida pelo usuário; o formato aceito exige `date` (AAAA-MM-DD) e `pnl` líquido após taxas, com `id`, `fees` e `note` opcionais. O campo `fees` apenas preserva a parcela de taxas já incluída no PnL. Repetições são verificadas por identificador ou pela combinação de data e resultado.

Os dados permanecem neste navegador e neste perfil. Não há sincronização nem backup automático. Saldo atual é uma atualização manual; resultados e movimentações não o alteram automaticamente. Drawdown fica indisponível sem histórico suficiente de equity, e valores em moedas diferentes nunca são somados.

## Testes

```bash
npm test
```

## Importação CSV

O `CSV HSG Dataset` precisa de cabeçalho com `Outcome` (também aceita `Resultado`) e `Result R` (também aceita `R`, `Result_R` ou `PnL R`). Cada registro deve conter um resultado numérico em R. O parser aceita separador vírgula ou ponto e vírgula, BOM UTF-8, aspas e vírgulas dentro de campos entre aspas. O CSV NinjaTrader/Grid precisa ter cabeçalho e pelo menos uma linha de dados; no MVP ele é validado e contabilizado, mas não combinado com o dataset HSG sem um mapeamento confirmado.

Importações repetidas do mesmo mês param para uma decisão explícita: atualizar o bloco existente, registrar uma revisão ou cancelar. Snapshots congelados não podem ser alterados e nomes repetidos são recusados.

## Estrutura

- `src/seed.mjs`: dados demonstrativos.
- `src/model.mjs`: parser, validação e métricas.
- `src/app.mjs`: navegação, renderização, importação, auditoria e snapshots.
- `styles.css`: layout responsivo e tema.
- `server.mjs`: servidor estático local.
- `tests/`: testes unitários com `node:test`.

## Evolução

A persistência atual é local ao navegador. Para uso multiusuário e comparação Forward/OOS compartilhada, conectar uma API com Postgres, autenticação, controle de permissões, validação de esquema por versão e trilha de auditoria no servidor. Métricas calculadas dependem da consistência do CSV real e da definição acordada para W/L/BE, filtros e overlaps.
