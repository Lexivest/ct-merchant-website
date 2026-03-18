import Navbar from "../components/common/Navbar"
import Footer from "../components/common/Footer"
import FloatingContact from "../components/common/FloatingContact"
import AiAssistantWidget from "../components/common/AiAssistantWidget"
import useAuthSession from "../hooks/useAuthSession"

function MainLayout({ children }) {
  const { isOffline } = useAuthSession()

  return (
    <div className="min-h-screen bg-slate-100">
      {isOffline && (
        <div className="sticky top-0 z-[60] border-b border-amber-300 bg-amber-100 px-4 py-2 text-center text-sm text-amber-900">
          You are offline. Some actions may not work until your connection is restored.
        </div>
      )}

      <Navbar />
      <main>{children}</main>
      <Footer />
      <FloatingContact />
      <AiAssistantWidget />
    </div>
  )
}

export default MainLayout