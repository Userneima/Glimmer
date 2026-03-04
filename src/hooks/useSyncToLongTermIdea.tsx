import { useState, useCallback } from 'react';
import { useLongTermIdeas } from './useLongTermIdeas';
import { SyncToLongTermIdeaModal } from '../components/LongTermIdea/SyncToLongTermIdeaModal';

export function useSyncToLongTermIdea(diaryId: string) {
  const { addIdea } = useLongTermIdeas();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [pendingContent, setPendingContent] = useState<{ content: string; position?: { from: number; to: number } } | null>(null);

  const openSyncModal = useCallback((content: string, position?: { from: number; to: number }) => {
    setPendingContent({ content, position });
    setIsModalOpen(true);
  }, []);

  const handleConfirm = useCallback((note: string, syncFullText: boolean) => {
    if (pendingContent) {
      const title = pendingContent.content.slice(0, 30) + (pendingContent.content.length > 30 ? '...' : '');
      addIdea(title, pendingContent.content, diaryId, pendingContent.position);
      setPendingContent(null);
    }
  }, [pendingContent, addIdea, diaryId]);

  const handleClose = useCallback(() => {
    setIsModalOpen(false);
    setPendingContent(null);
  }, []);

  const SyncModal = () => {
    return (
      <SyncToLongTermIdeaModal
        isOpen={isModalOpen}
        onClose={handleClose}
        onConfirm={(note) => handleConfirm(note, true)}
        hasSelection={!!pendingContent?.position}
      />
    );
  };

  return {
    openSyncModal,
    SyncModal,
  };
}