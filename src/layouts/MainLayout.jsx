import Navbar from "../components/common/Navbar"
import Footer from "../components/common/Footer"
import FloatingContact from "../components/common/FloatingContact"
import AiAssistantWidget from "../components/common/AiAssistantWidget"

function MainLayout({ children }) {
  return (
    <div className="min-h-screen bg-slate-100">
      <Navbar />
      <main>{children}</main>
      <Footer />
      <FloatingContact />
      <AiAssistantWidget />
    </div>
  )
}

export default MainLayout