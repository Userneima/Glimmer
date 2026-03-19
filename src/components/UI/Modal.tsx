import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '4xl';
}

export const Modal: React.FC<ModalProps> = ({ isOpen, onClose, title, children, maxWidth = 'md' }) => {
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };

    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      document.body.style.overflow = 'hidden';
    }

    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = 'unset';
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const maxWidthClasses = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-lg',
    xl: 'max-w-xl',
    '2xl': 'max-w-2xl',
    '4xl': 'max-w-4xl',
  };

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center animate-fade-in">
      {/* Backdrop with blur */}
      <div
        className="absolute inset-0 bg-primary-900/20 backdrop-blur-sm"
        onClick={onClose}
      />
      
      {/* Modal content */}
      <div 
        className={`
          relative 
          bg-white/95 backdrop-blur-apple
          rounded-apple-xl 
          shadow-apple-elevated
          ${maxWidthClasses[maxWidth]} 
          w-full mx-4 
          max-h-[85vh] 
          overflow-hidden
          animate-scale-in
          border border-white/50
        `}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-primary-100/80">
          <h2 className="text-lg font-semibold text-primary-900 tracking-tight">{title}</h2>
          <button
            onClick={onClose}
            className="
              p-2 -mr-2
              text-primary-400 
              hover:text-primary-700 
              hover:bg-primary-100 
              rounded-apple-sm
              transition-all duration-200
              active:scale-95
            "
          >
            <X size={18} strokeWidth={2} />
          </button>
        </div>
        
        {/* Body */}
        <div className="px-6 py-5 overflow-y-auto max-h-[calc(85vh-70px)]">
          {children}
        </div>
      </div>
    </div>,
    document.body,
  );
};
