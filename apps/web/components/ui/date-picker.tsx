"use client";

import { CalendarDays } from "lucide-react";
import { useMemo, useState } from "react";
import { ru } from "react-day-picker/locale";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

const MONTHS = [
  "Январь",
  "Февраль",
  "Март",
  "Апрель",
  "Май",
  "Июнь",
  "Июль",
  "Август",
  "Сентябрь",
  "Октябрь",
  "Ноябрь",
  "Декабрь",
];
const FIRST_YEAR = 1900;

export function DatePicker({
  "aria-describedby": ariaDescribedBy,
  "aria-invalid": ariaInvalid,
  allowFuture = false,
  className,
  fromYear = FIRST_YEAR,
  id,
  maximumValue,
  minimumValue,
  onChange,
  toYear,
  value,
}: {
  "aria-describedby"?: string;
  "aria-invalid"?: boolean;
  allowFuture?: boolean;
  className?: string;
  fromYear?: number;
  id?: string;
  maximumValue?: string;
  minimumValue?: string;
  onChange: (value: string) => void;
  toYear?: number;
  value: string;
}) {
  const selected = useMemo(() => parseDateOnly(value), [value]);
  const now = useMemo(() => new Date(), []);
  const lastYear = toYear ?? now.getFullYear();
  const firstAllowedDate = useMemo(
    () => parseDateOnly(minimumValue ?? "") ?? new Date(fromYear, 0, 1),
    [fromYear, minimumValue],
  );
  const lastAllowedDate = useMemo(() => {
    const configuredMaximum =
      parseDateOnly(maximumValue ?? "") ?? new Date(lastYear, 11, 31);
    return allowFuture
      ? configuredMaximum
      : earlierDate(configuredMaximum, now);
  }, [allowFuture, lastYear, maximumValue, now]);
  const initialMonth = clampDate(selected ?? now, firstAllowedDate, lastAllowedDate);
  const [open, setOpen] = useState(false);
  const [visibleMonth, setVisibleMonth] = useState(initialMonth);
  const years = useMemo(
    () => Array.from({ length: lastYear - fromYear + 1 }, (_, index) => lastYear - index),
    [fromYear, lastYear],
  );

  const setMonth = (month: number) => {
    setVisibleMonth(new Date(visibleMonth.getFullYear(), month, 1));
  };
  const setYear = (year: number) => {
    setVisibleMonth(new Date(year, visibleMonth.getMonth(), 1));
  };

  return (
    <Popover
      open={open}
      onOpenChange={(nextOpen) => {
        if (nextOpen) {
          setVisibleMonth(
            clampDate(selected ?? now, firstAllowedDate, lastAllowedDate),
          );
        }
        setOpen(nextOpen);
      }}
    >
      <PopoverTrigger asChild>
        <Button
          aria-describedby={ariaDescribedBy}
          aria-invalid={ariaInvalid}
          className={cn("date-picker-trigger", !selected && "is-placeholder", className)}
          id={id}
          type="button"
          variant="outline"
        >
          <span>{selected ? formatDate(selected) : "ДД.ММ.ГГГГ"}</span>
          <CalendarDays aria-hidden="true" size={17} />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="date-picker-popover">
        <div className="date-picker-heading">
          <Select value={String(visibleMonth.getMonth())} onValueChange={(next) => setMonth(Number(next))}>
            <SelectTrigger aria-label="Месяц">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MONTHS.map((month, index) => (
                <SelectItem key={month} value={String(index)}>{month}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={String(visibleMonth.getFullYear())} onValueChange={(next) => setYear(Number(next))}>
            <SelectTrigger aria-label="Год">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {years.map((year) => (
                <SelectItem key={year} value={String(year)}>{year}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Calendar
          classNames={{ month_caption: "calendar-caption is-visually-hidden" }}
          disabled={{
            after: lastAllowedDate,
            before: firstAllowedDate,
          }}
          hideNavigation
          locale={ru}
          mode="single"
          month={visibleMonth}
          onMonthChange={setVisibleMonth}
          onSelect={(date) => {
            if (!date) return;
            onChange(toDateOnly(date));
            setOpen(false);
          }}
          selected={selected}
        />
        <div className="date-picker-actions">
          <Button
            disabled={!selected}
            onClick={() => {
              onChange("");
              setOpen(false);
            }}
            size="sm"
            type="button"
            variant="ghost"
          >
            Очистить
          </Button>
          <Button onClick={() => setOpen(false)} size="sm" type="button" variant="secondary">
            Закрыть
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function parseDateOnly(value: string): Date | undefined {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return undefined;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return !Number.isNaN(date.getTime()) &&
    date.getFullYear() === Number(match[1]) &&
    date.getMonth() === Number(match[2]) - 1 &&
    date.getDate() === Number(match[3])
    ? date
    : undefined;
}

function clampDate(date: Date, minimum: Date, maximum: Date): Date {
  if (date < minimum) return minimum;
  if (date > maximum) return maximum;
  return date;
}

function earlierDate(first: Date, second: Date): Date {
  return first < second ? first : second;
}

function toDateOnly(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat("ru-RU").format(date);
}
