import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold transition-colors focus:outline-hidden focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default:
          "border border-slate-200 dark:border-zinc-800 bg-slate-100 dark:bg-zinc-900 text-slate-800 dark:text-zinc-200",
        secondary:
          "border border-slate-700 bg-slate-800 text-slate-300",
        destructive:
          "border border-rose-500/30 bg-rose-500/15 text-rose-300",
        outline:
          "border border-slate-700 text-slate-400",
        success:
          "border border-emerald-500/30 bg-emerald-500/15 text-emerald-300",
        warning:
          "border border-amber-500/30 bg-amber-500/15 text-amber-300",
        purple:
          "border border-purple-500/30 bg-purple-500/15 text-purple-300",
        premium:
          "border border-purple-500/40 bg-gradient-to-r from-purple-500/20 to-indigo-500/20 text-purple-200 shadow-xs",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
