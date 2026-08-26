import React, { useEffect, useRef } from 'react';

export interface UseModalAccessibilityOptions {
  isOpen: boolean;
  onClose: () => void;
  isProcessing?: boolean;
  initialFocusRef?: React.RefObject<HTMLElement | null>;
}

export function useModalAccessibility({
  isOpen,
  onClose,
  isProcessing = false,
  initialFocusRef,
}: UseModalAccessibilityOptions) {
  const triggerRef = useRef<HTMLElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (isOpen) {
      triggerRef.current = document.activeElement as HTMLElement | null;

      // Lock body scroll
      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';

      // Initial focus
      const timer = setTimeout(() => {
        if (initialFocusRef?.current) {
          initialFocusRef.current.focus();
        } else if (closeButtonRef.current) {
          closeButtonRef.current.focus();
        }
      }, 50);

      // Keyboard Esc listener
      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          if (!isProcessing) {
            e.preventDefault();
            onClose();
          }
        }
      };
      window.addEventListener('keydown', handleKeyDown);

      return () => {
        clearTimeout(timer);
        window.removeEventListener('keydown', handleKeyDown);
        document.body.style.overflow = originalOverflow;
        if (triggerRef.current && typeof triggerRef.current.focus === 'function') {
          triggerRef.current.focus();
        }
      };
    }
  }, [isOpen, onClose, isProcessing, initialFocusRef]);

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (!isProcessing) {
      onClose();
    }
  };

  const handleContentClick = (e: React.MouseEvent) => {
    e.stopPropagation();
  };

  return {
    closeButtonRef,
    handleBackdropClick,
    handleContentClick,
  };
}
