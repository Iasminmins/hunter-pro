# Design QA — Hunter Performance Lab

**Source visual truth:** imagens anexadas nesta conversa `codex-clipboard-751391cc-b13c-4aca-86f7-80d21fc1c844.png` (Saque) e `codex-clipboard-0ece7e2d-24ee-489d-9efe-67bae9dff42e.png` (Aprovação); especificação `C:\Users\letic\.codex\attachments\6331d2ee-b4d0-445a-a694-572a5d1db71e\Texto colado.txt`.

**Implementation screenshot:** a captura desta iteração mostra a navegação do Hunter presente, mas também uma segunda marca Hunter dentro do Lab e painéis com paleta diferente da plataforma. A nova prévia local abriu a tela de acesso privado, então a composição atualizada pós-login não pôde ser capturada.

**Viewport / dimensões / densidade:** captura enviada nesta iteração: aproximadamente 1896 × 949 px, viewport desktop, densidade do navegador não disponível. Captura pós-correção: indisponível.

**Estado:** abas Geral, Aprovação e Saque dentro da rota Performance Lab; navegação lateral da plataforma preservada. Barra interna atualizada para abas, seletor de conjunto e ações, sem uma segunda marca do produto; painéis adaptados às cores e superfícies do Hunter.

**Comparação em tela inteira:** a captura desta iteração mostra o problema de integração visual; a comparação pós-correção está bloqueada pela autenticação local.

**Comparação de regiões:** o menu da plataforma aparece na captura; cabeçalho, barra unificada, coluna de parâmetros e cores dos painéis precisam ser conferidos após o login.

**Fidelidade visual:** as imagens de Aprovação e Saque definem a estrutura funcional. Nesta iteração, a barra duplicada foi substituída por navegação contextual, seletor de conjunto e ações; superfícies foram alinhadas à paleta azul do sistema. A renderização pós-login ainda não foi observada.

**Interações verificadas:** navegação lateral é mantida pela rota comum do app; análise estática (`node --check src/app.mjs`) e whitespace (`git diff --check`) concluídos. A navegação em navegador pós-correção ainda não foi exercitada devido à tela de login.

**Histórico de comparação:**
- [P1] A captura anterior mostrava o Laboratório ocupando a janela toda, sem o menu e sem o cabeçalho compartilhado do Hunter. Corrigido removendo a classe que escondia o menu lateral e restaurando o espaçamento do conteúdo ao layout normal. A captura pós-correção não pôde ser obtida por falta de sessão local.
- [P1] A inicialização podia parar numa tela obrigatória para escolher entre dados do navegador e Neon. Removido esse bloqueio: agora o app abre com os dados do Neon quando já existem; quando a área do Neon está vazia, os dados locais são importados automaticamente. Cópias locais divergentes são preservadas e podem ser baixadas pela barra de conexão.
- [P1] A captura atualizada mostrou marca e abas duplicadas e superfícies de cor incompatível com o Hunter. A barra interna agora contém somente abas do Lab, seletor de conjunto e ações; o painel de parâmetros acompanha o tema azul da plataforma e rola junto com a página. Validação visual pós-login pendente.
- [P1] A prévia do usuário mostra relatório agregado importado com 51 operações no resumo, mas zero trades individuais. A mensagem agora explica que o resumo alimenta a aba Geral e requer CSV Grid para simular o percurso. A curva de aprovação passa a usar a sequência executada sob as regras configuradas, em lucro acumulado relativo ao saldo inicial, com linhas da meta de aprovação e do DD disponível. Validação visual pós-login pendente.

**Findings**
- [P1] Captura autenticada pós-correção pendente. Local: navegação e tela do Performance Lab. Evidência: a prévia atual abre somente o formulário privado. Impacto: não permite conferir visualmente o menu persistente, o retorno às outras áreas nem a composição com o cabeçalho padrão. Próximo passo: entrar na prévia local e capturar Geral, Aprovação e Saque no mesmo viewport das referências.

**Implementation Checklist**
- Retirado o modo visual que ocultava o menu lateral e o cabeçalho do Hunter ao abrir o Laboratório.
- Removido o fluxo de escolha de migração que bloqueava a entrada na plataforma.
- Preservada uma cópia local baixável antes de substituir espelhos divergentes pelos dados já existentes no Neon.
- Unificados os controles do Performance Lab com o shell do Hunter e alinhados os painéis às cores do sistema.
- Diferenciada a contagem de operações do relatório agregado da contagem de trades individuais que alimentam as simulações.
- Adicionada a curva de performance sequencial à simulação de aprovação, com meta e DD disponível como linhas de referência.
- Mantidas as abas internas Geral, Aprovação e Saque.
- Conferir a navegação entre Performance Lab e as demais áreas após autenticar.
- Comparar as três abas com as referências e corrigir desvios P0/P1/P2 com evidência pós-correção.

**Follow-up Polish**
- Ajustar espaçamento e tipografia após comparação em viewport igual.
- Validar tablet e celular.

**final result: blocked**
