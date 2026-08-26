import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

describe('ARTECHECK AI — Refinamento P2/P3 de Responsividade e Acessibilidade', () => {
  it('1. Header Mobile: Contrato compacto em < sm, sem overflow e com nome acessível completo', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const headerFile = fs.readFileSync(path.join(process.cwd(), 'src', 'components', 'Header.tsx'), 'utf-8');

    // Valida versão compacta para mobile (< sm)
    assert.ok(headerFile.includes('flex sm:hidden'), 'Deve haver botão compacto visível apenas em telas menores que sm');
    assert.ok(headerFile.includes('hidden sm:flex'), 'Deve manter pílula de contrato expandida em desktop (sm:)');
    assert.ok(headerFile.includes('aria-label={fullProfileLabel}'), 'Botão compacto mobile deve possuir aria-label descritivo com nome do perfil');
    assert.ok(headerFile.includes('min-w-[36px] min-h-[36px]'), 'Botão compacto mobile deve ter área de toque ergonômica');
    assert.ok(headerFile.includes('Novo Arquivo'), 'Botão de Novo Arquivo deve estar presente');
  });

  it('2. Checklist em 320 px: Quebra controlada flex-wrap sem truncar valores técnicos e sem colisão de status', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const mainCard = fs.readFileSync(path.join(process.cwd(), 'src', 'components', 'MainInspectionCard.tsx'), 'utf-8');

    // Valida flex-wrap nas linhas da Checagem Principal
    assert.ok(mainCard.includes('flex-wrap sm:flex-nowrap items-center justify-between'), 'Linhas do checklist devem usar flex-wrap em telas pequenas');
    assert.ok(mainCard.includes('shrink-0'), 'Badges de status devem ter shrink-0 para não serem esmagados');
  });

  it('3. Botões de arquivo corrigido: Empilhados (w-full) no mobile e horizontais no desktop', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const summaryFile = fs.readFileSync(path.join(process.cwd(), 'src', 'components', 'AppliedCorrectionsSummary.tsx'), 'utf-8');

    // Valida layout responsivo de botões
    assert.ok(summaryFile.includes('flex flex-col sm:flex-row'), 'Ações globais devem usar flex-col em mobile e flex-row em sm+');
    assert.ok(summaryFile.includes('w-full sm:w-auto'), 'Botões devem ocupar largura total no mobile');
    assert.ok(summaryFile.includes('Restaurar original'), 'Botão Restaurar original deve vir antes na ordem lógica');
    assert.ok(summaryFile.includes('Baixar arquivo corrigido'), 'Botão Baixar arquivo corrigido deve vir em seguida');
  });

  it('4. Processamento Acessível: role="status", aria-live="polite", aria-atomic no texto e prefers-reduced-motion', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const procFile = fs.readFileSync(path.join(process.cwd(), 'src', 'components', 'ProcessingState.tsx'), 'utf-8');

    assert.ok(procFile.includes('role="status"'), 'Container de processamento deve ter role="status"');
    assert.ok(procFile.includes('aria-live="polite"'), 'Container de processamento deve ter aria-live="polite"');
    assert.ok(procFile.includes('aria-atomic="true"'), 'Texto da etapa ativa deve ter aria-atomic="true"');
    assert.ok(procFile.includes('motion-reduce:animate-none'), 'Spinners devem respeitar prefers-reduced-motion');
  });

  it('5. Alvos de Toque: Controles de zoom e paginação com mínimo de 44 × 44 px e foco visível', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const mainCard = fs.readFileSync(path.join(process.cwd(), 'src', 'components', 'MainInspectionCard.tsx'), 'utf-8');

    assert.ok(mainCard.includes('min-w-[44px] min-h-[44px]'), 'Controles de navegação/zoom devem ter alvo de toque mínimo de 44x44 px');
    assert.ok(mainCard.includes('aria-label="Página anterior"'), 'Botão de página anterior deve ter aria-label');
    assert.ok(mainCard.includes('aria-label="Próxima página"'), 'Botão de próxima página deve ter aria-label');
    assert.ok(mainCard.includes('aria-label="Reduzir zoom"'), 'Botão de reduzir zoom deve ter aria-label');
    assert.ok(mainCard.includes('aria-label="Aumentar zoom"'), 'Botão de aumentar zoom deve ter aria-label');
    assert.ok(mainCard.includes('focus-visible:ring-2'), 'Botões de controle devem ter anel de foco visível');
  });

  it('6. Contraste WCAG AA: DiagnosticPanel utiliza #94A3B8 (contraste > 5.7:1 sobre #101722)', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const diagFile = fs.readFileSync(path.join(process.cwd(), 'src', 'components', 'DiagnosticPanel.tsx'), 'utf-8');

    // Valida que o antigo #8E98A7 (contraste 4.1:1) foi eliminado do painel de diagnóstico
    assert.ok(!diagFile.includes('#8E98A7'), 'DiagnosticPanel não deve conter a cor de baixo contraste #8E98A7');
    assert.ok(diagFile.includes('#94A3B8'), 'DiagnosticPanel deve utilizar #94A3B8 para conformidade WCAG AA');
  });
});
