# Requirements Document

## Introduction

Esta funcionalidade permite à escola marcar materiais do stock como "para venda" e expô-los aos encarregados de educação e alunos numa loja integrada na app Edukamba. A escola define preço de compra e preço de venda para cada material vendável. Encarregados e alunos navegam apenas os materiais disponíveis para venda e podem submeter uma encomenda/pedido de compra diretamente na app. A gestão escolar acompanha e processa as encomendas recebidas.

## Glossary

- **Material**: Item de stock registado pela escola na tabela `materials`.
- **Material Vendável**: Material com o campo `for_sale` ativo, com preço de compra e preço de venda definidos.
- **Preço de Compra**: Custo de aquisição do material pela escola (`purchase_price`). Visível apenas para a gestão.
- **Preço de Venda**: Valor cobrado ao encarregado/aluno (`sale_price`). Visível para todos os utilizadores com acesso à loja.
- **Loja de Materiais**: Aba/vista da página de Materiais apresentada exclusivamente a Encarregados e Alunos, listando apenas Materiais Vendáveis.
- **Encomenda**: Registo de intenção de compra de um ou mais Materiais Vendáveis por um Encarregado ou Aluno (`material_orders`).
- **Linha de Encomenda**: Cada item de uma Encomenda com quantidade e preço de venda capturado (`material_order_items`).
- **Escola**: Entidade que gere o sistema (utilizadores com roles `ADMIN`, `SUPER_ADMIN`, `DIRECTOR`, `SECRETARY`, `TREASURER`, `STOCK_MANAGER`).
- **Encarregado**: Utilizador com role `PARENT` no sistema.
- **Aluno**: Utilizador com role `STUDENT` no sistema.
- **Stock_Manager**: O sistema de gestão de stock e vendas de materiais.

---

## Requirements

### Requirement 1: Marcação de Material para Venda

**User Story:** Como gestor escolar, quero marcar materiais como "para venda" e definir o preço de compra e o preço de venda, para que a escola possa comercializar materiais diretamente aos encarregados e alunos.

#### Acceptance Criteria

1. THE Stock_Manager SHALL apresentar, no formulário de criação/edição de material, um campo booleano "Para Venda" (`for_sale`) com valor por defeito `false`.
2. WHEN o utilizador ativa o campo "Para Venda", THE Stock_Manager SHALL tornar obrigatórios os campos "Preço de Compra" (`purchase_price`) e "Preço de Venda" (`sale_price`), ambos numéricos no intervalo 0,01–999.999,99 com até 2 casas decimais.
3. IF o utilizador tentar guardar um material com "Para Venda" ativo sem definir o "Preço de Compra" ou o "Preço de Venda", THEN THE Stock_Manager SHALL rejeitar o formulário e apresentar uma mensagem de erro indicando os campos em falta.
4. IF o utilizador tentar guardar um material com "Para Venda" ativo com "Preço de Compra" ou "Preço de Venda" inferior ou igual a zero, THEN THE Stock_Manager SHALL rejeitar o formulário e apresentar uma mensagem de erro.
5. IF o utilizador tentar guardar um material com "Para Venda" ativo com "Preço de Venda" inferior ao "Preço de Compra", THEN THE Stock_Manager SHALL rejeitar o formulário e apresentar uma mensagem de aviso indicando que o preço de venda não pode ser inferior ao preço de compra.
6. WHEN o utilizador guarda um material com "Para Venda" desativado, THE Stock_Manager SHALL armazenar `purchase_price` e `sale_price` como `null`.
7. THE Stock_Manager SHALL persistir os campos `for_sale`, `purchase_price` e `sale_price` na tabela `materials` do Supabase.

---

### Requirement 2: Visibilidade de Preços na Tabela de Stock (Gestão)

**User Story:** Como gestor escolar, quero ver o preço de compra e o preço de venda na listagem de stock, para que possa acompanhar as margens dos materiais vendáveis.

#### Acceptance Criteria

1. WHEN um utilizador com papel de Escola acede à aba de Stock, THE Stock_Manager SHALL apresentar as colunas "Preço de Compra" e "Preço de Venda" na tabela de stock para todas as linhas, exibindo os valores apenas nas linhas com `for_sale = true` e o indicador `—` nas restantes.
2. WHEN um material com `for_sale = true` é listado na tabela de stock, THE Stock_Manager SHALL apresentar um badge ou ícone "Para Venda" visível nessa linha.
3. WHILE a tabela de stock se encontra em estado de carregamento ou transição de UI, THE Stock_Manager SHALL manter os badges "Para Venda" visíveis nas linhas já carregadas.
4. WHILE o utilizador navega a lista de stock com filtro de categoria ativo, THE Stock_Manager SHALL apresentar as colunas "Preço de Compra" e "Preço de Venda" e os respetivos valores para todos os materiais com `for_sale = true` que correspondam ao filtro.

