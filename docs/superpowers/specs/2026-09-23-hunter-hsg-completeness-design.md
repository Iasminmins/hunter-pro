# Hunter HSG Control Center: completar auditoria e histórico

## Objetivo

Completar a cópia local para que ela cubra os fluxos descritos na análise da plataforma anterior e não apresente dados demonstrativos como resultados reais. Os CSVs permanecem no navegador; métricas devem indicar quando não há dados ou quando sua interpretação não foi validada.

## Restrições e lógica confirmada

- Manter a lógica descrita na análise anterior: hits e bloqueios são lidos diretamente dos campos HSG do CSV.
- Um filtro sem ocorrências não é considerado aprovado; permanece sem dados.
- Em trades associados a múltiplos filtros, preservar o resultado real do trade e contar a ocorrência para cada filtro presente. Registrar o overlap sem repartir o resultado entre filtros.
- A análise anterior não confirmou a semântica detalhada de bloqueio nem como o overlap influenciava o resultado. A interface não deve apresentar “vitórias bloqueadas” ou “derrotas evitadas” como fatos sem mapeamento verificável.
- A base histórica é separada dos fechamentos operacionais e não deve ser adicionada novamente aos resultados mensais.
- Pesquisa RG é exploratória; clusters não aprovam regras por conta própria. OOS/Forward só é apresentado como validado se existirem dados posteriores comparáveis.

## Áreas e comportamento

### Geral

Com zero importações, mostrar estados vazios explícitos em KPIs, janelas, evolução mensal e placar de saúde. Remover ou isolar as séries demonstrativas de qualquer painel operacional. Com dados, calcular métricas sobre os períodos e a base selecionados, mostrar escopo e distinguir “sem dados”, “amostra insuficiente”, “pendente” e resultados calculados. A saúde nunca pode ser “SAUDÁVEL” apenas por ausência de falhas.

### Meses

Adicionar seção própria com fechamentos operacionais, calendário de meses, estado de cada mês e entrada para importar/abrir um fechamento. Exibir o resumo ponderado dos três meses mais recentes cadastrados com pesos de 50%, 30% e 20%, documentando quando faltarem meses. Reutilizar o fluxo mensal já existente, incluindo revisão/atualização e trilha de auditoria.

### Base histórica

Permitir nomear, importar, selecionar e consultar bases históricas independentes. A importação exige os dois arquivos, valida CSV HSG e relatório NinjaTrader/Grid pelos validadores existentes, e calcula métricas somente do dataset HSG quando os arquivos não puderem ser reconciliados. Manter os trades da base em armazenamento distinto dos meses operacionais e deixar esse escopo explícito nas comparações.

### Filtros HSG

Calcular hits por código presente em `Filter Hits`, ocorrências exclusivas, overlaps e resultado R observado. W/L bloqueados só podem ser calculados se o formato importado identificar de forma inequívoca trades bloqueados e seus outcomes; caso contrário, apresentar indisponível com explicação. Filtros configurados/listados sem ocorrência são “SEM DADOS”, não aprovados. Distinguir filtros encontrados nos CSVs de filtros sem ocorrência.

### Pesquisa RG

Retirar clusters e indicadores fictícios da experiência operacional. Agrupar trades residuais importados como exploração, apresentar tamanho da amostra e não usar o rótulo “aprovado”. Não declarar risco de overfitting calculado sem validação apropriada; mostrar pendente/indisponível. Exibir os limites recomendados de amostra como orientação, sem transformar recomendações em bloqueios não confirmados.

### Versões e OOS/Forward

Manter snapshots imutáveis. Na área de referência histórica, oferecer os 12 espaços mensais de janeiro a dezembro para importar os pares HSG + NinjaTrader/Grid que compõem uma base histórica, além da importação direta de uma base consolidada. Permitir selecionar a base consolidada como referência sem somá-la aos fechamentos operacionais. Permitir comparar uma versão congelada com fechamentos posteriores à data/período de desenvolvimento quando o usuário cadastrar esses períodos. Sem período posterior importado, manter OOS como pendente. Mostrar períodos, trades, resultado e métricas disponíveis, sem inferir aprovação automática.

### Persistência e transparência

Manter compatibilidade com o armazenamento local existente e evitar misturar a chave de contas de trader com dados HSG. Incluir exportação/importação de backup JSON para preservar dados locais. Registrar importações, atualizações, revisões e snapshots na auditoria. Erros de arquivo devem ser mostrados sem gravar parcialmente o bloco.

## Fora do escopo desta etapa

- Backend multiusuário, autenticação e sincronização em nuvem.
- Inferir automaticamente a regra que transforma um trade em “bloqueado” sem coluna ou configuração verificável.
- Promover clusters exploratórios ou filtros a aprovados por limiares inventados.

## Critérios de aceite

1. Nenhum benchmark fictício aparece como resultado operacional quando não há dados importados.
2. As cinco áreas HSG descritas na análise anterior estão acessíveis, incluindo Meses e base histórica.
3. Importar uma base histórica não altera nem duplica fechamentos mensais.
4. Trades com múltiplos filtros preservam o resultado real e são contabilizados por filtro com overlap identificável.
5. Filtros sem ocorrência aparecem sem dados; métricas não sustentadas pelo CSV aparecem indisponíveis, não como zero ou aprovação.
6. Pesquisa RG distingue exploração de validação e informa amostra.
7. Comparação OOS/Forward depende de períodos posteriores realmente importados.
8. O usuário consegue exportar e restaurar um backup local sem misturar dados de contas de trader.
9. Estados vazios, erros e escopos dos dados são explicados em português na interface.

## Riscos e questões técnicas

- Os nomes/valores reais das colunas HSG para ocorrência, bloqueio e outcome precisam ser determinados pelo CSV concreto; o parser deve usar aliases explícitos e evitar inferências silenciosas.
- `localStorage` tem capacidade limitada para históricos grandes. O backup JSON mitiga perda, mas não substitui uma API/DB para uso compartilhado.
- Snapshots antigos podem não conter detalhe suficiente para comparação OOS; a implementação deve informar indisponibilidade quando faltar escopo ou trades de origem.
