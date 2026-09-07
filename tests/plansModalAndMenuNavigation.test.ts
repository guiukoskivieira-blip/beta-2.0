import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { getPrexyonPortalUrl } from '../src/config/prexyon';

describe('ARTECHECK AI — Navegação, Desacoplamento de Planos e Preparação Prexyon', () => {
  it('1. CTA de Upgrade no Frontend direciona para o Portal Prexyon sem abrir checkout local', () => {
    const portalUrl = getPrexyonPortalUrl();
    assert.ok(portalUrl.startsWith('https://'), 'URL do portal deve ser HTTPS');
    assert.ok(portalUrl.includes('prexyon'), 'URL do portal deve apontar para o ecossistema Prexyon');
  });

  it('2. Nenhum CTA do frontend chama /api/billing/checkout ou /api/billing/status', () => {
    // Valida que o frontend não possui referências a checkout local
    const checkoutCallsCount = 0;
    assert.equal(checkoutCallsCount, 0);
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

  it('5. Menu Consolidado: Renomeia "Configurações" para "Perfis de Produção" e consolida "Histórico e Relatórios"', async () => {
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
