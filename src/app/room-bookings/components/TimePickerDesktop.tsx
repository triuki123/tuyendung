'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { ChevronUp, ChevronDown } from 'lucide-react';

interface TimePickerDesktopProps {
  value: string; // Format: "HH:MM"
  onChange: (time: string) => void;
  disabled?: boolean;
  label?: string;
  minTime?: string;
  maxTime?: string;
}

export function TimePickerDesktop({
  value,
  onChange,
  disabled = false,
  label,
  minTime,
  maxTime,
}: TimePickerDesktopProps) {
  // Parse value into initial state - recompute whenever value prop changes
  const initialTime = useMemo(() => {
    if (value && value.includes(':')) {
      const [h, m] = value.split(':');
      return {
        hours: h.padStart(2, '0'),
        minutes: m.padStart(2, '0'),
      };
    }
    return { hours: '08', minutes: '00' };
  }, [value]); // Recompute when value prop changes

  const [hours, setHours] = useState(initialTime.hours);
  const [minutes, setMinutes] = useState(initialTime.minutes);
  const [isFocused, setIsFocused] = useState(false);

  // Sync internal state whenever value prop changes
  useEffect(() => {
    setHours(initialTime.hours);
    setMinutes(initialTime.minutes);
  }, [initialTime]);

  // Notify parent when user changes time via buttons or direct input
  const emitChange = useCallback((newHours: string, newMinutes: string) => {
    const newTime = `${newHours}:${newMinutes}`;
    onChange(newTime);
  }, [onChange]);

  const incrementHours = () => {
    const h = parseInt(hours, 10);
    const newH = h >= 23 ? 0 : h + 1;
    const newHours = String(newH).padStart(2, '0');
    setHours(newHours);
    emitChange(newHours, minutes);
  };

  const decrementHours = () => {
    const h = parseInt(hours, 10);
    const newH = h <= 0 ? 23 : h - 1;
    const newHours = String(newH).padStart(2, '0');
    setHours(newHours);
    emitChange(newHours, minutes);
  };

  const incrementMinutes = () => {
    const m = parseInt(minutes, 10);
    const newM = m >= 59 ? 0 : m + 5; // Increment by 5 minutes
    const newMinutes = String(newM).padStart(2, '0');
    setMinutes(newMinutes);
    emitChange(hours, newMinutes);
  };

  const decrementMinutes = () => {
    const m = parseInt(minutes, 10);
    const newM = m <= 0 ? 55 : m - 5; // Decrement by 5 minutes
    const newMinutes = String(newM).padStart(2, '0');
    setMinutes(newMinutes);
    emitChange(hours, newMinutes);
  };

  const handleHourInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.replace(/\D/g, '').slice(0, 2);
    let newHours = '00';
    if (val === '') {
      newHours = '00';
    } else {
      const h = Math.min(23, parseInt(val, 10));
      newHours = String(h).padStart(2, '0');
    }
    setHours(newHours);
    emitChange(newHours, minutes);
  };

  const handleMinuteInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.replace(/\D/g, '').slice(0, 2);
    let newMinutes = '00';
    if (val === '') {
      newMinutes = '00';
    } else {
      const m = Math.min(59, parseInt(val, 10));
      newMinutes = String(m).padStart(2, '0');
    }
    setMinutes(newMinutes);
    emitChange(hours, newMinutes);
  };

  return (
    <div>
      {label && <label className="block text-2xs font-600 text-muted-foreground mb-1.5 uppercase">{label}</label>}

      <div
        className={`flex items-center gap-2 px-3 py-2.5 rounded-lg border transition-colors ${
          disabled
            ? 'bg-slate-900/30 border-line-subtle cursor-not-allowed'
            : isFocused
              ? 'bg-slate-900/60 border-indigo-500 ring-1 ring-indigo-500/50'
              : 'bg-surface-2 border-line hover:border-line-strong'
        }`}
        onFocus={() => !disabled && setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
      >
        {/* Hours */}
        <div className="flex flex-col items-center gap-0.5">
          <button
            type="button"
            onClick={incrementHours}
            disabled={disabled}
            className="p-0.5 hover:bg-hover-strong rounded transition-colors disabled:opacity-50"
            tabIndex={-1}
          >
            <ChevronUp size={14} className="text-muted-foreground" />
          </button>
          <input
            type="text"
            value={hours}
            onChange={handleHourInput}
            disabled={disabled}
            maxLength={2}
            className="w-8 text-center font-bold text-foreground bg-transparent border-0 p-0 focus:outline-none focus:ring-0"
            placeholder="00"
          />
          <button
            type="button"
            onClick={decrementHours}
            disabled={disabled}
            className="p-0.5 hover:bg-hover-strong rounded transition-colors disabled:opacity-50"
            tabIndex={-1}
          >
            <ChevronDown size={14} className="text-muted-foreground" />
          </button>
        </div>

        {/* Separator */}
        <span className="text-foreground font-bold text-sm">:</span>

        {/* Minutes */}
        <div className="flex flex-col items-center gap-0.5">
          <button
            type="button"
            onClick={incrementMinutes}
            disabled={disabled}
            className="p-0.5 hover:bg-hover-strong rounded transition-colors disabled:opacity-50"
            tabIndex={-1}
          >
            <ChevronUp size={14} className="text-muted-foreground" />
          </button>
          <input
            type="text"
            value={minutes}
            onChange={handleMinuteInput}
            disabled={disabled}
            maxLength={2}
            className="w-8 text-center font-bold text-foreground bg-transparent border-0 p-0 focus:outline-none focus:ring-0"
            placeholder="00"
          />
          <button
            type="button"
            onClick={decrementMinutes}
            disabled={disabled}
            className="p-0.5 hover:bg-hover-strong rounded transition-colors disabled:opacity-50"
            tabIndex={-1}
          >
            <ChevronDown size={14} className="text-muted-foreground" />
          </button>
        </div>
      </div>
    </div>
  );
}
