import * as React from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export interface SelectProps
  extends React.SelectHTMLAttributes<HTMLSelectElement> {
  options?: { value: string | number; label: string }[];
}

const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, children, options, ...props }, ref) => {
    return (
      <div className="relative inline-block w-full">
        <select
          className={cn(
            "flex h-9 w-full appearance-none rounded-xl border border-slate-300 dark:border-zinc-800 bg-white dark:bg-zinc-950 px-3 py-1 pr-8 text-xs text-slate-900 dark:text-white shadow-xs transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-indigo-500/50 focus-visible:border-indigo-500 disabled:cursor-not-allowed disabled:opacity-50",
            className
          )}
          ref={ref}
          {...props}
        >
          {options
            ? options.map((opt) => (
                <option key={opt.value} value={opt.value} className="bg-white dark:bg-zinc-950 text-slate-900 dark:text-white">
                  {opt.label}
                </option>
              ))
            : children}
        </select>
        <ChevronDown className="absolute right-2.5 top-2.5 h-4 w-4 pointer-events-none text-slate-400" />
      </div>
    );
  }
);
Select.displayName = "Select";

export { Select };
