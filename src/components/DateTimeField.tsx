"use client";

// Shared native date/time inputs used wherever a date or time is picked.
// Tapping anywhere on the field opens the browser's picker (showPicker — not
// just the tiny calendar/clock glyph), and [color-scheme:dark] keeps the
// native chrome + popup matched to the app's dark theme.

type FieldProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, "type">;

function PickerInput({
  type,
  className = "",
  onClick,
  ...rest
}: FieldProps & { type: "date" | "time" }) {
  return (
    <input
      type={type}
      onClick={(e) => {
        try {
          e.currentTarget.showPicker?.();
        } catch {
          // Unsupported / not a user gesture — the native input still works.
        }
        onClick?.(e);
      }}
      className={`cursor-pointer [color-scheme:dark] ${className}`}
      {...rest}
    />
  );
}

export function DateInput(props: FieldProps) {
  return <PickerInput type="date" {...props} />;
}

export function TimeInput(props: FieldProps) {
  return <PickerInput type="time" {...props} />;
}
