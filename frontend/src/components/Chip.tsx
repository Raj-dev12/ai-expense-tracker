import type { ReactNode } from "react";

/**
 * One editable field of the parser's interpretation.
 *
 * Shown as a chip rather than a form row on purpose: the point of this screen is
 * that these are the machine's guesses, presented compactly enough to scan in a
 * second, and every one of them can be corrected before anything is saved.
 */
export function Chip({
  label,
  children,
  wide = false,
}: {
  label: string;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <label
      className={[
        "flex flex-col gap-1 rounded-xl bg-white px-4 py-3",
        "ring-1 ring-slate-200 transition",
        "focus-within:ring-2 focus-within:ring-accent",
        wide ? "sm:col-span-2" : "",
      ].join(" ")}
    >
      <span className="text-xs font-medium text-slate-500">{label}</span>
      {children}
    </label>
  );
}

export const fieldClass =
  "w-full bg-transparent text-slate-900 outline-none placeholder:text-slate-300";
