"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { Popover } from "@base-ui/react/popover";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

type Ymd = { year: number; month: number; day: number }; // month 0–11

function parse(value: string | undefined): Ymd | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value ?? "");
  if (!match) return null;
  const [year, month, day] = [Number(match[1]), Number(match[2]) - 1, Number(match[3])];
  const date = new Date(Date.UTC(year, month, day));
  return date.getUTCMonth() === month ? { year, month, day } : null;
}

const toIso = ({ year, month, day }: Ymd) =>
  `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

const daysIn = (year: number, month: number) => new Date(Date.UTC(year, month + 1, 0)).getUTCDate();

/** Adds days across month/year boundaries. */
function addDays(date: Ymd, days: number): Ymd {
  const d = new Date(Date.UTC(date.year, date.month, date.day + days));
  return { year: d.getUTCFullYear(), month: d.getUTCMonth(), day: d.getUTCDate() };
}

const format = (date: Ymd) => `${MONTHS[date.month]} ${date.day}, ${date.year}`;

/**
 * Date field with a calendar popover. Month and year are dropdowns, so far
 * dates (birthdates) are two clicks away. Value is "YYYY-MM-DD" or "".
 * Keyboard: arrows move by day/week, Page Up/Down by month, Enter picks.
 */
export function DatePicker({
  id,
  value,
  onChange,
  onClose,
  min,
  max,
  defaultMonth,
  placeholder = "Select a date",
  invalid = false,
  describedBy,
  disabled = false,
  className = "",
}: Readonly<{
  id?: string;
  value: string;
  onChange: (value: string) => void;
  /** Called when the calendar closes (use it to validate, like onBlur). */
  onClose?: () => void;
  min?: string;
  max?: string;
  /** Month shown when there is no value, as "YYYY-MM-DD". */
  defaultMonth?: string;
  placeholder?: string;
  invalid?: boolean;
  describedBy?: string;
  disabled?: boolean;
  /** Classes for the trigger (match the other inputs). */
  className?: string;
}>) {
  const selected = parse(value);
  const minDate = parse(min);
  const maxDate = parse(max);
  const start = selected ?? parse(defaultMonth) ?? maxDate ?? parse(new Date().toISOString().slice(0, 10))!;

  const [open, setOpen] = useState(false);
  const [view, setView] = useState({ year: start.year, month: start.month });
  const [focused, setFocused] = useState<Ymd>(start);
  const grid = useRef<HTMLDivElement>(null);
  // Move DOM focus to the focused day only on open and keyboard navigation,
  // not when the month/year dropdowns change (they keep their own focus).
  const focusGrid = useRef(false);

  const outOfRange = (date: Ymd) => {
    const iso = toIso(date);
    return (min !== undefined && iso < min) || (max !== undefined && iso > max);
  };

  // Keep keyboard focus on the focused day while the calendar is open.
  useEffect(() => {
    if (!open || !focusGrid.current) return;
    focusGrid.current = false;
    grid.current?.querySelector<HTMLButtonElement>(`[data-date="${toIso(focused)}"]`)?.focus();
  }, [open, focused]);

  function openChange(next: boolean) {
    if (next) {
      const at = selected ?? start;
      setView({ year: at.year, month: at.month });
      setFocused(at);
      focusGrid.current = true;
    }
    setOpen(next);
    if (!next) onClose?.();
  }

  function moveFocus(date: Ymd) {
    if (outOfRange(date)) return;
    focusGrid.current = true;
    setFocused(date);
    setView({ year: date.year, month: date.month });
  }

  function onGridKey(event: KeyboardEvent) {
    const moves: Record<string, () => Ymd> = {
      ArrowLeft: () => addDays(focused, -1),
      ArrowRight: () => addDays(focused, 1),
      ArrowUp: () => addDays(focused, -7),
      ArrowDown: () => addDays(focused, 7),
      PageUp: () => shiftMonth(focused, -1),
      PageDown: () => shiftMonth(focused, 1),
    };
    const move = moves[event.key];
    if (!move) return;
    event.preventDefault();
    moveFocus(move());
  }

  function shiftMonth(date: Ymd, by: number): Ymd {
    const d = new Date(Date.UTC(date.year, date.month + by, 1));
    const year = d.getUTCFullYear();
    const month = d.getUTCMonth();
    return { year, month, day: Math.min(date.day, daysIn(year, month)) };
  }

  function showMonth(year: number, month: number) {
    setView({ year, month });
    setFocused({ year, month, day: Math.min(focused.day, daysIn(year, month)) });
  }

  function pick(date: Ymd) {
    onChange(toIso(date));
    openChange(false);
  }

  const firstYear = minDate?.year ?? view.year - 100;
  const lastYear = maxDate?.year ?? view.year + 10;
  const years = Array.from({ length: lastYear - firstYear + 1 }, (_, i) => lastYear - i);
  const prev = shiftMonth({ ...view, day: 1 }, -1);
  const next = shiftMonth({ ...view, day: 1 }, 1);
  const canPrev = !minDate || toIso({ ...prev, day: daysIn(prev.year, prev.month) }) >= toIso(minDate);
  const canNext = !maxDate || toIso(next) <= toIso(maxDate);

  const leading = new Date(Date.UTC(view.year, view.month, 1)).getUTCDay();
  const cells: (Ymd | null)[] = [
    ...Array.from({ length: leading }, () => null),
    ...Array.from({ length: daysIn(view.year, view.month) }, (_, i) => ({ ...view, day: i + 1 })),
  ];
  const today = new Date().toISOString().slice(0, 10);
  const selectClass =
    "h-8 cursor-pointer rounded-md border border-neutral-300 bg-white px-2 text-sm font-medium outline-none hover:border-neutral-400 focus-visible:ring-2 focus-visible:ring-[#191e73]/30";
  const navButton =
    "flex size-8 items-center justify-center rounded-md text-neutral-700 hover:bg-neutral-100 disabled:pointer-events-none disabled:opacity-30 focus-visible:ring-2 focus-visible:ring-[#191e73]/30 focus-visible:outline-none";

  return (
    <Popover.Root open={open} onOpenChange={openChange}>
      <Popover.Trigger
        id={id}
        disabled={disabled}
        aria-invalid={invalid}
        aria-describedby={describedBy}
        className={`flex items-center justify-between gap-2 text-left ${className}`}
      >
        <span className={selected ? "text-black" : "text-neutral-400"}>
          {selected ? format(selected) : placeholder}
        </span>
        <CalendarDays className="size-4 shrink-0 text-neutral-500" aria-hidden="true" />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner side="bottom" align="start" sideOffset={6} className="z-[60]">
          <Popover.Popup
            aria-label="Choose a date"
            className="w-[19rem] rounded-xl border border-neutral-200 bg-white p-3 text-black shadow-xl outline-none transition-[opacity,transform] duration-150 data-[ending-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:scale-95 data-[starting-style]:opacity-0"
          >
            <div className="mb-2 flex items-center justify-between gap-1">
              <button type="button" onClick={() => showMonth(prev.year, prev.month)} disabled={!canPrev} aria-label="Previous month" className={navButton}>
                <ChevronLeft className="size-4" />
              </button>
              <div className="flex gap-1.5">
                <select
                  aria-label="Month"
                  value={view.month}
                  onChange={(e) => showMonth(view.year, Number(e.target.value))}
                  className={selectClass}
                >
                  {MONTHS.map((name, month) => {
                    const lastDay = { year: view.year, month, day: daysIn(view.year, month) };
                    const firstDay = { year: view.year, month, day: 1 };
                    const unavailable = (minDate && toIso(lastDay) < toIso(minDate)) || (maxDate && toIso(firstDay) > toIso(maxDate));
                    return (
                      <option key={name} value={month} disabled={Boolean(unavailable)}>
                        {name}
                      </option>
                    );
                  })}
                </select>
                <select
                  aria-label="Year"
                  value={view.year}
                  onChange={(e) => {
                    const year = Number(e.target.value);
                    // Keep the month inside the allowed range for that year.
                    let month = view.month;
                    if (maxDate && year === maxDate.year) month = Math.min(month, maxDate.month);
                    if (minDate && year === minDate.year) month = Math.max(month, minDate.month);
                    showMonth(year, month);
                  }}
                  className={selectClass}
                >
                  {years.map((year) => (
                    <option key={year} value={year}>
                      {year}
                    </option>
                  ))}
                </select>
              </div>
              <button type="button" onClick={() => showMonth(next.year, next.month)} disabled={!canNext} aria-label="Next month" className={navButton}>
                <ChevronRight className="size-4" />
              </button>
            </div>

            <div className="grid grid-cols-7 text-center text-[11px] font-medium text-neutral-500" aria-hidden="true">
              {WEEKDAYS.map((day) => (
                <span key={day} className="py-1">
                  {day}
                </span>
              ))}
            </div>
            <div ref={grid} role="grid" aria-label={`${MONTHS[view.month]} ${view.year}`} onKeyDown={onGridKey} className="grid grid-cols-7 gap-0.5">
              {cells.map((date, index) => {
                if (!date) return <span key={`blank-${index}`} />;
                const iso = toIso(date);
                const isSelected = value === iso;
                const isFocused = toIso(focused) === iso;
                const unavailable = outOfRange(date);
                return (
                  <button
                    key={iso}
                    type="button"
                    role="gridcell"
                    data-date={iso}
                    tabIndex={isFocused ? 0 : -1}
                    disabled={unavailable}
                    aria-selected={isSelected}
                    aria-label={format(date)}
                    onClick={() => pick(date)}
                    className={`flex h-9 items-center justify-center rounded-md text-sm tabular-nums transition-colors outline-none focus-visible:ring-2 focus-visible:ring-[#191e73]/40 disabled:cursor-not-allowed disabled:text-neutral-300 ${
                      isSelected
                        ? "bg-[#191e73] font-semibold text-white"
                        : `hover:bg-[#e3e4f8] ${iso === today ? "font-semibold text-[#191e73]" : "text-neutral-800"}`
                    }`}
                  >
                    {date.day}
                  </button>
                );
              })}
            </div>

            <div className="mt-2 flex items-center justify-between border-t border-neutral-100 pt-2 text-xs">
              <span className="text-neutral-500">{selected ? format(selected) : "No date selected"}</span>
              {selected && (
                <button
                  type="button"
                  onClick={() => {
                    onChange("");
                    openChange(false);
                  }}
                  className="rounded-md px-2 py-1 font-medium text-[#191e73] hover:bg-[#e3e4f8]"
                >
                  Clear
                </button>
              )}
            </div>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
