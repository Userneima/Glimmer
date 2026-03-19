import React, { useState } from 'react';
import type { KeyboardEvent } from 'react';
import { X, Plus } from 'lucide-react';
import { t } from '../../i18n';

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
      const newTag = inputValue.trim().toLowerCase();
      if (!tags.includes(newTag)) {
        onChange([...tags, newTag]);
      }
      setInputValue('');
    } else if (e.key === 'Backspace' && !inputValue && tags.length > 0) {
      onChange(tags.slice(0, -1));
    }
  };

  const removeTag = (tagToRemove: string) => {
    onChange(tags.filter(tag => tag !== tagToRemove));
  };

  const tagColors = [
    'bg-blue-100 text-blue-700 border-blue-200',
    'bg-green-100 text-green-700 border-green-200',
    'bg-purple-100 text-purple-700 border-purple-200',
    'bg-pink-100 text-pink-700 border-pink-200',
    'bg-yellow-100 text-yellow-700 border-yellow-200',
    'bg-indigo-100 text-indigo-700 border-indigo-200',
    'bg-red-100 text-red-700 border-red-200',
    'bg-orange-100 text-orange-700 border-orange-200',
  ];

  const getTagColor = (tag: string) => {
    const index = tag.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    return tagColors[index % tagColors.length];
  };

  return (
    <div className={`flex items-center p-2 border border-gray-300 rounded-lg focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-transparent ${className}`} style={{ minHeight: '40px' }}>
      <div className="flex-1 overflow-hidden">
        <div className="flex gap-2 overflow-x-auto" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none', WebkitOverflowScrolling: 'touch', minHeight: '24px' }}>
          {tags.map(tag => (
            <span
            key={tag}
            className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium border whitespace-nowrap ${getTagColor(
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
            className="outline-none bg-transparent text-sm ml-2 flex-grow"
            style={{ minWidth: '40px' }}
          />
        </div>
      </div>
      <button
        onClick={() => {
          if (inputValue.trim()) {
            const newTag = inputValue.trim().toLowerCase();
            if (!tags.includes(newTag)) {
              onChange([...tags, newTag]);
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
