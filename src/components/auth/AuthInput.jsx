function AuthInput({
  label,
  id,
  name,
  type = "text",
  value,
  onChange,
  placeholder,
  error,
  icon,
  disabled = false,
  required = false,
  rightElement = null,
  maxLength,
  minLength,
  autoComplete,
}) {
  return (
    <div className="flex flex-col gap-2">
      {label ? (
        <label
          htmlFor={id}
          className="text-sm font-bold text-slate-800"
        >
          {label}
          {required ? <span className="ml-1 text-pink-600">*</span> : null}
        </label>
      ) : null}

      <div className="relative">
        {icon ? (
          <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
            {icon}
          </span>
        ) : null}

        <input
          id={id}
          name={name}
          type={type}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          disabled={disabled}
          required={required}
          maxLength={maxLength}
          minLength={minLength}
          autoComplete={autoComplete}
          className={[
            "w-full rounded-2xl border bg-white px-4 py-3 text-sm text-slate-900 outline-none transition",
            icon ? "pl-12" : "",
            rightElement ? "pr-12" : "",
            disabled
              ? "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400"
              : error
              ? "border-red-300 focus:border-red-400 focus:ring-4 focus:ring-red-100"
              : "border-slate-300 focus:border-pink-500 focus:ring-4 focus:ring-pink-100",
          ].join(" ")}
        />

        {rightElement ? (
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
            {rightElement}
          </div>
        ) : null}
      </div>

      {error ? (
        <p className="text-xs font-semibold text-red-600">{error}</p>
      ) : null}
    </div>
  )
}

export default AuthInput