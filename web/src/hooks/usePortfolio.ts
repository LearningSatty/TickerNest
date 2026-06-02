import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { api } from '@/lib/api';
import { connectRealtime } from '@/lib/realtime';
import type { ConsolidatedResponse, Broker, BrokerHolding } from '@/types/api';

export const useConsolidated = () =>
  useQuery({
    queryKey: ['portfolio', 'consolidated'],
    queryFn: () => api<ConsolidatedResponse>('/portfolio/consolidated'),
    staleTime: 10_000,
  });

export const useBrokers = () =>
  useQuery({
    queryKey: ['brokers'],
    queryFn: () => api<Broker[]>('/brokers'),
    staleTime: 60_000,
  });

export const useBrokerHoldings = (brokerId: string | undefined) =>
  useQuery({
    queryKey: ['holdings', brokerId],
    queryFn: () => api<BrokerHolding[]>(`/holdings/${brokerId}`),
    enabled: !!brokerId,
    staleTime: 5_000,
  });

/**
 * Subscribe to server-side portfolio.changed events; invalidate the right
 * queries so TanStack refetches.
 */
export const usePortfolioRealtime = (userId: string | undefined) => {
  const qc = useQueryClient();
  useEffect(() => {
    if (!userId) return;
    const sock = connectRealtime(userId);
    const onChanged = (p: { tickers: string[]; brokerIds: string[] }) => {
      qc.invalidateQueries({ queryKey: ['portfolio', 'consolidated'] });
      for (const bid of p.brokerIds) {
        qc.invalidateQueries({ queryKey: ['holdings', bid] });
      }
    };
    sock.on('portfolio.changed', onChanged);
    return () => {
      sock.off('portfolio.changed', onChanged);
    };
  }, [userId, qc]);
};
