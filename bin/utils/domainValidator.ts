export interface DomainValidationResult {
  valid: boolean;
  message?: string;
}

export function normalizeDomain(domain: string): string {
  return domain.replace(/^https?:\/\//, '').replace(/\/$/, '');
}

export function isDnsDomain(domain: string): boolean {
  return normalizeDomain(domain).includes('.');
}

export function validateDnsDomain(domain: string): DomainValidationResult {
  const cleanDomain = normalizeDomain(domain);
  const domainRegex =
    /^[a-zA-Z0-9][a-zA-Z0-9-]*(\.[a-zA-Z0-9][a-zA-Z0-9-]*)*\.[a-zA-Z]{2,}$/;
  const parts = cleanDomain.split('.');

  if (parts.length < 2) {
    return {
      valid: false,
      message:
        'Invalid domain format. Please enter a complete domain (e.g., example.com)',
    };
  }

  for (const part of parts) {
    if (part.length === 0) {
      return {
        valid: false,
        message: 'Invalid domain format. Consecutive dots are not allowed',
      };
    }
    if (part.length > 63) {
      return {
        valid: false,
        message:
          'Invalid domain format. Each label must be 63 characters or less',
      };
    }
    if (!/^[a-zA-Z0-9-]+$/.test(part)) {
      return {
        valid: false,
        message:
          'Invalid domain format. Domains can only contain letters, numbers, and hyphens',
      };
    }
    if (/^-|-$/.test(part)) {
      return {
        valid: false,
        message:
          'Invalid domain format. Labels cannot start or end with hyphens',
      };
    }
  }

  if (!domainRegex.test(cleanDomain)) {
    return { valid: false, message: 'Invalid domain format' };
  }

  return { valid: true };
}
