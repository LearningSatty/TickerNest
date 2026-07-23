export const SERVICES = {
  stocks: import.meta.env.VITE_API_URL || 'http://localhost:3000',
  mf: import.meta.env.VITE_MF_URL || 'http://localhost:3001',
  intl: import.meta.env.VITE_INTL_URL || 'http://localhost:3002',
  physical: import.meta.env.VITE_PHYSICAL_URL || 'http://localhost:3003',
  onboarding: import.meta.env.VITE_ONBOARDING_URL || 'http://localhost:3004',
} as const;

export type ServiceKey = keyof typeof SERVICES;
