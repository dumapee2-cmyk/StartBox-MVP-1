import type { InputField as InputFieldType } from '../lib/api';

interface Props {
  field: InputFieldType;
  value: string;
  onChange: (key: string, value: string) => void;
}

export function InputField({ field, value, onChange }: Props) {
  const id = `field-${field.key}`;
  const maxLength = field.max_length ?? 10000;

  return (
    <div className="field">
      <label htmlFor={id} className="field-label">
        {field.label}
        {field.required && <span className="required">*</span>}
      </label>

      {field.type === 'textarea' && (
        <textarea
          id={id}
          value={value}
          onChange={(e) => onChange(field.key, e.target.value)}
          placeholder={field.placeholder}
          maxLength={maxLength}
          rows={4}
          className="field-input field-textarea"
        />
      )}

      {field.type === 'select' && field.options && (
        <select
          id={id}
          value={value}
          onChange={(e) => onChange(field.key, e.target.value)}
          className="field-input field-select"
        >
          <option value="">Select {field.label}</option>
          {field.options.map((opt) => (
            <option key={opt} value={opt}>{opt}</option>
          ))}
        </select>
      )}

      {field.type === 'number' && (
        <input
          id={id}
          type="number"
          value={value}
          onChange={(e) => onChange(field.key, e.target.value)}
          placeholder={field.placeholder}
          className="field-input"
        />
      )}

      {field.type === 'text' && (
        <input
          id={id}
          type="text"
          value={value}
          onChange={(e) => onChange(field.key, e.target.value)}
          placeholder={field.placeholder}
          maxLength={maxLength}
          className="field-input"
        />
      )}
    </div>
  );
}
