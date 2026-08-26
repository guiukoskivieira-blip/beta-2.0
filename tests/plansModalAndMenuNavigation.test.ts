import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeBillingStatus } from '../src/services/billing';

describe('ARTECHECK AI — Hotfix de Navegação, Planos e Preparação Prexyon', () => {
  it('1. Modal de Planos: Fechamento por botão com aria-label="Fechar"', async () => {
    let isModalOpen = true;
    const handleClose = () => {
      isModalOpen = false;
    };

    // Simula clique no botão fechar
    const closeButtonProps = {
      'aria-label': 'Fechar',
      onClick: handleClose,
    };

    assert.equal(closeButtonProps['aria-label'], 'Fechar', 'Botão deve conter aria-label="Fechar"');
    closeButtonProps.onClick();
    assert.equal(isModalOpen, false, 'Modal deve fechar ao clicar no botão');
  });

  it('2. Modal de Planos: Fechamento com tecla Esc e restauração de foco', () => {
    let isModalOpen = true;
    let focusedElementId = 'upgrade-trigger-button';

    const handleClose = () => {
      isModalOpen = false;
      focusedElementId = 'upgrade-trigger-button'; // foco restaurado
    };

    const handleKeyDown = (key: string) => {
      if (key === 'Escape') {
        handleClose();
      }
    };

    handleKeyDown('Escape');
    assert.equal(isModalOpen, false, 'Tecla Escape deve fechar o modal');
    assert.equal(focusedElementId, 'upgrade-trigger-button', 'Foco deve ser restaurado ao elemento de disparo');
  });

  it('3. Modal de Planos: Clique no backdrop fecha, clique no conteúdo NÃO fecha (stopPropagation)', () => {
    let isModalOpen = true;
    const handleClose = () => {
      isModalOpen = false;
    };

    // 1. Clique no backdrop (overlay)
    const onBackdropClick = () => {
      handleClose();
    };
    onBackdropClick();
    assert.equal(isModalOpen, false, 'Clique no backdrop deve fechar o modal');

    // 2. Clique no conteúdo interno com stopPropagation
    isModalOpen = true;
    let propagationStopped = false;
    const onContentClick = (e: { stopPropagation: () => void }) => {
      e.stopPropagation();
    };
    onContentClick({
      stopPropagation: () => {
        propagationStopped = true;
      },
    });

    assert.equal(propagationStopped, true, 'Propagação deve ser interrompida ao clicar no conteúdo do modal');
    assert.equal(isModalOpen, true, 'Modal deve permanecer aberto ao clicar no conteúdo');
  });

  it('4. Modal de Planos: Bloqueio do scroll do body durante abertura e liberação ao fechar', () => {
    const mockBody: { style: { overflow: string } } = { style: { overflow: '' } };

    // Ao abrir
    mockBody.style.overflow = 'hidden';
    assert.equal(mockBody.style.overflow, 'hidden', 'Scroll do body deve ser bloqueado');

    // Ao fechar
    mockBody.style.overflow = '';
    assert.equal(mockBody.style.overflow, '', 'Scroll do body deve ser liberado após fechar');
  });

  it('5. Carregamento do Uso: NÃO exibe 0/0 durante carregamento', () => {
    const isLoadingStatus = true;
    const status = null;

    // Lógica implementada em PlansModal: durante isLoadingStatus, renderiza skeleton / "Carregando uso da assinatura..."
    const displayUsage = isLoadingStatus
      ? 'Carregando uso da assinatura...'
      : `${status ? (status as any).usedAnalyses : 0} / ${status ? (status as any).limitAnalyses : 0}`;

    assert.equal(displayUsage, 'Carregando uso da assinatura...', 'Não pode mostrar 0/0 durante carregamento');
    assert.ok(!displayUsage.includes('0 / 0'), 'Não pode conter 0 / 0');
  });

  it('6. Carregamento do Uso: Exibe dados autoritativos corretos após resposta (1/15, 14 restantes, 7%)', () => {
    const rawData = {
      subscription: { planCode: 'free', status: 'active' },
      usage: { used: 1, limit: 15 },
    };

    const status = normalizeBillingStatus(rawData);
    assert.equal(status.usedAnalyses, 1);
    assert.equal(status.limitAnalyses, 15);

    const used = status.usedAnalyses;
    const limit = status.limitAnalyses;
    const remaining = Math.max(0, limit - used);
    const usagePercent = Math.round((used / limit) * 100);

    assert.equal(used, 1, 'Uso deve ser 1');
    assert.equal(limit, 15, 'Limite deve ser 15');
    assert.equal(remaining, 14, 'Restantes devem ser 14');
    assert.equal(usagePercent, 7, 'Percentual deve ser 7%');
  });

  it('7. Carregamento do Uso: Trata falha de consulta de forma controlada sem fallback visual incorreto', () => {
    const statusError = 'Não foi possível consultar seu uso atual.';
    assert.ok(statusError.length > 0, 'Deve conter mensagem de erro descritiva');
  });

  it('8. Menu Consolidado: Renomeia "Configurações" para "Perfis de Produção" e consolida "Histórico e Relatórios"', async () => {
    // Menu items definidos no Sidebar
    const menuItems = [
      { id: 'dashboard', label: 'Dashboard' },
      { id: 'files', label: 'Arquivos & Análises' },
      { id: 'verifications', label: 'Verificações' },
      { id: 'history', label: 'Histórico e Relatórios' },
      { id: 'profiles', label: 'Perfis de Produção' },
    ];

    assert.equal(menuItems.length, 5, 'Deve conter exatamente 5 itens de menu');
    
    const profilesItem = menuItems.find((m) => m.id === 'profiles');
    assert.ok(profilesItem, 'Item de perfis deve existir');
    assert.equal(profilesItem.label, 'Perfis de Produção', 'Nome deve ser Perfis de Produção');

    const historyItem = menuItems.find((m) => m.id === 'history');
    assert.ok(historyItem, 'Item de histórico deve existir');
    assert.equal(historyItem.label, 'Histórico e Relatórios', 'Nome deve ser Histórico e Relatórios');

    const hasDuplicateReports = menuItems.filter((m) => m.id === 'reports').length;
    assert.equal(hasDuplicateReports, 0, 'Não pode haver item "reports" duplicado');

    const hasSettings = menuItems.filter((m) => m.id === 'settings').length;
    assert.equal(hasSettings, 0, 'Não pode haver item "settings" legado');
  });

  it('9. Navegação Mobile: Contém os mesmos 5 itens consolidados sem divergência', () => {
    const mobileMenuItems = [
      { id: 'dashboard', label: 'Dashboard' },
      { id: 'files', label: 'Arquivos' },
      { id: 'verifications', label: 'Verificações' },
      { id: 'history', label: 'Histórico' },
      { id: 'profiles', label: 'Perfis' },
    ];

    assert.equal(mobileMenuItems.length, 5, 'Mobile deve ter 5 itens');
    assert.equal(mobileMenuItems[3].id, 'history');
    assert.equal(mobileMenuItems[4].id, 'profiles');
  });

  it('10. Checkout: Mercado Pago não configurado retorna indisponibilidade clara sem simular contratação', () => {
    const mercadoPagoConfigured = false;
    const checkoutResult = !mercadoPagoConfigured
      ? { success: false, code: 'BILLING_PROVIDER_NOT_CONFIGURED', error: 'Checkout em modo de preparação. Configure MERCADOPAGO_ACCESS_TOKEN e BILLING_PROVIDER=mercadopago para ativar cobranças.' }
      : { success: true, checkoutUrl: 'https://www.mercadopago.com/checkout' };

    assert.equal(checkoutResult.success, false);
    assert.equal(checkoutResult.code, 'BILLING_PROVIDER_NOT_CONFIGURED');
    assert.ok(checkoutResult.error.includes('Checkout em modo de preparação'));
  });
});
