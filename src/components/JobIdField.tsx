type JobIdFieldProps = {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
};

export function JobIdField({ value, onChange, disabled }: JobIdFieldProps) {
  return (
    <div className="mb-4">
      <label htmlFor="job-id" className="mb-1 block text-sm font-medium">
        Job / lot ID (optional)
      </label>
      <input
        id="job-id"
        type="text"
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="w-full border border-foreground px-3 py-2 text-base focus:outline focus:outline-2 focus:outline-offset-2 focus:outline-foreground disabled:opacity-50"
        autoComplete="off"
      />
    </div>
  );
}