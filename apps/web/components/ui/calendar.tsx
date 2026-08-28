"use client";

import { ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import * as React from "react";
import { DayPicker, getDefaultClassNames } from "react-day-picker";

import { cn } from "@/lib/utils";

export function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  ...props
}: React.ComponentProps<typeof DayPicker>) {
  const defaults = getDefaultClassNames();

  return (
    <DayPicker
      className={cn("calendar", className)}
      classNames={{
        root: cn("calendar-root", defaults.root),
        months: cn("calendar-months", defaults.months),
        month: cn("calendar-month", defaults.month),
        nav: cn("calendar-nav", defaults.nav),
        button_previous: cn("calendar-nav-button is-previous", defaults.button_previous),
        button_next: cn("calendar-nav-button is-next", defaults.button_next),
        month_caption: cn("calendar-caption", defaults.month_caption),
        caption_label: cn("calendar-caption-label", defaults.caption_label),
        dropdowns: cn("calendar-dropdowns", defaults.dropdowns),
        dropdown_root: cn("calendar-dropdown-root", defaults.dropdown_root),
        dropdown: cn("calendar-dropdown", defaults.dropdown),
        month_grid: cn("calendar-grid", defaults.month_grid),
        weekdays: cn("calendar-weekdays", defaults.weekdays),
        weekday: cn("calendar-weekday", defaults.weekday),
        week: cn("calendar-week", defaults.week),
        day: cn("calendar-day", defaults.day),
        day_button: cn("calendar-day-button", defaults.day_button),
        selected: cn("is-selected", defaults.selected),
        today: cn("is-today", defaults.today),
        outside: cn("is-outside", defaults.outside),
        disabled: cn("is-disabled", defaults.disabled),
        hidden: cn("is-hidden", defaults.hidden),
        ...classNames,
      }}
      components={{
        Chevron: ({ className: iconClassName, orientation, ...iconProps }) => {
          if (orientation === "left") {
            return <ChevronLeft className={iconClassName} size={16} {...iconProps} />;
          }
          if (orientation === "right") {
            return <ChevronRight className={iconClassName} size={16} {...iconProps} />;
          }
          return <ChevronDown className={iconClassName} size={16} {...iconProps} />;
        },
      }}
      showOutsideDays={showOutsideDays}
      {...props}
    />
  );
}
