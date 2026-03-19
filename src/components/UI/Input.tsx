import React from 'react';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  variant?: 'default' | 'filled' | 'minimal';
}

export const Input: React.FC<InputProps> = ({
  label,
  error,
  variant = 'default',
  className = '',
  ...props
}) => {
  const baseStyles = `
    w-full
    font-medium
    transition-all duration-200 ease-apple
    placeholder:text-primary-400
    disabled:opacity-50 disabled:cursor-not-allowed
  `.replace(/\s+/g, ' ').trim();

  const variantStyles = {
    default: `
      px-4 py-2.5
      bg-white
      border border-primary-200
      rounded-apple
      shadow-apple-inner
      focus:border-accent-500 focus:ring-2 focus:ring-accent-500/20 focus:outline-none
      hover:border-primary-300
      ${error ? 'border-semantic-error focus:border-semantic-error focus:ring-semantic-error/20' : ''}
    `.replace(/\s+/g, ' ').trim(),
    filled: `
      px-4 py-2.5
      bg-primary-100
      border border-transparent
      rounded-apple
      focus:bg-white focus:border-accent-500 focus:ring-2 focus:ring-accent-500/20 focus:outline-none
      hover:bg-primary-50
      ${error ? 'bg-red-50 focus:border-semantic-error focus:ring-semantic-error/20' : ''}
    `.replace(/\s+/g, ' ').trim(),
    minimal: `
      px-2 py-1.5
      bg-transparent
      border-b-2 border-primary-200
      rounded-none
      focus:border-accent-500 focus:outline-none
      hover:border-primary-300
      ${error ? 'border-semantic-error focus:border-semantic-error' : ''}
    `.replace(/\s+/g, ' ').trim(),
  };

  return (
    <div className="w-full">
      {label && (
        <label className="block text-sm font-medium text-primary-700 mb-1.5 tracking-tight">
          {label}
        </label>
      )}
      <input
        className={`${baseStyles} ${variantStyles[variant]} ${className}`}
        {...props}
      />
      {error && (
        <p className="mt-1.5 text-sm text-semantic-error font-medium">
          {error}
        </p>
      )}
    </div>
  );
};
