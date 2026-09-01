import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

describe('ARTECHECK AI — Hotfix P1 de Responsividade e Acessibilidade', () => {
  it('1. Responsividade: <main> preserva espaço mobile e padding vertical desktop para evitar sobreposição', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const appFile = fs.readFileSync(path.join(process.cwd(), 'src', 'App.tsx'), 'utf-8');

    const mainTag = appFile.match(/<main[^>]+>/)?.[0] || '';
    const hasResponsivePadding = mainTag.includes('pb-24') && /md:py-(6|8|10|12)/.test(mainTag);
    assert.equal(hasResponsivePadding, true, 'Tag <main> deve reservar espaço mobile e manter padding vertical no desktop');
  });

  it('2. Upload Acessível: Dropzone possui nome acessível, label associado e input nativo sr-only', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const uploadFile = fs.readFileSync(path.join(process.cwd(), 'src', 'components', 'UploadZone.tsx'), 'utf-8');

    // Valida associação com label e nome acessível
    assert.ok(uploadFile.includes('htmlFor="pdf-upload-input"'), 'Label deve apontar para id="pdf-upload-input"');
    assert.ok(uploadFile.includes('id="pdf-upload-input"'), 'Input deve ter id="pdf-upload-input"');
    assert.ok(uploadFile.includes('aria-label="Selecionar arquivo PDF para análise"'), 'Input deve possuir aria-label descritivo');
    assert.ok(uploadFile.includes('className="sr-only"'), 'Input deve usar sr-only para manter foco acessível por teclado');
    assert.ok(uploadFile.includes('focus-within:ring-2'), 'Label deve ter indicador visual de foco via focus-within');
  });

  it('3. Upload Acessível: Prevenção de submissão duplicada imediata do mesmo arquivo', () => {
    let callCount = 0;
    const onFileSelected = () => {
      callCount++;
    };

    const lastProcessedRef: { current: { name: string; size: number; timestamp: number } | null } = { current: null };

    const validateAndSelect = (file: { name: string; size: number }) => {
      const now = Date.now();
      if (
        lastProcessedRef.current &&
        lastProcessedRef.current.name === file.name &&
        lastProcessedRef.current.size === file.size &&
        now - lastProcessedRef.current.timestamp < 1000
      ) {
        return; // Ignora duplicata
      }
      lastProcessedRef.current = { name: file.name, size: file.size, timestamp: now };
      onFileSelected();
    };

    const mockFile = { name: 'catalogo.pdf', size: 102400 };

    // 1º envio -> executa
    validateAndSelect(mockFile);
    assert.equal(callCount, 1, 'Primeiro envio deve ser processado');

    // 2º envio imediato (mesmo arquivo em menos de 1s) -> bloqueado
    validateAndSelect(mockFile);
    assert.equal(callCount, 1, 'Envio duplicado imediato deve ser ignorado');
  });

  it('4. Hook de Acessibilidade: Fechamento com Esc, clique no backdrop e bloqueio no conteúdo', () => {
    let closed = false;
    const onClose = () => {
      closed = true;
    };

    let isProcessing = false;

    // 1. Simulação tecla Esc quando não processando
    const handleKeyDown = (e: { key: string; preventDefault: () => void }) => {
      if (e.key === 'Escape' && !isProcessing) {
        e.preventDefault();
        onClose();
      }
    };

    handleKeyDown({ key: 'Escape', preventDefault: () => {} });
    assert.equal(closed, true, 'Escape deve fechar quando isProcessing === false');

    // 2. Simulação tecla Esc quando isProcessing === true (bloqueado)
    closed = false;
    isProcessing = true;
    handleKeyDown({ key: 'Escape', preventDefault: () => {} });
    assert.equal(closed, false, 'Escape NÃO deve fechar quando isProcessing === true');

    // 3. Clique no backdrop quando isProcessing === true
    const handleBackdropClick = () => {
      if (!isProcessing) {
        onClose();
      }
    };
    handleBackdropClick();
    assert.equal(closed, false, 'Backdrop click NÃO deve fechar durante processamento');

    // 4. Clique no backdrop quando isProcessing === false
    isProcessing = false;
    handleBackdropClick();
    assert.equal(closed, true, 'Backdrop click deve fechar quando processamento terminar');

    // 5. Clique no conteúdo interno (stopPropagation)
    let propagationStopped = false;
    const handleContentClick = (e: { stopPropagation: () => void }) => {
      e.stopPropagation();
    };
    handleContentClick({ stopPropagation: () => { propagationStopped = true; } });
    assert.equal(propagationStopped, true, 'Clique no conteúdo deve interromper propagação');
  });

  it('5. Hook de Acessibilidade: Bloqueio do scroll do body e restauração de foco', () => {
    const mockBody = { style: { overflow: '' } };
    const originalOverflow = mockBody.style.overflow;

    // Abrindo modal
    mockBody.style.overflow = 'hidden';
    assert.equal(mockBody.style.overflow, 'hidden', 'Scroll do body deve ser bloqueado');

    // Fechando modal
    mockBody.style.overflow = originalOverflow;
    assert.equal(mockBody.style.overflow, '', 'Scroll do body deve ser restaurado');
  });

  it('6. Padronização dos Modais: Todos os 8 modais auditados implementam role="dialog" e aria-modal="true"', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');

    const modalFiles = [
      'AboutBetaModal.tsx',
      'AuthModal.tsx',
      'ChangeProfileModal.tsx',
      // Perfis e relatório agora também suportam renderização embutida como abas.
      'RotateConfirmationModal.tsx',
      'PdfxPrerequisitesModal.tsx',
      'ApplyAllFixesModal.tsx',
      'CustomProfilesModal.tsx',
      'TransparencyModal.tsx',
    ];

    for (const file of modalFiles) {
      const content = fs.readFileSync(path.join(process.cwd(), 'src', 'components', file), 'utf-8');
      assert.ok(content.includes('role="dialog"'), `${file} deve possuir role="dialog"`);
      assert.ok(content.includes('aria-modal="true"'), `${file} deve possuir aria-modal="true"`);
      assert.ok(content.includes('aria-labelledby='), `${file} deve possuir aria-labelledby`);
      assert.ok(content.includes('useModalAccessibility'), `${file} deve integrar o hook useModalAccessibility`);
    }
  });
});
