# Hunter Pro · Performance Lab

## Objetivo

Trazer para o Hunter Pro a experiência do Hunter Performance Lab descrita pela usuária: leitura de relatórios do NinjaTrader, análise de desempenho e simulações configuráveis de avaliação e saque. A interface deve explicar a origem dos dados, identificar arquivos/períodos possivelmente repetidos e deixar claro quando um cálculo depende da sequência individual das operações.

## Abordagem recomendada

Adicionar **Performance Lab** como área própria na navegação principal, com três abas internas: **Geral**, **Aprovação** e **Saque**. Manter os fluxos HSG e Contas de trader existentes separados. O usuário escolhe um conjunto importado como fonte ativa; o sistema nunca soma automaticamente um relatório agregado com o Grid que pode representar as mesmas operações.

Os dados do Performance Lab terão estado próprio e persistência independente, compatível com sincronização atual no Neon. Importar, revisar ou limpar dados do Lab não altera contas, operações ou histórico HSG.

## Importação e modelo dos dados

- Suportar relatório de desempenho NinjaTrader agregado para métricas do resumo na aba Geral.
- Suportar CSV Grid com uma linha por operação e coluna de resultado individual (`Profit` ou alias validado), além de data/hora ou data e ordem original da linha.
- Ler arquivos no navegador e mostrar prévia antes de gravar: operações válidas, rejeitadas, períodos detectados e possíveis duplicatas.
- Preservar arquivo, linha de origem, horário disponível, resultado, símbolo e demais colunas úteis. Ordenar por data/hora quando disponível; se a sequência não puder ser determinada com segurança, marcar drawdown e simulações dependentes da ordem como indisponíveis.
- Evitar importações duplicadas por identificação disponível e assinatura de operações; avisar sobre sobreposição de períodos, sem descartar/substituir dados silenciosamente. A pessoa decide cancelar ou importar mesmo assim.
- Nunca combinar os totais do relatório agregado e do Grid por conta própria. Cada indicador mostra claramente se veio do relatório ou da sequência Grid.

## Abas e comportamento

### Geral

Apresentar lucro líquido, quantidade de operações, profit factor, taxa de acerto e drawdown quando houver dados suficientes. Incluir cortes por direção e período somente quando as colunas necessárias existirem. Distinguir valores extraídos de resumo e métricas calculadas a partir das operações. Com arquivo agregado, explicar que não há sequência para reconstruir equity; com dados detalhados, indicar o período e a quantidade efetivamente analisados.

### Aprovação

Oferecer perfil configurável de avaliação, sem impor regras de uma prop firm. Campos iniciais: saldo inicial, meta de lucro, limite de perda diária, limite máximo de drawdown, tipo do drawdown (estático ou trailing), número mínimo de dias e limite de consistência opcional. Simular trade a trade na ordem disponível e mostrar estado (em andamento, aprovada ou violação), progresso por regra e a operação que causou violação. Sem CSV Grid suficiente, mostrar o que falta e não inventar resultado.

### Saque

Estimar lucro elegível e valor potencial de saque usando a curva de trades e parâmetros configuráveis: saldo/limite de referência, buffer de segurança, percentual de repasse, mínimo de dias e limite mínimo/máximo de saque quando aplicável. Decompor valor bruto, retenções configuradas e valor estimado. Regras não configuradas aparecem pendentes; não apresentar a estimativa como valor garantido ou solicitação real.

## Direção visual e interação

- Integrar o novo item ao menu lateral e seguir a identidade escura existente, com contraste alto, tipografia clara e acentos contidos em ciano/verde para métricas positivas e âmbar/vermelho para avisos e violações.
- Criar cabeçalho próprio com contexto da conta/conjunto ativo, intervalo analisado e acesso visível à importação.
- Nas abas, usar hierarquia visual forte: cartões de métricas, curva de equity/drawdown no Geral e indicadores visuais de progresso nas simulações. Gráficos devem ter contêiner responsivo com dimensões válidas; em telas estreitas, cartões e controles passam a uma coluna e tabelas podem rolar horizontalmente.
- Criar estados vazios com chamada para importar CSV Grid, prévias, alertas de duplicata e mensagens de dados insuficientes no mesmo tom da interface. Não preencher gráficos com dados fictícios.
- Usar rótulos e avisos em português; manter a observação de que cálculos são estimativas baseadas nos arquivos e regras informados.

## Persistência e separação

Criar uma área de estado dedicada ao Performance Lab no contrato de persistência e na API; serializar perfis, conjuntos importados, sequência Grid, seleção ativa e auditoria de importações. Adicionar a migração necessária para o Neon sem reutilizar os payloads HSG ou de trader. CSV permanece processado no cliente; somente dados normalizados da análise são sincronizados, conforme o padrão já existente.

## Fora do escopo

- Reproduzir visualmente cada pixel ou marca da página de referência.
- Presumir ou embutir regras oficiais de uma prop firm sem parâmetros confirmados pela usuária.
- Enviar ordens, conectar-se à corretora, submeter pedidos reais de saque ou garantir aprovação.
- Reconciliar automaticamente resumo e Grid ou deduplicar períodos sem decisão explícita.
- Alterar os cálculos/estado das áreas HSG e Contas de trader.

## Critérios de aceite

1. Performance Lab aparece como área própria, com Geral, Aprovação e Saque acessíveis e responsivas.
2. Relatório agregado e Grid individual são reconhecidos e identificados separadamente; não há soma automática entre fontes.
3. Prévia informa erros e sobreposições antes da gravação, sem mutação parcial em caso de falha.
4. Geral mostra origem, período e escopo; drawdown só aparece quando a ordem puder ser reconstruída.
5. Aprovação aplica as regras configuradas trade a trade e identifica a regra e operação que causaram uma violação.
6. Saque calcula somente parâmetros preenchidos e identifica claramente premissas e campos pendentes.
7. Estados sem dados ou insuficientes são explícitos; nenhum dado de demonstração aparece como resultado real.
8. Os dados do Lab persistem independentemente de HSG e trader e permanecem íntegros após recarregar/sincronizar.
9. Duplicatas e estimativas têm explicações claras; a interface não promete aprovação nem saque.
