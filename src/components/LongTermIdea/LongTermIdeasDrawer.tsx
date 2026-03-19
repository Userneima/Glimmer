import React from 'react';
import { Modal } from '../UI/Modal';
import { LongTermIdeaPanel } from './LongTermIdeaPanel';
import { t } from '../../i18n';

interface LongTermIdeasDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigateToDiary?: (diaryId: string, position?: { from: number; to: number }) => void;
}

export const LongTermIdeasDrawer: React.FC<LongTermIdeasDrawerProps> = ({
  isOpen,
  onClose,
  onNavigateToDiary,
}) => {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title={t('Firepit')} maxWidth="4xl">
      <div className="-mx-2">
        <LongTermIdeaPanel onNavigateToDiary={onNavigateToDiary} />
      </div>
    </Modal>
  );
};

