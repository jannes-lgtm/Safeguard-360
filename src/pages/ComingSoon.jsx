export default function ComingSoon() {
  return (
    <div className="min-h-screen bg-[#1515B8] flex flex-col items-center justify-center px-6">
      <div className="flex flex-col items-center gap-6 text-center">

        {/* Logo */}
        <img src="/logo-blue.png" alt="SafeGuard360" className="h-14 w-auto rounded-xl" />

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
