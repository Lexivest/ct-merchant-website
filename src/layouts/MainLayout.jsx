import Navbar from "../components/common/Navbar"
import Footer from "../components/common/Footer"
import AiAssistantWidget from "../components/common/AiAssistantWidget"

function MainLayout({ children }) {
  return (
    <div className="min-h-screen overflow-x-hidden bg-slate-100">
      <Navbar />
      <main className="w-full overflow-x-hidden">{children}</main>
      <Footer />
      <AiAssistantWidget />
    </div>
  )
}

export default MainLayout
