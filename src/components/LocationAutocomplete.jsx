/**
 * src/components/LocationAutocomplete.jsx
 *
 * Drop-in replacement for <input> on city/address fields.
 * Queries /api/geocode-suggest as the user types (debounced 280ms).
 * Compatible with the f() spread pattern: accepts value + onChange(e).
 *
 * Props:
 *   value       string   controlled value
 *   onChange    fn(e)    called with synthetic { target: { value } } on every keystroke
 *   onSelect    fn(item) optional — called with { label, display, city, country } on pick
 *   placeholder string
 *   className   string   applied to the input element
 *   inputStyle  object   inline styles for the input
 *   dark        bool     dark-theme dropdown (for panels on dark maps)
 *   disabled    bool
 */

import { useState, useRef, useEffect, useCallback } from 'react'
import { MapPin, Loader } from 'lucide-react'

export default function LocationAutocomplete({
  value = '',
  onChange,
  onSelect,
  placeholder = 'City or address',
  className = '',
  inputStyle = {},
  dark = false,
  disabled = false,
  required = false,
}) {
  const [suggestions, setSuggestions] = useState([])
  const [loading,     setLoading]     = useState(false)
  const [open,        setOpen]        = useState(false)
  const [active,      setActive]      = useState(-1)
  const debounceRef = useRef(null)
  const inputRef    = useRef(null)
  const listRef     = useRef(null)
  const skipFetch   = useRef(false)  // set true after picking a suggestion

  // Fetch suggestions (debounced)
  const fetchSuggestions = useCallback((q) => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (!q || q.length < 2) { setSuggestions([]); setOpen(false); return }

    debounceRef.current = setTimeout(async () => {
      setLoading(true)
      try {
        const res  = await fetch(`/api/geocode-suggest?q=${encodeURIComponent(q)}&limit=6`)
        const data = await res.json()
        setSuggestions(data.items || [])
        setOpen((data.items || []).length > 0)
        setActive(-1)
      } catch {
        setSuggestions([])
        setOpen(false)
      } finally {
        setLoading(false)
      }
    }, 280)
  }, [])

  // When the controlled value changes externally (e.g. GPS fill), don't re-fetch
  const handleChange = (e) => {
    const v = e.target.value
    onChange?.(e)
    if (skipFetch.current) { skipFetch.current = false; return }
    fetchSuggestions(v)
  }

  // Pick a suggestion
  const pick = (item) => {
    skipFetch.current = true
    setSuggestions([])
    setOpen(false)
    setActive(-1)
    // Fire onChange with a synthetic event so f() pattern works
    onChange?.({ target: { value: item.display || item.label } })
    onSelect?.(item)
  }

  // Keyboard navigation
  const handleKeyDown = (e) => {
    if (!open) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive(a => Math.min(a + 1, suggestions.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive(a => Math.max(a - 1, 0))
    } else if (e.key === 'Enter' && active >= 0) {
      e.preventDefault()
      pick(suggestions[active])
    } else if (e.key === 'Escape') {
      setOpen(false)
    }
  }

  // Close on outside click
  useEffect(() => {
    const handler = (e) => {
      if (!inputRef.current?.contains(e.target) && !listRef.current?.contains(e.target)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // Scroll active item into view
  useEffect(() => {
    if (active >= 0 && listRef.current) {
      const el = listRef.current.children[active]
      el?.scrollIntoView({ block: 'nearest' })
    }
  }, [active])

  const dropBg     = dark ? '#1e293b' : '#ffffff'
  const dropBorder = dark ? 'rgba(255,255,255,0.12)' : '#e5e7eb'
  const itemHover  = dark ? 'rgba(255,255,255,0.08)' : '#f9fafb'
  const itemActive = dark ? 'rgba(170,204,0,0.12)'   : '#eff6ff'
  const textMain   = dark ? '#f1f5f9' : '#111827'
  const textSub    = dark ? '#64748b' : '#6b7280'

  return (
    <div className="relative" style={{ isolation: 'isolate' }}>
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onFocus={() => value.length >= 2 && suggestions.length > 0 && setOpen(true)}
          placeholder={placeholder}
          className={className}
          style={inputStyle}
          disabled={disabled}
          required={required}
          autoComplete="off"
        />
        {loading && (
          <Loader
            size={12}
            className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin"
            style={{ color: dark ? 'rgba(255,255,255,0.3)' : '#9ca3af' }}
          />
        )}
      </div>

      {open && suggestions.length > 0 && (
        <ul
          ref={listRef}
          className="absolute left-0 right-0 mt-1 rounded-[8px] shadow-xl overflow-hidden"
          style={{
            background:  dropBg,
            border:      `1px solid ${dropBorder}`,
            zIndex:      9999,
            maxHeight:   220,
            overflowY:   'auto',
            scrollbarWidth: 'none',
          }}
        >
          {suggestions.map((item, i) => (
            <li
              key={i}
              onMouseDown={(e) => { e.preventDefault(); pick(item) }}
              onMouseEnter={() => setActive(i)}
              className="flex items-start gap-2.5 px-3 py-2.5 cursor-pointer transition-colors"
              style={{
                background: i === active ? itemActive : 'transparent',
              }}
              onMouseLeave={() => setActive(-1)}
            >
              <MapPin
                size={12}
                className="shrink-0 mt-0.5"
                style={{ color: i === active ? '#AACC00' : textSub }}
              />
              <div className="min-w-0">
                <div
                  className="text-xs font-medium truncate"
                  style={{ color: textMain }}
                >
                  {item.display || item.label}
                </div>
                {item.label !== item.display && item.label && (
                  <div
                    className="text-[10px] truncate mt-0.5"
                    style={{ color: textSub }}
                  >
                    {item.label}
                  </div>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
