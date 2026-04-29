const parseCsv = (value: string | undefined): string[] =>
  (value ?? '')
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);

export const allowSelfSignUp = (import.meta.env.VITE_ALLOW_SELF_SIGNUP ?? 'false') === 'true';

export const internalAllowedEmails = parseCsv(import.meta.env.VITE_INTERNAL_ALLOWED_EMAILS);

export const internalAllowedDomains = parseCsv(import.meta.env.VITE_INTERNAL_ALLOWED_EMAIL_DOMAINS);

export const isInternalEmailAllowed = (email: string): boolean => {
  const normalized = email.trim().toLowerCase();
  if (!normalized) return false;

  if (internalAllowedEmails.length === 0 && internalAllowedDomains.length === 0) {
    return true;
  }

  if (internalAllowedEmails.includes(normalized)) {
    return true;
  }

  const domain = normalized.split('@')[1] ?? '';
  return internalAllowedDomains.includes(domain);
};
