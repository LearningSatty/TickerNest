import { useConsolidated } from '@/hooks/usePortfolio';
import { ConsolidatedPivot } from '@/components/ConsolidatedPivot';

export default function Portfolio() {
  const { data, isLoading, error } = useConsolidated();
  if (isLoading) return <Skeleton />;
  if (error) return <ErrorPanel message={(error as Error).message} />;
  if (!data) return null;
  return (
    <div className="p-6 space-y-4">
      <header>
        <h1 className="text-xl font-semibold">Consolidated Portfolio</h1>
        <p className="text-2xs text-ink-muted">
          One row per ticker · per-broker breakdown · live valuations.
        </p>
      </header>
      <ConsolidatedPivot data={data} />
    </div>
  );
}

function Skeleton() {
  return (
    <div className="p-6 space-y-3">
      <div className="h-7 w-60 bg-line/60 rounded animate-pulse" />
      <div className="card h-[60vh] animate-pulse" />
    </div>
  );
}

function ErrorPanel({ message }: { message: string }) {
  return (
    <div className="p-6">
      <div className="card border-loss/40 p-4">
        <p className="text-loss text-sm">{message}</p>
      </div>
    </div>
  );
}
