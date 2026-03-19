import React, { useState } from 'react';
import { X } from 'lucide-react';
import { t } from '../../i18n';

interface ColorPickerProps {
  onColorSelect: (color: string) => void;
  onClose: () => void;
}

const PRESET_COLORS = [
  '#EF4444', '#F97316', '#EAB308', '#22C55E',
  '#06B6D4', '#3B82F6', '#8B5CF6', '#EC4899',
  '#6B7280', '#000000', '#FFFFFF',
];

const STORAGE_KEY = 'diary_saved_colors';

const getSavedColors = (): string[] => {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) {
    try {
      return JSON.parse(saved);
    } catch {
      return [];
    }
  }
  return [];
};

export const ColorPicker: React.FC<ColorPickerProps> = ({ onColorSelect, onClose }) => {
  const [hexInput, setHexInput] = useState('#000000');
  const [savedColors, setSavedColors] = useState<string[]>(() => getSavedColors());

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let value = e.target.value.toUpperCase();
    // 只允许输入 # 和 十六进制数字
    if (!value.startsWith('#')) {
      value = '#';
    }
    if (value.length > 7) {
      value = value.slice(0, 7);
    }
    setHexInput(value);
  };

  const isValidHex = (hex: string) => /^#[0-9A-F]{6}$/i.test(hex);

  const handleSaveColor = () => {
    if (isValidHex(hexInput)) {
      const normalized = hexInput.toUpperCase();
      const newSavedColors = savedColors.includes(normalized)
        ? savedColors
        : [normalized, ...savedColors].slice(0, 20); // 最多保存20个颜色
      setSavedColors(newSavedColors);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(newSavedColors));
    }
  };

  const handleDeleteColor = (color: string) => {
    const newSavedColors = savedColors.filter((c) => c !== color);
    setSavedColors(newSavedColors);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(newSavedColors));
  };

  const handleSelectColor = (color: string) => {
    // 只更新输入框的值，不立即应用颜色
    setHexInput(color.toUpperCase());
  };

  return (
    <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
        <div className="flex justify-between items-center mb-5">
          <h3 className="text-lg font-semibold text-gray-900 tracking-tight">{t('Text Color')}</h3>
          <button
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-all duration-200 active:scale-95"
            title={t('Cancel')}
          >
            <X size={18} strokeWidth={1.75} />
          </button>
        </div>

        {/* 颜色输入框 */}
        <div className="mb-5">
          <label className="block text-sm font-medium text-gray-700 mb-2">{t('Color Hex Value')}</label>
          <div className="flex gap-3">
            <input
              type="text"
              value={hexInput}
              onChange={handleInputChange}
              placeholder="#000000"
              className="flex-1 px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-gray-900 font-mono focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 focus:outline-none transition-all duration-200"
            />
            <div
              className="w-11 h-11 rounded-xl border-2 border-gray-200 shadow-inner"
              style={{ backgroundColor: isValidHex(hexInput) ? hexInput : '#ffffff' }}
            />
          </div>
        </div>

        {/* 预设颜色板 */}
        <div className="mb-5">
          <label className="block text-sm font-medium text-gray-700 mb-2">{t('Preset Colors')}</label>
          <div className="grid grid-cols-6 gap-2">
            {PRESET_COLORS.map((color) => (
              <button
                key={color}
                onClick={() => handleSelectColor(color)}
                className="w-9 h-9 rounded-lg border-2 border-gray-200 hover:border-blue-500 hover:scale-110 transition-all duration-200 shadow-sm"
                style={{ backgroundColor: color }}
                title={color}
              />
            ))}
          </div>
        </div>

        {/* 已保存的颜色 */}
        {savedColors.length > 0 && (
          <div className="mb-5">
            <label className="block text-sm font-medium text-gray-700 mb-2">{t('Saved Colors')}</label>
            <div className="grid grid-cols-6 gap-2">
              {savedColors.map((color) => (
                <div key={color} className="relative group">
                  <button
                    onClick={() => handleSelectColor(color)}
                    className="w-9 h-9 rounded-lg border-2 border-gray-200 hover:border-blue-500 hover:scale-110 transition-all duration-200 shadow-sm"
                    style={{ backgroundColor: color }}
                    title={color}
                  />
                  <button
                    onClick={() => handleDeleteColor(color)}
                    className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-all duration-200 flex items-center justify-center text-xs font-medium shadow-sm"
                    title={t('Delete')}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 操作按钮 */}
        <div className="flex gap-3 justify-end">
          <button
            onClick={() => {
              if (isValidHex(hexInput)) {
                handleSaveColor();
              }
            }}
            disabled={!isValidHex(hexInput)}
            className="px-4 py-2.5 bg-gray-100 text-gray-700 rounded-xl font-medium hover:bg-gray-200 disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-200 active:scale-[0.97]"
          >
            {t('Save Color')}
          </button>
          <button
            onClick={() => {
              if (isValidHex(hexInput)) {
                onColorSelect(hexInput);
                onClose();
              }
            }}
            disabled={!isValidHex(hexInput)}
            className="px-5 py-2.5 bg-blue-500 hover:bg-blue-600 text-white rounded-xl font-medium shadow-md hover:shadow-lg disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-200 active:scale-[0.97]"
          >
            {t('Apply')}
          </button>
        </div>
      </div>
    </div>
  );
};