---

### Requirement 3: Loja de Materiais para Encarregados e Alunos

**User Story:** Como encarregado de educação ou aluno, quero aceder a uma loja de materiais na app, para que possa ver os materiais disponíveis para compra e respetivos preços de venda.

#### Acceptance Criteria

1. WHEN um utilizador com papel de Encarregado ou Aluno acede à página de Materiais (incluindo por navegação direta via URL), THE Stock_Manager SHALL apresentar exclusivamente a aba "Loja" e redirecionar qualquer tentativa de acesso às abas "Stock" ou "Pedidos" para a aba "Loja".
2. THE Stock_Manager SHALL listar na Loja apenas os materiais que satisfaçam simultaneamente `for_sale = true` e `school_id` igual à escola do utilizador autenticado.
3. THE Stock_Manager SHALL apresentar, para cada material na Loja, o nome, a categoria, o preço de venda e, IF a descrição existir, THEN a descrição do material.
4. THE Stock_Manager SHALL ocultar o campo `purchase_price` em todas as vistas da Loja de Materiais acessíveis a Encarregados e Alunos.
5. IF não existirem materiais com `for_sale = true` para a escola do utilizador, THEN THE Stock_Manager SHALL apresentar uma mensagem de estado vazio na Loja e ocultar a lista de materiais e os controlos de pesquisa/filtro.
6. THE Stock_Manager SHALL disponibilizar controlos de pesquisa por nome e filtro por categoria na Loja quando existirem materiais disponíveis.
7. WHEN o utilizador acede à Loja em dispositivo móvel (native), THE Stock_Manager SHALL apresentar os materiais em formato de cartões. WHEN o utilizador acede à Loja em desktop, THE Stock_Manager SHALL apresentar os materiais em formato de tabela ou lista.
8. IF ocorrer um erro ao carregar os materiais da Loja, THEN THE Stock_Manager SHALL apresentar uma mensagem de erro e um botão para tentar novamente.

---

### Requirement 4: Submissão de Encomenda

**User Story:** Como encarregado de educação ou aluno, quero selecionar materiais e submeter uma encomenda, para que possa adquirir os materiais necessários diretamente na app.

#### Acceptance Criteria

1. WHEN o utilizador seleciona um material na Loja e define uma quantidade inteira entre 1 e 999, THE Stock_Manager SHALL adicionar o item ao carrinho de compras em memória (sessão atual).
2. WHEN o utilizador adiciona ao carrinho um material já existente nele, THE Stock_Manager SHALL acumular a quantidade em vez de criar uma linha duplicada, mantendo um máximo de 999 unidades por material.
3. WHEN o utilizador confirma a encomenda com o carrinho não vazio, THE Stock_Manager SHALL criar atomicamente um registo em `material_orders` (`school_id`, `buyer_profile_id`, `buyer_role`, `status = 'pending'`, `total_amount`, `created_at`) e os respetivos registos em `material_order_items` (`order_id`, `material_id`, `quantity`, `unit_price` = `sale_price` capturado no momento); IF a criação atómica falhar parcialmente, THEN THE Stock_Manager SHALL reverter todos os registos criados e preservar o estado do carrinho.
4. IF o utilizador tentar submeter uma encomenda com o carrinho vazio, THEN THE Stock_Manager SHALL rejeitar a ação e apresentar uma mensagem de erro.
5. IF ocorrer um erro durante a criação da encomenda no Supabase, THEN THE Stock_Manager SHALL apresentar uma mensagem de erro e preservar o estado do carrinho para nova tentativa.
6. WHEN a encomenda é criada com sucesso, THE Stock_Manager SHALL limpar o carrinho e apresentar uma confirmação ao utilizador com o valor total da encomenda.
7. WHEN o utilizador navega para fora da página da Loja sem confirmar a encomenda, THE Stock_Manager SHALL descartar o carrinho em memória.

---

### Requirement 5: Gestão de Encomendas pela Escola

