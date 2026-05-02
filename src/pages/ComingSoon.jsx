export default function ComingSoon() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6" style={{ background: '#0118A1' }}>
      <div className="flex flex-col items-center gap-6 text-center">

        {/* Logo - transparent blends with background */}
        <img src="/logo-transparent.png" alt="SafeGuard360" className="h-28 w-auto" />

        {/* Divider */}
        <div className="w-12 h-0.5 bg-[#AACC00] rounded-full" />

        {/* Message */}
        <div>
          <p className="text-white text-2xl font-semibold">Coming Soon</p>
          <p className="text-blue-200 text-sm mt-2 max-w-xs">
            We're putting the finishing touches on something great. Stay tuned.
          </p>
        </div>

        {/* Contact */}
        <a
          href="mailto:info@risk360.co"
          className="mt-4 text-[#AACC00] text-sm font-medium hover:underline"
        >
          info@risk360.co
        </a>

      </div>
    </div>
  )
}
