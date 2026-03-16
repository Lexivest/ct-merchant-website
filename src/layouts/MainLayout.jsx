import Navbar from "../components/Navbar"
import Footer from "../components/Footer"
import FloatingContact from "../components/FloatingContact"
import AiAssistantWidget from "../components/AiAssistantWidget"

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