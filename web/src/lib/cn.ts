import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
export const cn = (...xs: ClassValue[]) => twMerge(clsx(xs));
