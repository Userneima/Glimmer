import React, { useState } from 'react';
import type { KeyboardEvent } from 'react';
import { X, Plus } from 'lucide-react';
import { t } from '../../i18n';
import { getDefaultDiaryTagColor, normalizeDiaryTag, normalizeDiaryTags } from '../../utils/diaryTags';

interface TagInputProps {
  tags: string[];
  onChange: (tags: string[]) => void;
  placeholder?: string;
  className?: string;
}

export const TagInput: React.FC<TagInputProps> = ({
  tags,
  onChange,
  placeholder = t('Add tags (press Enter)...'),
  className = '',
}) => {
  const [inputValue, setInputValue] = useState('');

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && inputValue.trim()) {
      e.preventDefault();
      const newTag = normalizeDiaryTag(inputValue);
      if (newTag && !normalizeDiaryTags(tags).includes(newTag)) {
        onChange(normalizeDiaryTags([...tags, newTag]));
      }
      setInputValue('');
    } else if (e.key === 'Backspace' && !inputValue && tags.length > 0) {
      onChange(normalizeDiaryTags(tags.slice(0, -1)));
    }
  };

  const removeTag = (tagToRemove: string) => {
    onChange(normalizeDiaryTags(tags.filter(tag => normalizeDiaryTag(tag) !== normalizeDiaryTag(tagToRemove))));
  };

  const normalizedTags = normalizeDiaryTags(tags);

  return (
    <div className={`flex min-w-0 items-center p-2 border border-gray-300 rounded-lg focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-transparent ${className}`} style={{ minHeight: '40px' }}>
      <div className="min-w-0 flex-1 overflow-hidden">
        <div className="flex min-w-0 gap-2 overflow-x-auto" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none', WebkitOverflowScrolling: 'touch', minHeight: '24px' }}>
          {normalizedTags.map(tag => (
            <span
            key={tag}
            className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium border whitespace-nowrap ${getDefaultDiaryTagColor(
              tag
            )}`}
          >
              {tag}
              <button
                onClick={() => removeTag(tag)}
                className="hover:opacity-70 transition-opacity"
                type="button"
              >
                <X size={14} />
              </button>
            </span>
          ))}
          <input
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={tags.length === 0 ? placeholder : ''}
            className="ml-2 min-w-0 flex-grow bg-transparent text-sm outline-none"
            style={{ minWidth: '40px' }}
          />
        </div>
      </div>
      <button
        onClick={() => {
          if (inputValue.trim()) {
            const newTag = normalizeDiaryTag(inputValue);
            if (newTag && !normalizeDiaryTags(tags).includes(newTag)) {
              onChange(normalizeDiaryTags([...tags, newTag]));
            }
            setInputValue('');
          }
        }}
        className="ml-2 p-1.5 text-primary-600 hover:bg-primary-100 rounded-full transition-colors flex-shrink-0"
        type="button"
        title={t('Add tag')}
      >
        <Plus size={16} />
      </button>
    </div>
  );
};
