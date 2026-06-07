import Link from 'next/link'

export default function Home() {
  return (
    <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center p-6 text-white">
      <div className="text-center mb-12">
        <div className="text-6xl mb-4">🧱</div>
        <h1 className="text-4xl font-bold mb-2">GigProof</h1>
        <p className="text-gray-400 text-lg">Voice → Blockchain Receipt in 10 seconds</p>
        <div className="flex items-center justify-center gap-2 mt-3">
          <span className="text-xs bg-violet-900/40 text-violet-300 px-3 py-1 rounded-full border border-violet-700/40">Sarvam AI</span>
          <span className="text-xs bg-purple-900/40 text-purple-300 px-3 py-1 rounded-full border border-purple-700/40">Monad</span>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-4 w-full max-w-sm">
        <Link href="/worker" className="bg-violet-600 hover:bg-violet-500 rounded-2xl p-6 text-center transition-all">
          <div className="text-4xl mb-3">🎙️</div>
          <h2 className="text-xl font-semibold">I am a Worker</h2>
          <p className="text-violet-200 text-sm mt-1">Log work by speaking in your language</p>
        </Link>
        <Link href="/employer" className="bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-2xl p-6 text-center transition-all">
          <div className="text-4xl mb-3">🏗️</div>
          <h2 className="text-xl font-semibold">I am an Employer</h2>
          <p className="text-gray-400 text-sm mt-1">Review and pay workers</p>
        </Link>
        <Link href="/profile" className="bg-gray-900 hover:bg-gray-800 border border-gray-700 rounded-2xl p-6 text-center transition-all">
          <div className="text-4xl mb-3">👷</div>
          <h2 className="text-xl font-semibold">Work History</h2>
          <p className="text-gray-500 text-sm mt-1">On-chain reputation</p>
        </Link>
      </div>
    </div>
  )
}