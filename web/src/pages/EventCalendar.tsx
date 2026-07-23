import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';

interface StockEvent {
  id: string;
  title: string;
  description: string;
  stock_ticker: string | null;
  event_date: string;
  event_time: string | null;
  event_type: string;
  color: string;
  source: 'custom' | 'yahoo';
  market?: 'US' | 'IN' | 'OTHER';
  created_at?: string;
}

const EVENT_TYPES = [
  { value: 'custom', label: 'Custom', color: '#3b82f6' },
  { value: 'earnings', label: 'Earnings', color: '#10b981' },
  { value: 'ipo', label: 'IPO', color: '#8b5cf6' },
  { value: 'expiry', label: 'Expiry', color: '#f59e0b' },
  { value: 'dividend', label: 'Dividend', color: '#06b6d4' },
  { value: 'split', label: 'Split', color: '#ec4899' },
  { value: 'lock_in', label: 'Lock-in Expiry', color: '#ef4444' },
  { value: 'other', label: 'Other', color: '#6b7280' },
];

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const DAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function EventCalendar() {
  const qc = useQueryClient();
  const today = new Date();
  const [currentYear, setCurrentYear] = useState(today.getFullYear());
  const [currentMonth, setCurrentMonth] = useState(today.getMonth());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [view, setView] = useState<'month' | 'year'>('month');

  // Form state
  const [formTitle, setFormTitle] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formStockTicker, setFormStockTicker] = useState('');
  const [formDate, setFormDate] = useState('');
  const [formTime, setFormTime] = useState('');
  const [formType, setFormType] = useState('custom');
  const [formColor, setFormColor] = useState('#3b82f6');
  const [editingEvent, setEditingEvent] = useState<StockEvent | null>(null);

  // Filters for Yahoo events
  const [filterMarket, setFilterMarket] = useState<'all' | 'US' | 'IN'>('all');
  const [filterType, setFilterType] = useState<'all' | 'earnings' | 'ipo' | 'split' | 'dividend' | 'other'>('all');

  const monthStr = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}`;

  const { data: events = [] } = useQuery({
    queryKey: ['events', monthStr],
    queryFn: () => api<StockEvent[]>(`/events?month=${monthStr}`),
  });

  // Year view: fetch all events for the year
  const { data: yearEvents = [] } = useQuery({
    queryKey: ['events-year', currentYear],
    queryFn: () => api<StockEvent[]>(`/events?from=${currentYear}-01-01&to=${currentYear}-12-31`),
    enabled: view === 'year',
  });

  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: ['events', monthStr] });
    qc.invalidateQueries({ queryKey: ['events-year', currentYear] });
    qc.invalidateQueries({ queryKey: ['events-today'] });
  };

  const createMut = useMutation({
    mutationFn: (body: {
      title: string;
      description: string;
      stock_ticker?: string;
      event_date: string;
      event_time?: string;
      event_type: string;
      color: string;
    }) => api<StockEvent>('/events', { method: 'POST', body }),
    onSuccess: (_data, variables) => {
      invalidateAll();
      // Also invalidate the target month if it differs from current view
      const targetMonth = variables.event_date.slice(0, 7);
      if (targetMonth !== monthStr) {
        qc.invalidateQueries({ queryKey: ['events', targetMonth] });
      }
      setSelectedDate(variables.event_date);
      resetForm();
    },
  });

  const updateMut = useMutation({
    mutationFn: ({ id, ...body }: { id: string; title: string; description: string; stock_ticker?: string; event_date: string; event_time?: string; event_type: string; color: string }) =>
      api<StockEvent>(`/events/${id}`, { method: 'PATCH', body }),
    onSuccess: (_data, variables) => {
      invalidateAll();
      const targetMonth = variables.event_date.slice(0, 7);
      if (targetMonth !== monthStr) {
        qc.invalidateQueries({ queryKey: ['events', targetMonth] });
      }
      setSelectedDate(variables.event_date);
      resetForm();
    },
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => api(`/events/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      invalidateAll();
    },
  });

  const resetForm = () => {
    setShowAddForm(false);
    setEditingEvent(null);
    setFormTitle('');
    setFormDescription('');
    setFormStockTicker('');
    setFormDate('');
    setFormTime('');
    setFormType('custom');
    setFormColor('#3b82f6');
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formTitle.trim() || !formDate) return;
    const stockTicker = formStockTicker.trim() || undefined;
    const eventTime = formTime || undefined;
    if (editingEvent) {
      updateMut.mutate({
        id: editingEvent.id,
        title: formTitle.trim(),
        description: formDescription.trim(),
        ...(stockTicker ? { stock_ticker: stockTicker } : {}),
        event_date: formDate,
        ...(eventTime ? { event_time: eventTime } : {}),
        event_type: formType,
        color: formColor,
      });
    } else {
      createMut.mutate({
        title: formTitle.trim(),
        description: formDescription.trim(),
        ...(stockTicker ? { stock_ticker: stockTicker } : {}),
        event_date: formDate,
        ...(eventTime ? { event_time: eventTime } : {}),
        event_type: formType,
        color: formColor,
      });
    }
  };

  const startEdit = (ev: StockEvent) => {
    setEditingEvent(ev);
    setFormTitle(ev.title);
    setFormDescription(ev.description);
    setFormStockTicker(ev.stock_ticker ?? '');
    setFormDate(ev.event_date);
    setFormTime(ev.event_time ?? '');
    setFormType(ev.event_type);
    setFormColor(ev.color);
    setShowAddForm(true);
  };

  const openAddForDate = (date: string) => {
    resetForm();
    setFormDate(date);
    setShowAddForm(true);
  };

  // Calendar grid calculation
  const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
  const firstDayOfWeek = new Date(currentYear, currentMonth, 1).getDay();

  const eventsByDate = useMemo(() => {
    const map: Record<string, StockEvent[]> = {};
    const evs = view === 'year' ? yearEvents : events;
    for (const ev of evs) {
      // Apply filters for Yahoo events
      if (ev.source === 'yahoo') {
        if (filterMarket !== 'all' && ev.market !== filterMarket) continue;
        if (filterType !== 'all' && ev.event_type !== filterType) continue;
      }
      // Normalize: API may return "2026-06-04T00:00:00.000Z" or "2026-06-04"
      const key = ev.event_date.slice(0, 10);
      if (!map[key]) map[key] = [];
      map[key]!.push(ev);
    }
    return map;
  }, [events, yearEvents, view, filterMarket, filterType]);

  const selectedEvents = selectedDate ? (eventsByDate[selectedDate] ?? []) : [];

  const prevMonth = () => {
    if (currentMonth === 0) {
      setCurrentMonth(11);
      setCurrentYear(currentYear - 1);
    } else {
      setCurrentMonth(currentMonth - 1);
    }
  };

  const nextMonth = () => {
    if (currentMonth === 11) {
      setCurrentMonth(0);
      setCurrentYear(currentYear + 1);
    } else {
      setCurrentMonth(currentMonth + 1);
    }
  };

  const goToToday = () => {
    setCurrentYear(today.getFullYear());
    setCurrentMonth(today.getMonth());
    setSelectedDate(today.toISOString().slice(0, 10));
  };

  return (
    <div className="p-6 space-y-4 h-full flex flex-col">
      {/* Header */}
      <header className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-xl font-semibold">📅 Event Calendar</h1>
        <div className="flex items-center gap-2">
          <div className="flex gap-1 bg-bg-soft rounded-lg p-1">
            <button
              onClick={() => setView('month')}
              className={cn(
                'px-3 py-1 text-xs rounded-md transition-colors',
                view === 'month' ? 'bg-accent text-white' : 'text-ink-muted hover:text-ink',
              )}
            >
              Month
            </button>
            <button
              onClick={() => setView('year')}
              className={cn(
                'px-3 py-1 text-xs rounded-md transition-colors',
                view === 'year' ? 'bg-accent text-white' : 'text-ink-muted hover:text-ink',
              )}
            >
              Year
            </button>
          </div>
          <button
            onClick={goToToday}
            className="px-3 py-1.5 text-xs border border-line rounded-md hover:bg-line/40"
          >
            Today
          </button>
          <button
            onClick={() => { resetForm(); setShowAddForm(true); setFormDate(today.toISOString().slice(0, 10)); }}
            className="px-3 py-1.5 bg-accent text-white rounded-md text-xs font-medium hover:bg-accent/90"
          >
            + Add Event
          </button>
        </div>
      </header>

      {/* Filters for Yahoo events */}
      <div className="flex items-center gap-3 flex-wrap">
        <span className="text-2xs text-ink-muted">Filter market events:</span>
        <div className="flex gap-1 bg-bg-soft rounded-lg p-0.5">
          {(['all', 'US', 'IN'] as const).map((m) => (
            <button
              key={m}
              onClick={() => setFilterMarket(m)}
              className={cn(
                'px-2.5 py-1 text-[10px] rounded-md transition-colors',
                filterMarket === m
                  ? 'bg-accent text-white'
                  : 'text-ink-muted hover:text-ink hover:bg-line/40',
              )}
            >
              {m === 'all' ? 'All Markets' : m === 'US' ? '🇺🇸 US' : '🇮🇳 India'}
            </button>
          ))}
        </div>
        <div className="flex gap-1 bg-bg-soft rounded-lg p-0.5">
          {(['all', 'earnings', 'ipo', 'split', 'dividend'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setFilterType(t)}
              className={cn(
                'px-2.5 py-1 text-[10px] rounded-md transition-colors',
                filterType === t
                  ? 'bg-accent text-white'
                  : 'text-ink-muted hover:text-ink hover:bg-line/40',
              )}
            >
              {t === 'all' ? 'All Types' : t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {view === 'month' ? (
        <div className="flex flex-1 gap-4 min-h-0">
          {/* Calendar Grid */}
          <div className="flex-1 card p-4 flex flex-col min-h-0">
            {/* Month navigation */}
            <div className="flex items-center justify-between mb-4">
              <button onClick={prevMonth} className="p-2 rounded-md hover:bg-line/40">
                ◀
              </button>
              <h2 className="text-lg font-semibold">
                {MONTHS[currentMonth]} {currentYear}
              </h2>
              <button onClick={nextMonth} className="p-2 rounded-md hover:bg-line/40">
                ▶
              </button>
            </div>

            {/* Day headers */}
            <div className="grid grid-cols-7 gap-px mb-1">
              {DAYS_SHORT.map((d) => (
                <div key={d} className="text-center text-2xs font-medium text-ink-muted py-1">
                  {d}
                </div>
              ))}
            </div>

            {/* Calendar cells */}
            <div className="grid grid-cols-7 gap-px flex-1 auto-rows-fr">
              {/* Empty cells before first day */}
              {Array.from({ length: firstDayOfWeek }).map((_, i) => (
                <div key={`empty-${i}`} className="bg-bg-soft/30 rounded-sm" />
              ))}
              {/* Day cells */}
              {Array.from({ length: daysInMonth }).map((_, i) => {
                const day = i + 1;
                const dateStr = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                const dayEvents = eventsByDate[dateStr] ?? [];
                const isToday = dateStr === today.toISOString().slice(0, 10);
                const isSelected = dateStr === selectedDate;

                return (
                  <button
                    key={day}
                    onClick={() => setSelectedDate(dateStr)}
                    onDoubleClick={() => openAddForDate(dateStr)}
                    className={cn(
                      'relative p-1 rounded-sm text-left hover:bg-line/40 transition-colors flex flex-col min-h-[60px]',
                      isToday && 'ring-2 ring-accent/50',
                      isSelected && 'bg-accent/10',
                    )}
                  >
                    <span
                      className={cn(
                        'text-2xs font-medium w-5 h-5 flex items-center justify-center rounded-full',
                        isToday && 'bg-accent text-white',
                      )}
                    >
                      {day}
                    </span>
                    <div className="flex flex-col gap-px mt-0.5 overflow-hidden flex-1">
                      {dayEvents.slice(0, 3).map((ev) => (
                        <div
                          key={ev.id}
                          className="text-[9px] leading-tight px-1 rounded truncate text-white"
                          style={{ backgroundColor: ev.color }}
                          title={ev.title}
                        >
                          {ev.stock_ticker ? `${ev.stock_ticker}: ` : ''}{ev.title}
                        </div>
                      ))}
                      {dayEvents.length > 3 && (
                        <span className="text-[9px] text-ink-muted">+{dayEvents.length - 3} more</span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Side panel: selected date events */}
          <div className="w-80 card p-4 overflow-y-auto flex flex-col">
            <h3 className="font-medium text-sm mb-3">
              {selectedDate
                ? new Date(selectedDate + 'T00:00:00').toLocaleDateString('en-IN', {
                    weekday: 'long',
                    day: 'numeric',
                    month: 'long',
                    year: 'numeric',
                  })
                : 'Select a date'}
            </h3>
            {selectedDate && (
              <button
                onClick={() => openAddForDate(selectedDate)}
                className="mb-3 w-full py-1.5 border border-dashed border-line rounded-md text-2xs text-ink-muted hover:text-accent hover:border-accent transition-colors"
              >
                + Add event for this day
              </button>
            )}
            {selectedEvents.length === 0 ? (
              <p className="text-2xs text-ink-muted">No events for this date.</p>
            ) : (
              <div className="space-y-2 flex-1 overflow-y-auto">
                {/* Custom events first */}
                {selectedEvents.filter((e) => e.source === 'custom').length > 0 && (
                  <>
                    <div className="text-[10px] uppercase tracking-wide text-ink-muted font-medium pt-1">
                      My Events
                    </div>
                    {selectedEvents.filter((e) => e.source === 'custom').map((ev) => (
                      <EventCard key={ev.id} ev={ev} onEdit={startEdit} onDelete={(id) => deleteMut.mutate(id)} />
                    ))}
                  </>
                )}
                {/* Yahoo events after */}
                {selectedEvents.filter((e) => e.source === 'yahoo').length > 0 && (
                  <>
                    <div className="text-[10px] uppercase tracking-wide text-ink-muted font-medium pt-2 flex items-center gap-1">
                      <span>📡</span> Market Events
                    </div>
                    {selectedEvents.filter((e) => e.source === 'yahoo').map((ev) => (
                      <EventCard key={ev.id} ev={ev} onEdit={null} onDelete={null} />
                    ))}
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      ) : (
        /* Year view */
        <div className="flex-1 overflow-y-auto">
          <div className="flex items-center justify-center gap-4 mb-4">
            <button onClick={() => setCurrentYear(currentYear - 1)} className="p-2 rounded-md hover:bg-line/40">◀</button>
            <h2 className="text-lg font-semibold">{currentYear}</h2>
            <button onClick={() => setCurrentYear(currentYear + 1)} className="p-2 rounded-md hover:bg-line/40">▶</button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {MONTHS.map((monthName, mi) => (
              <MiniMonth
                key={mi}
                year={currentYear}
                month={mi}
                monthName={monthName}
                eventsByDate={eventsByDate}
                today={today}
                onSelect={(date) => {
                  setCurrentMonth(mi);
                  setSelectedDate(date);
                  setView('month');
                }}
              />
            ))}
          </div>
        </div>
      )}

      {/* Add/Edit Event Modal */}
      {showAddForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={resetForm}>
          <div className="bg-bg-lift rounded-xl border border-line p-6 w-full max-w-md shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold mb-4">
              {editingEvent ? 'Edit Event' : 'Add Event'}
            </h3>
            <form onSubmit={handleSubmit} className="space-y-3">
              <div>
                <label className="text-2xs text-ink-muted block mb-1">Title *</label>
                <input
                  type="text"
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  placeholder="e.g., Lock-in period expiry"
                  className="w-full px-3 py-2 rounded-md border border-line bg-bg-lift text-sm focus:outline-none focus:ring-2 focus:ring-accent/50"
                  autoFocus
                />
              </div>
              <div>
                <label className="text-2xs text-ink-muted block mb-1">Stock Ticker (optional)</label>
                <input
                  type="text"
                  value={formStockTicker}
                  onChange={(e) => setFormStockTicker(e.target.value.toUpperCase())}
                  placeholder="e.g., MEESHO, RELIANCE"
                  className="w-full px-3 py-2 rounded-md border border-line bg-bg-lift text-sm focus:outline-none focus:ring-2 focus:ring-accent/50"
                />
              </div>
              <div>
                <label className="text-2xs text-ink-muted block mb-1">Description</label>
                <textarea
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  placeholder="e.g., Lock-in period for nearly 68% of Meesho's pre-IPO shares expires"
                  rows={3}
                  className="w-full px-3 py-2 rounded-md border border-line bg-bg-lift text-sm resize-none focus:outline-none focus:ring-2 focus:ring-accent/50"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-2xs text-ink-muted block mb-1">Date *</label>
                  <input
                    type="date"
                    value={formDate}
                    onChange={(e) => setFormDate(e.target.value)}
                    className="w-full px-3 py-2 rounded-md border border-line bg-bg-lift text-sm focus:outline-none focus:ring-2 focus:ring-accent/50"
                  />
                </div>
                <div>
                  <label className="text-2xs text-ink-muted block mb-1">Time (optional)</label>
                  <input
                    type="time"
                    value={formTime}
                    onChange={(e) => setFormTime(e.target.value)}
                    className="w-full px-3 py-2 rounded-md border border-line bg-bg-lift text-sm focus:outline-none focus:ring-2 focus:ring-accent/50"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-2xs text-ink-muted block mb-1">Event Type</label>
                  <select
                    value={formType}
                    onChange={(e) => {
                      setFormType(e.target.value);
                      const found = EVENT_TYPES.find((t) => t.value === e.target.value);
                      if (found) setFormColor(found.color);
                    }}
                    className="w-full px-3 py-2 rounded-md border border-line bg-bg-lift text-sm focus:outline-none focus:ring-2 focus:ring-accent/50"
                  >
                    {EVENT_TYPES.map((t) => (
                      <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-2xs text-ink-muted block mb-1">Color</label>
                  <input
                    type="color"
                    value={formColor}
                    onChange={(e) => setFormColor(e.target.value)}
                    className="w-full h-[38px] rounded-md border border-line cursor-pointer"
                  />
                </div>
              </div>
              <div className="flex gap-2 pt-2">
                <button
                  type="submit"
                  disabled={!formTitle.trim() || !formDate || createMut.isPending || updateMut.isPending}
                  className="flex-1 py-2 bg-accent text-white rounded-md text-sm font-medium hover:bg-accent/90 disabled:opacity-50"
                >
                  {editingEvent ? 'Update Event' : 'Create Event'}
                </button>
                <button
                  type="button"
                  onClick={resetForm}
                  className="px-4 py-2 border border-line rounded-md text-sm hover:bg-line/40"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

/** Single event card in the side panel */
function EventCard({
  ev,
  onEdit,
  onDelete,
}: {
  ev: StockEvent;
  onEdit: ((ev: StockEvent) => void) | null;
  onDelete: ((id: string) => void) | null;
}) {
  return (
    <div className={cn(
      'p-3 rounded-lg border space-y-1',
      ev.source === 'yahoo' ? 'border-line/40 bg-bg-soft/30' : 'border-line/60',
    )}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: ev.color }} />
          <span className="text-xs font-medium truncate">{ev.title}</span>
        </div>
        {ev.source === 'custom' && (
          <div className="flex gap-1 shrink-0">
            {onEdit && <button onClick={() => onEdit(ev)} className="text-[10px] hover:text-accent">✏️</button>}
            {onDelete && (
              <button
                onClick={() => { if (confirm('Delete?')) onDelete(ev.id); }}
                className="text-[10px] hover:text-loss"
              >
                🗑️
              </button>
            )}
          </div>
        )}
      </div>
      {ev.stock_ticker && (
        <span className="inline-block text-[10px] px-1.5 py-0.5 rounded bg-accent/10 text-accent font-medium">
          {ev.stock_ticker}
        </span>
      )}
      {ev.description && (
        <p className="text-2xs text-ink-muted">{ev.description}</p>
      )}
      <div className="flex items-center gap-1.5 flex-wrap">
        {ev.event_time && (
          <span className="text-2xs text-ink-muted">🕐 {ev.event_time}</span>
        )}
        <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-line/40 text-ink-muted">
          {EVENT_TYPES.find((t) => t.value === ev.event_type)?.label ?? ev.event_type}
        </span>
        {ev.source === 'yahoo' && (
          <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-amber-500/10 text-amber-600">
            Yahoo
          </span>
        )}
        {ev.market && ev.market !== 'OTHER' && (
          <span className={cn(
            'text-[9px] px-1.5 py-0.5 rounded-full',
            ev.market === 'US' ? 'bg-blue-500/10 text-blue-600' : 'bg-orange-500/10 text-orange-600',
          )}>
            {ev.market === 'US' ? '🇺🇸 US' : '🇮🇳 IN'}
          </span>
        )}
      </div>
    </div>
  );
}

/** Mini-month calendar for year view */
function MiniMonth({
  year,
  month,
  monthName,
  eventsByDate,
  today,
  onSelect,
}: {
  year: number;
  month: number;
  monthName: string;
  eventsByDate: Record<string, StockEvent[]>;
  today: Date;
  onSelect: (date: string) => void;
}) {
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDayOfWeek = new Date(year, month, 1).getDay();
  const todayStr = today.toISOString().slice(0, 10);

  return (
    <div className="card p-3">
      <h4 className="text-sm font-semibold mb-2 text-center">{monthName}</h4>
      <div className="grid grid-cols-7 gap-px text-center">
        {DAYS_SHORT.map((d) => (
          <div key={d} className="text-[9px] text-ink-muted py-0.5">{d[0]}</div>
        ))}
        {Array.from({ length: firstDayOfWeek }).map((_, i) => (
          <div key={`e-${i}`} />
        ))}
        {Array.from({ length: daysInMonth }).map((_, i) => {
          const day = i + 1;
          const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
          const hasEvents = (eventsByDate[dateStr]?.length ?? 0) > 0;
          const isToday = dateStr === todayStr;
          return (
            <button
              key={day}
              onClick={() => onSelect(dateStr)}
              className={cn(
                'text-[10px] w-5 h-5 rounded-full flex items-center justify-center mx-auto hover:bg-line/40',
                isToday && 'bg-accent text-white',
                hasEvents && !isToday && 'font-bold text-accent',
              )}
            >
              {day}
            </button>
          );
        })}
      </div>
    </div>
  );
}
