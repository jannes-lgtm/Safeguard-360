import { useState, useRef } from 'react'
import { supabase } from '../lib/supabase'

const BRAND_BLUE = '#0118A1'
const BRAND_GREEN = '#AACC00'

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result.split(',')[1])
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

function fileToText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = reject
    reader.readAsText(file)
  })
}

function RiskBadge({ level }) {
  const colours = {
    Critical: 'bg-red-100 text-red-700',
    High: 'bg-amber-100 text-amber-700',
    Medium: 'bg-yellow-50 text-yellow-700',
  }
  return (
    <span className={`text-xs font-semibold px-2 py-0.5 rounded ${colours[level] || colours.Medium}`}>
      {level || 'Medium'}
    </span>
  )
}

export default function ItineraryUpload({ onClose, onSaved, userId, session }) {
  const [mode, setMode] = useState('upload')
  const [file, setFile] = useState(null)
  const [dragOver, setDragOver] = useState(false)
  const [pasteText, setPasteText] = useState('')
  const [parsing, setParsing] = useState(false)
  const [parseError, setParseError] = useState('')
  const [parsedTrips, setParsedTrips] = useState(null)
  const [saving, setSaving] = useState(false)
  const [savedCount, setSavedCount] = useState(0)
  const [success, setSuccess] = useState(false)
  const fileInputRef = useRef(null)

  const handleFile = (f) => {
    if (!f) return
    const allowed = ['application/pdf', 'text/plain']
    if (!allowed.includes(f.type) && !f.name.endsWith('.txt') && !f.name.endsWith('.pdf')) {
      setParseError('Only PDF or plain text (.pdf, .txt) files are supported.')
      return
    }
    if (f.size > 4 * 1024 * 1024) {
      setParseError('File must be under 4 MB.')
      return
    }
    setParseError('')
    setFile(f)
  }

  const handleDrop = (e) => {
    e.preventDefault()
    setDragOver(false)
    const dropped = e.dataTransfer.files[0]
    if (dropped) handleFile(dropped)
  }

  const updateTrip = (idx, field, value) => {
    setParsedTrips(prev => {
      const next = [...prev]
      next[idx] = { ...next[idx], [field]: value }
      return next
    })
  }

  const removeTrip = (idx) => {
    setParsedTrips(prev => prev.filter((_, i) => i !== idx))
  }

  const callParseApi = async () => {
    setParseError('')
    setParsing(true)

    let content, type
    try {
      if (mode === 'paste') {
        content = pasteText
        type = 'text'
      } else {
        if (file.type === 'application/pdf' || file.name.endsWith('.pdf')) {
          content = await fileToBase64(file)
          type = 'pdf'
        } else {
          content = await fileToText(file)
          type = 'text'
        }
      }

      const res = await fetch('/api/parse-itinerary', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({ content, type, filename: file?.name }),
      })
      const data = await res.json()
      if (data.error) {
        setParseError(data.error)
        setParsing(false)
        return
      }
      setParsedTrips(data.trips)
    } catch (e) {
      console.error('Parse error:', e)
      setParseError('Something went wrong. Please try again.')
    }
    setParsing(false)
  }

  const handleSave = async () => {
    if (!parsedTrips || parsedTrips.length === 0) return
    setSaving(true)

    let count = 0
    for (const trip of parsedTrips) {
      const { error } = await supabase.from('itineraries').insert({
        user_id: userId,
        trip_name: trip.trip_name,
        flight_number: trip.flight_number || null,
        departure_city: trip.departure_city || null,
        arrival_city: trip.arrival_city,
        depart_date: trip.depart_date,
        return_date: trip.return_date || trip.depart_date,
        hotel_name: trip.hotel_name || null,
        meetings: trip.meetings || null,
        risk_level: trip.risk_level || 'Medium',
        status: trip.status || 'Upcoming',
      })
      if (!error) count++
    }

    // Fire-and-forget: trigger AI intel scan for all new trips
    if (count > 0 && session?.access_token) {
      fetch('/api/trip-alert-scan?force=true', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      }).catch(() => {/* non-critical */})
    }

    setSavedCount(count)
    setSaving(false)
    setSuccess(true)
    setTimeout(() => {
      onSaved()
    }, 1500)
  }

  const startOver = () => {
    setFile(null)
    setPasteText('')
    setParsedTrips(null)
    setParseError('')
    setSuccess(false)
    setSavedCount(0)
  }

  const canParse = mode === 'paste' ? pasteText.trim().length > 0 : !!file

  const inputClass = 'w-full border border-gray-300 rounded-[6px] px-3 py-1.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#0118A1] focus:border-transparent'
  const labelClass = 'block text-xs font-medium text-gray-600 mb-0.5'

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-[8px] shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6">

        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Upload Itinerary</h2>
            <p className="text-sm text-gray-500 mt-0.5">AI will extract your trips automatically</p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-xl font-light leading-none"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {/* Success state */}
        {success && (
          <div className="text-center py-10">
            <div className="text-4xl mb-3">✅</div>
            <p className="text-lg font-semibold text-gray-900">
              {savedCount} trip{savedCount !== 1 ? 's' : ''} added to your itinerary
            </p>
            <p className="text-sm text-gray-500 mt-1">Closing...</p>
          </div>
        )}

        {/* Parsing spinner */}
        {!success && parsing && (
          <div className="flex flex-col items-center justify-center py-16 gap-4">
            <div className="w-10 h-10 border-4 border-[#0118A1] border-t-transparent rounded-full animate-spin" />
            <p className="text-sm text-gray-600 font-medium">Reading your itinerary...</p>
          </div>
        )}

        {/* Review step */}
        {!success && !parsing && parsedTrips !== null && (
          <div>
            <p className="text-sm font-semibold text-gray-700 mb-3">
              {parsedTrips.length} trip{parsedTrips.length !== 1 ? 's' : ''} found — review and edit before saving
            </p>

            {parsedTrips.length === 0 && (
              <p className="text-sm text-gray-500 py-4">No trips could be extracted. Try pasting the text instead.</p>
            )}

            <div className="space-y-4 mb-5">
              {parsedTrips.map((trip, idx) => (
                <div key={idx} className="border border-gray-200 rounded-[8px] p-4 bg-gray-50">
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-gray-900">{trip.arrival_city}</span>
                      <RiskBadge level={trip.risk_level} />
                      {trip.traveler_name && (
                        <span className="text-xs text-gray-500">· {trip.traveler_name}</span>
                      )}
                    </div>
                    <button
                      onClick={() => removeTrip(idx)}
                      className="text-xs text-gray-400 hover:text-red-500 shrink-0 transition-colors"
                    >
                      ✕ Remove
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="sm:col-span-2">
                      <label className={labelClass}>Trip name</label>
                      <input
                        className={inputClass}
                        value={trip.trip_name || ''}
                        onChange={e => updateTrip(idx, 'trip_name', e.target.value)}
                      />
                    </div>
                    <div>
                      <label className={labelClass}>Flight number</label>
                      <input
                        className={inputClass}
                        value={trip.flight_number || ''}
                        onChange={e => updateTrip(idx, 'flight_number', e.target.value)}
                        placeholder="e.g. BA123"
                      />
                    </div>
                    <div>
                      <label className={labelClass}>Arrival city</label>
                      <input
                        className={inputClass}
                        value={trip.arrival_city || ''}
                        onChange={e => updateTrip(idx, 'arrival_city', e.target.value)}
                      />
                    </div>
                    <div>
                      <label className={labelClass}>Departure date</label>
                      <input
                        type="date"
                        className={inputClass}
                        value={trip.depart_date || ''}
                        onChange={e => updateTrip(idx, 'depart_date', e.target.value)}
                      />
                    </div>
                    <div>
                      <label className={labelClass}>Return date</label>
                      <input
                        type="date"
                        className={inputClass}
                        value={trip.return_date || ''}
                        onChange={e => updateTrip(idx, 'return_date', e.target.value)}
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label className={labelClass}>Hotel</label>
                      <input
                        className={inputClass}
                        value={trip.hotel_name || ''}
                        onChange={e => updateTrip(idx, 'hotel_name', e.target.value)}
                        placeholder="Hotel name"
                      />
                    </div>
                    {trip.meetings && (
                      <div className="sm:col-span-2">
                        <label className={labelClass}>Meetings / notes</label>
                        <p className="text-xs text-gray-600 bg-white border border-gray-200 rounded-[6px] px-3 py-2">
                          {trip.meetings}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div className="flex items-center gap-4">
              <button
                onClick={handleSave}
                disabled={saving || parsedTrips.length === 0}
                style={{ backgroundColor: BRAND_BLUE }}
                className="flex items-center gap-2 text-white text-sm font-semibold px-5 py-2.5 rounded-[6px] transition-colors disabled:opacity-60 hover:opacity-90"
              >
                {saving ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Saving...
                  </>
                ) : (
                  `Confirm & Save ${parsedTrips.length} Trip${parsedTrips.length !== 1 ? 's' : ''}`
                )}
              </button>
              <button
                onClick={startOver}
                className="text-sm text-gray-500 hover:text-gray-700 underline"
              >
                Start over
              </button>
            </div>
          </div>
        )}

        {/* Input step */}
        {!success && !parsing && parsedTrips === null && (
          <div>
            {/* Mode toggle */}
            <div className="flex gap-2 mb-5">
              <button
                onClick={() => { setMode('upload'); setParseError('') }}
                className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-[6px] text-sm font-semibold border-2 transition-colors ${
                  mode === 'upload'
                    ? 'border-[#0118A1] bg-[#0118A1]/5 text-[#0118A1]'
                    : 'border-gray-200 text-gray-500 hover:border-gray-300'
                }`}
              >
                📎 Upload File
              </button>
              <button
                onClick={() => { setMode('paste'); setParseError('') }}
                className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-[6px] text-sm font-semibold border-2 transition-colors ${
                  mode === 'paste'
                    ? 'border-[#0118A1] bg-[#0118A1]/5 text-[#0118A1]'
                    : 'border-gray-200 text-gray-500 hover:border-gray-300'
                }`}
              >
                📋 Paste Text
              </button>
            </div>

            {/* Upload mode */}
            {mode === 'upload' && (
              <div>
                <div
                  onDragOver={e => { e.preventDefault(); setDragOver(true) }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                  className={`border-2 border-dashed rounded-[8px] p-10 text-center cursor-pointer transition-colors ${
                    dragOver ? 'border-[#0118A1] bg-[#0118A1]/5' : 'border-gray-300 hover:border-gray-400'
                  }`}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf,.txt,text/plain,application/pdf"
                    className="hidden"
                    onChange={e => handleFile(e.target.files[0])}
                  />
                  {file ? (
                    <div>
                      <p className="text-2xl mb-2">{file.name.endsWith('.pdf') ? '📄' : '📝'}</p>
                      <p className="text-sm font-semibold text-gray-900">{file.name}</p>
                      <p className="text-xs text-gray-500 mt-1">{(file.size / 1024).toFixed(0)} KB — click to change</p>
                    </div>
                  ) : (
                    <div>
                      <p className="text-3xl mb-3">📂</p>
                      <p className="text-sm font-semibold text-gray-700">Drop your file here or click to browse</p>
                      <p className="text-xs text-gray-400 mt-1">PDF or plain text (.pdf, .txt) · max 4 MB</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Paste mode */}
            {mode === 'paste' && (
              <div>
                <textarea
                  rows={8}
                  className="w-full border border-gray-300 rounded-[8px] px-4 py-3 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#0118A1] focus:border-transparent resize-none"
                  placeholder="Paste your itinerary here — email confirmations, travel agent documents, booking confirmations..."
                  value={pasteText}
                  onChange={e => setPasteText(e.target.value)}
                />
              </div>
            )}

            {/* Error */}
            {parseError && (
              <div className="mt-3 px-4 py-2.5 bg-red-50 border border-red-200 text-red-700 text-sm rounded-[6px]">
                {parseError}
              </div>
            )}

            {/* Parse button */}
            <div className="mt-4">
              <button
                onClick={callParseApi}
                disabled={!canParse}
                style={canParse ? { backgroundColor: BRAND_BLUE } : {}}
                className="w-full flex items-center justify-center gap-2 text-white text-sm font-semibold px-5 py-3 rounded-[6px] transition-colors disabled:opacity-40 disabled:bg-gray-300 disabled:text-gray-500 hover:opacity-90"
              >
                Parse Itinerary
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
