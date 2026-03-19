import React from 'react';
import { Input } from '../UI/Input';
import { TagInput } from '../UI/TagInput';
import { t } from '../../i18n';
import { formatDateTime } from '../../utils/date';
import type { Diary } from '../../types';

interface DiaryHeaderProps {
  diary: Diary;
  wordCount: number;
  isMobile?: boolean;
  onTitleChange: (title: string) => void;
  onTagsChange: (tags: string[]) => void;
  onAnalyze: () => void;
  AnalyzeIcon: React.ComponentType<{ size?: number; strokeWidth?: number }>;
}

export const DiaryHeader: React.FC<DiaryHeaderProps> = ({
  diary,
  wordCount,
  isMobile = false,
  onTitleChange,
  onTagsChange,
  onAnalyze,
  AnalyzeIcon,
}) => {
  const titlePlaceholder = t('Untitled');
  const tagsPlaceholder = isMobile ? t('Add tags...') : t('Add tags (press Enter)...');

  const containerCommon =
    'flex items-center justify-between';

  return (
    <div
      className={isMobile ? 'p-4' : 'flex flex-col gap-4 p-4'}
      style={{
        backgroundColor: 'rgba(255, 255, 255, 0.5)',
        borderBottom: '1px solid rgba(200, 210, 220, 0.4)',
      }}
    >
      <div className={containerCommon + (isMobile ? ' mb-3' : '')}>
        <Input
          value={diary.title}
          onChange={(e) => onTitleChange(e.target.value)}
          placeholder={titlePlaceholder}
          variant="minimal"
          className={(isMobile ? 'text-xl' : 'text-2xl') + ' font-bold border-none focus:ring-0 px-0 flex-1 min-w-0 tracking-tight'}
          style={{ color: 'var(--aurora-primary)' }}
        />
        <button
          onClick={onAnalyze}
          className={
            (isMobile ? 'p-2' : 'p-2.5') +
            ' text-white rounded-xl shadow-sm hover:shadow-md transition-all duration-200 active:scale-95 ml-3 z-10'
          }
          style={{
            background: 'linear-gradient(135deg, var(--aurora-accent) 0%, var(--aurora-accent-alt) 100%)',
          }}
          title={t('Analyze')}
          aria-label={t('Analyze')}
        >
          <AnalyzeIcon size={18} strokeWidth={2} />
        </button>
      </div>

      <div className={isMobile ? '' : 'flex items-center'}>
        <div className="flex-1">
          <TagInput
            tags={diary.tags}
            onChange={onTagsChange}
            placeholder={tagsPlaceholder}
            className={isMobile ? 'mb-3' : undefined}
          />
        </div>
      </div>

      <div className="flex items-center gap-4 text-sm text-primary-500 flex-wrap">
        <span className="text-primary-300">•</span>
        <span className="font-medium">
          {wordCount} {t('words')}
        </span>
        <span className="text-primary-300">•</span>
        <span className="truncate">
          {t('Last edited:')} {formatDateTime(diary.updatedAt)}
        </span>
      </div>
    </div>
  );
};

