import { useCallback, useEffect, useState, useMemo } from 'react';
import { storage } from '../utils/storage';
import type { LongTermIdea, LongTermIdeaProgress } from '../types';
import { v4 as uuidv4 } from 'uuid';
import { cloud } from '../utils/cloud';
import { showToast, getErrorMessage } from '../utils/toast';
import { t } from '../i18n';
import { useAuth } from '../context/useAuth';

export function useLongTermIdeas() {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const [ideas, setIdeas] = useState<LongTermIdea[]>(() => storage.getLongTermIdeas());
  const [selectedProgressFilter, setSelectedProgressFilter] = useState<LongTermIdeaProgress | null>(null);

  useEffect(() => {
    storage.saveLongTermIdeas(ideas);
  }, [ideas]);

  useEffect(() => {
    let active = true;

    const loadIdeas = async () => {
      try {
        if (userId) {
          const remote = await cloud.fetchLongTermIdeas(userId);
          if (!active) return;
          if (remote && remote.length > 0) {
            storage.saveLongTermIdeas(remote);
            setIdeas(remote);
          } else {
            const local = storage.getLongTermIdeas();
            setIdeas(local);
          }
          return;
        }

        const local = storage.getLongTermIdeas();
        if (!active) return;
        setIdeas(local);
      } catch (err) {
        showToast(getErrorMessage(err) || t('Cloud sync failed'));
      }
    };

    void loadIdeas();

    return () => {
      active = false;
    };
  }, [userId]);

  const syncIdea = useCallback((idea: LongTermIdea) => {
    if (!userId) return;
    void cloud.upsertLongTermIdea(userId, idea).catch((err) => {
      showToast(getErrorMessage(err) || t('Cloud sync failed'));
    });
  }, [userId]);

  const addIdea = useCallback((
    title: string,
    content: string,
    originalDiaryId: string,
    originalPosition?: { from: number; to: number }
  ) => {
    const newIdea: LongTermIdea = {
      id: uuidv4(),
      title,
      content,
      originalDiaryId,
      originalPosition,
      progress: 'not-started',
      createdAt: Date.now(),
      versions: [{
        timestamp: Date.now(),
        content,
        syncedFromOriginal: true,
      }],
    };

    setIdeas(prev => [...prev, newIdea]);
    syncIdea(newIdea);
    showToast(t('Long-term idea created'));
    return newIdea;
  }, [syncIdea]);

  const updateIdea = useCallback((id: string, updates: Partial<LongTermIdea>) => {
    setIdeas(prev => prev.map(idea => {
      if (idea.id === id) {
        const updated = { ...idea, ...updates, lastEditedAt: Date.now() };
        syncIdea(updated);
        return updated;
      }
      return idea;
    }));
  }, [syncIdea]);

  const updateProgress = useCallback((id: string, progress: LongTermIdeaProgress) => {
    updateIdea(id, { progress });
  }, [updateIdea]);

  const deleteIdea = useCallback((id: string) => {
    setIdeas(prev => prev.filter(idea => idea.id !== id));
    if (userId) {
      void cloud.deleteLongTermIdea(userId, id).catch((err) => {
        showToast(getErrorMessage(err) || t('Cloud sync failed'));
      });
    }
    showToast(t('Long-term idea deleted'));
  }, [userId]);

  const accessIdea = useCallback((id: string) => {
    updateIdea(id, { lastAccessedAt: Date.now() });
  }, [updateIdea]);

  const addVersion = useCallback((
    id: string,
    content: string,
    note?: string,
    syncedFromOriginal?: boolean
  ) => {
    setIdeas(prev => prev.map(idea => {
      if (idea.id === id) {
        const newVersion = {
          timestamp: Date.now(),
          content,
          note,
          syncedFromOriginal,
        };
        const updated = {
          ...idea,
          content,
          versions: [...idea.versions, newVersion],
          lastEditedAt: Date.now(),
        };
        syncIdea(updated);
        return updated;
      }
      return idea;
    }));
  }, [syncIdea]);

  const filteredIdeas = useMemo(() => {
    if (!selectedProgressFilter) return ideas;
    return ideas.filter(idea => idea.progress === selectedProgressFilter);
  }, [ideas, selectedProgressFilter]);

  const setProgressFilter = useCallback((progress: LongTermIdeaProgress | null) => {
    setSelectedProgressFilter(progress);
  }, []);

  return {
    ideas,
    filteredIdeas,
    addIdea,
    updateIdea,
    updateProgress,
    deleteIdea,
    accessIdea,
    addVersion,
    selectedProgressFilter,
    setProgressFilter,
  };
}
