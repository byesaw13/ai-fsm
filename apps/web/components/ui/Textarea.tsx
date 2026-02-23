import type { TextareaHTMLAttributes } from "react";

// ---------------------------------------------------------------------------
// Textarea — resizable textarea with label and error
// ---------------------------------------------------------------------------

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  hint?: string;
  required?: boolean;
  id: string;
  containerClassName?: string;
}

export function Textarea({
  label,
  error,
  hint,
  required,
  id,
  className = "",
  containerClassName = "",
  rows = 4,
  ...rest
}: TextareaProps) {
  const textareaClass = [
    "p7-textarea",
    error ? "p7-textarea-error" : "",
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
      <textarea id={id} className={textareaClass} required={required} rows={rows} {...rest} />
      {error && <span className="p7-field-error" role="alert">{error}</span>}
      {hint && !error && <span className="p7-field-hint">{hint}</span>}
    </div>
  );
}
