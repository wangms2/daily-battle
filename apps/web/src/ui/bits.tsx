import * as RadixSwitch from '@radix-ui/react-switch';
import clsx from 'clsx';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { TYPE_COLORS, typeAbbr } from '../lib/types';

export function TypeBadge({ type, size = 'md' }: { type: string; size?: 'sm' | 'md' }) {
  const c = TYPE_COLORS[type] ?? { bg: '#888', fg: '#fff' };
  return (
    <span
      className={clsx(
        'type-badge inline-flex items-center justify-center rounded-badge font-bold tracking-wide uppercase',
        size === 'sm' ? 'h-4 px-1 text-[10px] leading-none' : 'h-6 px-2 text-[12px]',
      )}
      style={{ background: c.bg, color: c.fg }}
      title={type}
    >
      {size === 'sm' ? typeAbbr(type) : type}
    </span>
  );
}

export function Button({
  variant = 'primary',
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
}) {
  return (
    <button
      type="button"
      className={clsx(
        'btn',
        variant === 'primary' && 'btn-primary',
        variant === 'secondary' && 'btn-secondary',
        variant === 'ghost' && 'btn-ghost',
        variant === 'danger' && 'btn-danger',
        className,
      )}
      {...props}
    />
  );
}

export function Switch({
  checked,
  onCheckedChange,
  label,
  hint,
  disabled = false,
}: {
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
  label: string;
  hint?: string;
  disabled?: boolean;
}) {
  return (
    <label
      className={clsx(
        'flex min-h-11 items-center justify-between gap-4',
        disabled ? 'cursor-default' : 'cursor-pointer',
      )}
    >
      <span>
        <span className="block text-[15px] font-medium">{label}</span>
        {hint && <span className="block text-[13px] text-muted">{hint}</span>}
      </span>
      <RadixSwitch.Root
        checked={checked}
        onCheckedChange={onCheckedChange}
        disabled={disabled}
        className="relative h-7 w-12 shrink-0 rounded-full bg-line transition-colors data-[state=checked]:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        <RadixSwitch.Thumb className="block size-6 translate-x-0.5 rounded-full bg-white shadow transition-transform data-[state=checked]:translate-x-[22px]" />
      </RadixSwitch.Root>
    </label>
  );
}

export function SectionLabel({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <h2 className="display text-[12px] tracking-wider text-muted uppercase">{children}</h2>
      {right}
    </div>
  );
}
