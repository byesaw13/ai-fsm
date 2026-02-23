import type { InputHTMLAttributes, ReactNode } from "react";

// ---------------------------------------------------------------------------
// Input — text input with label, error, and required indicator
// ---------------------------------------------------------------------------

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
  required?: boolean;
  id: string;
  containerClassName?: string;
  rightSlot?: ReactNode;
}

export function Input({
  label,
  error,
  hint,
  required,
  id,
  className = "",
  containerClassName = "",
  rightSlot,
  ...rest
}: InputProps) {
  const inputClass = [
    "p7-input",
    error ? "p7-input-error" : "",
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
      <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
        <input id={id} className={inputClass} required={required} {...rest} />
        {rightSlot && (
          <div style={{ position: "absolute", right: "var(--space-3)" }}>
            {rightSlot}
          </div>
        )}
      </div>
      {error && <span className="p7-field-error" role="alert">{error}</span>}
      {hint && !error && <span className="p7-field-hint">{hint}</span>}
    </div>
  );
}