**User Story:** Como gestor escolar, quero ver e gerir as encomendas submetidas pelos encarregados e alunos, para que possa processar a entrega e o pagamento dos materiais vendidos.

#### Acceptance Criteria

1. WHEN um utilizador com papel de Escola acede à página de Materiais, THE Stock_Manager SHALL apresentar uma aba "Encomendas" na barra de abas existente (Stock / Pedidos / Encomendas).
2. WHEN um utilizador com papel de Escola acede à aba "Encomendas", THE Stock_Manager SHALL listar todos os registos de `material_orders` da escola, ordenados por `created_at` descendente.
3. WHEN a lista de encomendas é apresentada, THE Stock_Manager SHALL exibir, para cada encomenda, o nome do comprador, a data de criação (`created_at`), o total (`total_amount`) e o estado atual (`status`).
4. WHEN o gestor altera o estado de uma encomenda para um estado válido na sequência `pending → processing → completed` ou `pending|processing → cancelled`, THE Stock_Manager SHALL atualizar o campo `status` e o campo `updated_at` na tabela `material_orders`.
5. IF o gestor tentar aplicar uma transição de estado inválida (e.g., `completed → pending`), THEN THE Stock_Manager SHALL rejeitar a ação e apresentar uma mensagem de erro com as transições permitidas.
6. IF a atualização do estado no Supabase falhar, THEN THE Stock_Manager SHALL apresentar uma mensagem de erro e manter o estado anterior da encomenda na UI.
7. WHEN o gestor expande uma encomenda, THE Stock_Manager SHALL apresentar as linhas de `material_order_items` da encomenda (nome do material, quantidade, preço unitário capturado, subtotal); os detalhes das linhas SHALL estar ocultos por defeito.
8. WHEN o gestor cancela uma encomenda, THE Stock_Manager SHALL solicitar um motivo de cancelamento (campo de texto obrigatório) e, após confirmação, atualizar `status` para `cancelled` e persistir o motivo em `cancellation_reason`.

---

### Requirement 6: Historial de Encomendas do Comprador

**User Story:** Como encarregado de educação ou aluno, quero consultar o historial das minhas encomendas, para que possa acompanhar o estado das compras que efetuei.

#### Acceptance Criteria

1. WHEN um utilizador com papel de Encarregado ou Aluno acede à Loja de Materiais, THE Stock_Manager SHALL apresentar uma aba ou secção "As Minhas Encomendas" acessível sem sair da página.
2. WHEN o utilizador acede à secção "As Minhas Encomendas", THE Stock_Manager SHALL listar apenas as encomendas cujo `buyer_profile_id` corresponda ao `id` do perfil do utilizador autenticado, ordenadas por `created_at` descendente.
3. WHEN a lista de encomendas do comprador é apresentada, THE Stock_Manager SHALL exibir, para cada encomenda, a data de criação, o total, o estado atual e a lista de itens (nome do material, quantidade, preço unitário capturado).
4. IF o utilizador não tiver encomendas anteriores, THEN THE Stock_Manager SHALL apresentar uma mensagem de estado vazio e ocultar todos os elementos de listagem de encomendas.
5. IF ocorrer um erro ao carregar o historial de encomendas, THEN THE Stock_Manager SHALL apresentar uma mensagem de erro e um botão para tentar novamente.

---

### Requirement 7: Consistência de Dados e Integridade de Preços

**User Story:** Como gestor escolar, quero que o sistema mantenha a integridade dos dados de preços ao longo do tempo, para que relatórios e auditorias reflitam os valores reais no momento da transação.

#### Acceptance Criteria

1. WHEN uma encomenda é criada, THE Stock_Manager SHALL capturar e armazenar em `material_order_items.unit_price` o valor de `sale_price` do material no momento exato da criação da encomenda.
2. WHEN o `sale_price` de um material é alterado após a criação de encomendas, THE Stock_Manager SHALL manter inalterados os valores de `unit_price` já registados em `material_order_items` de encomendas anteriores.
3. WHEN os detalhes de uma encomenda são apresentados (quer na vista da escola quer no historial do comprador), THE Stock_Manager SHALL apresentar o `unit_price` capturado no momento da encomenda e não o `sale_price` atual do material.
4. IF o `sale_price` de um material for alterado para um valor diferente do `unit_price` registado em encomendas anteriores, THEN THE Stock_Manager SHALL apresentar o `unit_price` original nos detalhes dessas encomendas sem qualquer indicação de divergência com o preço atual.
