import React from 'react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'glass';
  size?: 'sm' | 'md' | 'lg';
  children: React.ReactNode;
}

export const Button: React.FC<ButtonProps> = ({
  variant = 'primary',
  size = 'md',
  children,
  className = '',
  ...props
}) => {
  const baseStyles = `
    inline-flex items-center justify-center
    font-medium
    transition-all duration-200 ease-apple
    focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-accent-500
    disabled:opacity-40 disabled:cursor-not-allowed disabled:transform-none
    active:scale-[0.97]
  `.replace(/\s+/g, ' ').trim();

  const variantStyles = {
    primary: `
      bg-gradient-to-b from-accent-500 to-accent-600
      text-white
      shadow-apple-sm
      hover:from-accent-400 hover:to-accent-500
      hover:shadow-apple
      active:from-accent-600 active:to-accent-700
    `.replace(/\s+/g, ' ').trim(),
    secondary: `
      bg-primary-100
      text-primary-900
      hover:bg-primary-200
      active:bg-primary-300
    `.replace(/\s+/g, ' ').trim(),
    ghost: `
      bg-transparent
      text-primary-700
      hover:bg-primary-100
      active:bg-primary-200
    `.replace(/\s+/g, ' ').trim(),
    danger: `
      bg-gradient-to-b from-semantic-error to-red-600
      text-white
      shadow-apple-sm
      hover:from-red-500 hover:to-red-600
      hover:shadow-apple
      active:from-red-600 active:to-red-700
    `.replace(/\s+/g, ' ').trim(),
    glass: `
      bg-white/60 backdrop-blur-apple
      text-primary-900
      border border-white/30
      shadow-apple-sm
      hover:bg-white/80
      active:bg-white/95
    `.replace(/\s+/g, ' ').trim(),
  };

  const sizeStyles = {
    sm: 'px-3 py-1.5 text-sm rounded-apple-sm gap-1.5',
    md: 'px-4 py-2 text-sm rounded-apple gap-2',
    lg: 'px-6 py-3 text-base rounded-apple-lg gap-2.5',
  };

  return (
    <button
      className={`${baseStyles} ${variantStyles[variant]} ${sizeStyles[size]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
};
