import { useEffect, useState } from 'react'
import { FileText, Download } from 'lucide-react'
import Layout from '../components/Layout'
import { supabase } from '../lib/supabase'

const categoryColors = {
  'Travel': 'bg-blue-100 text-blue-700 border border-blue-200',
  'Compliance': 'bg-purple-100 text-purple-700 border border-purple-200',
  'Security': 'bg-red-100 text-red-700 border border-red-200',
  'Health & Safety': 'bg-green-100 text-green-700 border border-green-200',
}

function CategoryBadge({ category }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold ${categoryColors[category] || 'bg-gray-100 text-gray-600 border border-gray-200'}`}>
      {category}
    </span>
  )
}

function StatusBadge({ status }) {
  if (status === 'Under Review') {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-amber-100 text-amber-700 border border-amber-200">
        Under Review
      </span>
    )
  }
  if (status === 'Active') {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-green-100 text-green-700 border border-green-200">
        Active
      </span>
    )
  }
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-gray-100 text-gray-600 border border-gray-200">
      {status}
    </span>
  )
}

export default function Policies() {
  const [policies, setPolicies] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase
        .from('policies')
        .select('*')
        .in('status', ['Active', 'Under Review'])
        .order('name')
      setPolicies(data || [])
      setLoading(false)
    }
    load()
  }, [])

  return (
    <Layout>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Policy Library</h1>
        <p className="text-sm text-gray-500 mt-0.5">Duty of care documents and compliance frameworks</p>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1,2,3,4].map(i => (
            <div key={i} className="h-52 bg-white rounded-[8px] animate-pulse" />
          ))}
        </div>
      ) : policies.length === 0 ? (
        <div className="bg-white rounded-[8px] shadow-[0_1px_3px_rgba(0,0,0,0.08)] p-10 text-center">
          <p className="text-gray-500 text-sm">No policies found.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {policies.map(policy => {
            const isUnderReview = policy.status === 'Under Review'
            return (
              <div
                key={policy.id}
                className="bg-white rounded-[8px] shadow-[0_1px_3px_rgba(0,0,0,0.08)] p-5 flex flex-col gap-3"
              >
                {/* Icon + name */}
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-[6px] bg-gray-100 flex items-center justify-center shrink-0">
                    <FileText size={18} className="text-[#1B3A6B]" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900 text-sm leading-snug">{policy.name}</h3>
                    <div className="flex flex-wrap gap-1.5 mt-1.5">
                      <CategoryBadge category={policy.category} />
                      <StatusBadge status={policy.status} />
                    </div>
                  </div>
                </div>

                {/* Description */}
                {policy.description && (
                  <p className="text-xs text-gray-600 leading-relaxed line-clamp-3">{policy.description}</p>
                )}

                {/* Meta */}
                <div className="flex items-center gap-3 text-xs text-gray-500">
                  <span>Version {policy.version}</span>
                  <span>&bull;</span>
                  <span>Updated {policy.last_updated}</span>
                </div>

                {/* Download button */}
                {isUnderReview ? (
                  <button
                    disabled
                    className="mt-auto w-full flex items-center justify-center gap-2 border border-gray-200 rounded-[6px] py-2 text-xs font-medium text-gray-400 bg-gray-50 cursor-not-allowed"
                  >
                    Coming soon
                  </button>
                ) : (
                  <a
                    href={policy.file_url || '#'}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-auto w-full flex items-center justify-center gap-2 bg-[#1B3A6B] hover:bg-[#142d54] text-white rounded-[6px] py-2 text-xs font-medium transition-colors"
                  >
                    <Download size={13} />
                    Download PDF
                  </a>
                )}
              </div>
            )
          })}
        </div>
      )}
    </Layout>
  )
}
