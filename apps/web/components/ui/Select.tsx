import type { SelectHTMLAttributes } from "react";

// ---------------------------------------------------------------------------
// Select — styled native select with label and error
// ---------------------------------------------------------------------------

export interface SelectOption {
  value: string;
  label: string;
}

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  hint?: string;
  required?: boolean;
  id: string;
  options: SelectOption[];
  placeholder?: string;
  containerClassName?: string;
}

export function Select({
  label,
  error,
  hint,
  required,
  id,
  options,
  placeholder,
  className = "",
  containerClassName = "",
  ...rest
}: SelectProps) {
  const selectClass = [
    "p7-select",
    error ? "p7-select-error" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={`p7-field ${containerClassName}`}>
      {label && (
        <label
          htmlFor={id}
          className={`p7-label ${required ? "p7-label-required" : ""}`}
        >
          {label}
        </label>
      )}
      <select id={id} className={selectClass} required={required} {...rest}>
        {placeholder && (
          <option value="">{placeholder}</option>
        )}
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      {error && <span className="p7-field-error" role="alert">{error}</span>}
      {hint && !error && <span className="p7-field-hint">{hint}</span>}
    </div>
  );
}
