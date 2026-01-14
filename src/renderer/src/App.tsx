function App(): JSX.Element {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 flex items-center justify-center">
      <div className="text-center space-y-6 p-8">
        <h1 className="text-5xl font-bold text-white tracking-tight">
          Welcome to <span className="text-blue-400">Readly</span>
        </h1>
        <p className="text-xl text-slate-300 max-w-md">
          An Electron app powered by React and Tailwind CSS v4
        </p>
        <div className="flex gap-4 justify-center pt-4">
          <button className="px-6 py-3 bg-blue-500 hover:bg-blue-600 text-white font-medium rounded-lg transition-colors duration-200">
            Get Started
          </button>
          <button className="px-6 py-3 bg-slate-700 hover:bg-slate-600 text-white font-medium rounded-lg transition-colors duration-200 border border-slate-600">
            Learn More
          </button>
        </div>
        <div className="pt-8 text-sm text-slate-400">
          <p>Electron + React 19 + Tailwind CSS v4</p>
        </div>
      </div>
    </div>
  )
}

export default App
