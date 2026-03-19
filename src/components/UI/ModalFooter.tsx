import React from 'react';
import { Button } from './Button';

interface ModalFooterProps {
  primaryLabel?: string;
  primaryOnClick?: () => void;
  primaryLoading?: boolean;
  primaryDisabled?: boolean;
  secondaryLabel?: string;
  secondaryOnClick?: () => void;
  children?: React.ReactNode; // for extra controls like file inputs or menus
}

export const ModalFooter: React.FC<ModalFooterProps> = ({
  primaryLabel,
  primaryOnClick,
  primaryLoading,
  primaryDisabled,
  secondaryLabel,
  secondaryOnClick,
  children,
}) => {
  return (
    <div className="flex gap-2 pt-4 items-center">
      <div className="flex-1">{children}</div>
      <div className="flex items-center gap-2">
        {primaryLabel && (
          <Button onClick={primaryOnClick} disabled={primaryDisabled} className="flex items-center justify-center gap-2">
            {primaryLoading ? primaryLabel : primaryLabel}
          </Button>
        )}
        {secondaryLabel && (
          <Button variant="secondary" onClick={secondaryOnClick} className="ml-2">
            {secondaryLabel}
          </Button>
        )}
      </div>
    </div>
  );
};
