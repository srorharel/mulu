import BottomNav from './BottomNav.jsx'

export default function PageShell({ children, noNav = false }) {
  return (
    <div className="flex flex-col h-full">
      <main className={`flex-1 overflow-y-auto ${noNav ? '' : 'pb-16'}`}>
        {children}
      </main>
      {!noNav && <BottomNav />}
    </div>
  )
}
