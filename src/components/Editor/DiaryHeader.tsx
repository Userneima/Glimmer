import React from 'react';
import { Download } from 'lucide-react';
import { Input } from '../UI/Input';
import { TagInput } from '../UI/TagInput';
import { Button } from '../UI/Button';
import { t } from '../../i18n';
import { formatDateTime } from '../../utils/date';
import type { Diary } from '../../types';
import { isLongTermMasterDiary } from '../../utils/diarySystem';

interface DiaryHeaderProps {
  diary: Diary;
  wordCount: number;
  isMobile?: boolean;
  onTitleChange: (title: string) => void;
  onTagsChange: (tags: string[]) => void;
  onExport: () => void;
}

export const DiaryHeader: React.FC<DiaryHeaderProps> = ({
  diary,
  wordCount,
  isMobile = false,
  onTitleChange,
  onTagsChange,
  onExport,
}) => {
  const isLongTermMaster = isLongTermMasterDiary(diary);
  const titlePlaceholder = diary.isTemplateDiary ? t('Leave blank to use date only') : t('Untitled');
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
      <div className={containerCommon + (isMobile ? ' mb-3' : '') + ' min-w-0'}>
        <div className="flex-1 min-w-0">
          {diary.isTemplateDiary && (
            <div className="mb-2">
              <span className="inline-flex items-center rounded-full bg-sky-100 px-2.5 py-1 text-xs font-semibold text-sky-700">
                {t('Template')}
              </span>
            </div>
          )}
          {isLongTermMaster && (
            <div className="mb-2">
              <span className="inline-flex items-center rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 text-xs font-semibold text-sky-700">
                {t('System Document')}
              </span>
            </div>
          )}
          <Input
            value={diary.title}
            onChange={(e) => onTitleChange(e.target.value)}
            placeholder={titlePlaceholder}
            variant="minimal"
            disabled={isLongTermMaster}
            className={(isMobile ? 'text-xl' : 'text-2xl') + ' font-bold border-none focus:ring-0 px-0 w-full min-w-0 tracking-tight'}
            style={{ color: 'var(--aurora-primary)', opacity: isLongTermMaster ? 1 : undefined }}
          />
        </div>
        <div className="ml-3 flex shrink-0 items-center gap-2">
          <Button
            type="button"
            variant="glass"
            size="sm"
            onClick={onExport}
            title={t('Export Current Diary')}
            aria-label={t('Export Current Diary')}
            className="shrink-0"
          >
            <Download size={16} strokeWidth={1.9} />
            {!isMobile && <span>{t('Export')}</span>}
          </Button>
        </div>
      </div>

      {!isLongTermMaster && (
        <div className={isMobile ? 'min-w-0' : 'flex min-w-0 items-center'}>
          <div className="min-w-0 flex-1">
            <TagInput
              tags={diary.tags}
              onChange={onTagsChange}
              placeholder={tagsPlaceholder}
              className={(isMobile ? 'mb-3 ' : '') + 'min-w-0 overflow-hidden'}
            />
          </div>
        </div>
      )}

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
