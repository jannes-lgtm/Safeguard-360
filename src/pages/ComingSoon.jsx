export default function ComingSoon() {
  return (
    <div className="min-h-screen bg-[#1E2461] flex flex-col items-center justify-center px-6">
      <div className="flex flex-col items-center gap-6 text-center">

        {/* Logo */}
        <img src="/logo.svg" alt="SafeGuard360" className="w-20 h-20" />

        {/* Brand */}
        <div>
          <h1 className="text-white text-4xl font-bold tracking-tight">SafeGuard360</h1>
          <p className="text-[#a5b4fc] text-sm mt-1 tracking-widest uppercase">Travel Risk & Duty of Care</p>
        </div>

        {/* Divider */}
        <div className="w-12 h-0.5 bg-[#C8D42F] rounded-full" />

        {/* Message */}
        <div>
          <p className="text-white text-2xl font-semibold">Coming Soon</p>
          <p className="text-[#a5b4fc] text-sm mt-2 max-w-xs">
            We're putting the finishing touches on something great. Stay tuned.
          </p>
        </div>

        {/* Contact */}
        <a
          href="mailto:info@risk360.co"
          className="mt-4 text-[#C8D42F] text-sm font-medium hover:underline"
        >
          info@risk360.co
        </a>

      </div>
    </div>
  )
}
