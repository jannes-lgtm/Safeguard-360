export default function SeverityBadge({ severity }) {
  const styles = {
    Critical: 'bg-red-100 text-red-700 border border-red-200',
    High: 'bg-amber-100 text-amber-700 border border-amber-200',
    Medium: 'bg-yellow-100 text-yellow-700 border border-yellow-200',
    Low: 'bg-gray-100 text-gray-600 border border-gray-200',
  }

  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold ${styles[severity] || styles.Low}`}>
      {severity}
    </span>
  )
}
