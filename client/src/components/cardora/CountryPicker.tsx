import { useMemo, useState } from "react";
import { Search, X } from "lucide-react";
import { COUNTRY_OPTIONS, flagForCountry } from "@/lib/cardora";

export function CountryPicker({ selected, onChange }: { selected: string[]; onChange: (codes: string[]) => void }) {
  const [query, setQuery] = useState("");
  const options = useMemo(() => COUNTRY_OPTIONS.filter(country =>
    !query || country.name.toLowerCase().includes(query.toLowerCase()) || country.code.toLowerCase().includes(query.toLowerCase()),
  ).slice(0, 90), [query]);

  function toggle(code: string) {
    onChange(selected.includes(code) ? selected.filter(item => item !== code) : [...selected, code]);
  }

  return (
    <div className="country-picker">
      <div className="selected-countries" aria-live="polite">
        {selected.length ? selected.map(code => {
          const country = COUNTRY_OPTIONS.find(item => item.code === code);
          return (
            <span className="country-chip" key={code}>
              {flagForCountry(code)} {country?.name ?? code}
              <button type="button" aria-label={`Remove ${country?.name ?? code}`} onClick={() => toggle(code)}><X size={12} /></button>
            </span>
          );
        }) : <span className="muted-small">No countries selected yet</span>}
      </div>
      <label className="country-search">
        <Search size={15} aria-hidden="true" />
        <input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search countries" aria-label="Search allowed countries" />
      </label>
      <div className="country-options" role="group" aria-label="Allowed phone country calling codes">
        {options.map(country => (
          <label className={`country-option ${selected.includes(country.code) ? "is-selected" : ""}`} key={country.code}>
            <input type="checkbox" checked={selected.includes(country.code)} onChange={() => toggle(country.code)} />
            <span>{flagForCountry(country.code)}</span>
            <span>{country.name}</span>
            <span className="country-code">{country.code}</span>
          </label>
        ))}
        {!options.length && <p className="muted-small px-3 py-4">No matching countries.</p>}
      </div>
      <p className="field-hint">Eligibility is determined from the contact’s international phone number—not their location.</p>
    </div>
  );
}
