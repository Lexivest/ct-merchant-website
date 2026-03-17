import { useState } from "react"

function AiAssistantWidget() {
  const [isOpen, setIsOpen] = useState(false)
  const [messages, setMessages] = useState([
    {
      role: "assistant",
      content:
        "Hello! 👋 I am the CTMerchant Welcome Ambassador. Would you like to know more about how our platform works, or are you looking to create an account today?",
    },
  ])
  const [input, setInput] = useState("")

  const toggleChat = () => {
    setIsOpen((prev) => !prev)
  }

  const handleSend = () => {
    const trimmed = input.trim()
    if (!trimmed) return

    const userMessage = {
      role: "user",
      content: trimmed,
    }

    const lower = trimmed.toLowerCase()

    let reply =
      "Thanks for your message. Our AI connection will be added next. For now, you can explore CTMerchant, search the repository, or create an account."

    if (lower.includes("create account") || lower.includes("sign up")) {
      reply =
        "To join CTMerchant, use the Create Account button on the homepage. After registration, merchants can proceed with shop setup and verification."
    } else if (
      lower.includes("how it works") ||
      lower.includes("platform works") ||
      lower.includes("what is ctmerchant")
    ) {
      reply =
        "CTMerchant is a digital repository of physical shops, products, and services within a city. Merchants are onboarded and verified so buyers can discover trusted local businesses."
    } else if (
      lower.includes("merchant") ||
      lower.includes("shop") ||
      lower.includes("register")
    ) {
      reply =
        "Merchants create an account, register their shop, complete physical verification, and then receive a unique CTMerchant profile and ID."
    } else if (
      lower.includes("search") ||
      lower.includes("repository") ||
      lower.includes("id")
    ) {
      reply =
        "You can search the repository using a merchant's unique ID. This helps users quickly find verified businesses."
    }

    const assistantMessage = {
      role: "assistant",
      content: reply,
    }

    setMessages((prev) => [...prev, userMessage, assistantMessage])
    setInput("")
  }

  const handleKeyDown = (event) => {
    if (event.key === "Enter") {
      event.preventDefault()
      handleSend()
    }
  }

  return (
    <>
      <div className="fixed bottom-20 right-6 z-40 flex flex-col items-center gap-2">
        <div className="relative">
          <button
            type="button"
            onClick={toggleChat}
            className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-600 text-2xl text-white shadow-[0_10px_25px_rgba(5,150,105,0.35)] transition hover:scale-105 hover:bg-emerald-700"
          >
            💬
          </button>

          {!isOpen && (
            <div className="absolute -right-1 -top-1 flex h-6 w-6 items-center justify-center rounded-full border-2 border-white bg-red-500 text-xs font-extrabold text-white">
              1
            </div>
          )}
        </div>

        <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-extrabold text-emerald-700 shadow-sm">
          AI Assistant
        </span>
      </div>

      <div
        className={`fixed bottom-36 right-6 z-40 flex h-[360px] w-[min(320px,calc(100vw-3rem))] max-w-[calc(100vw-3rem)] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl transition-all duration-300 ${
          isOpen
            ? "pointer-events-auto translate-y-0 opacity-100"
            : "pointer-events-none translate-y-5 opacity-0"
        }`}
      >
        <div className="flex items-center justify-between bg-emerald-600 px-4 py-3 text-white">
          <span className="text-sm font-bold">Assistant</span>

          <button
            type="button"
            onClick={toggleChat}
            className="text-xl text-white/80 transition hover:text-white"
          >
            ×
          </button>
        </div>

        <div className="flex-1 space-y-3 overflow-y-auto bg-slate-50 p-3">
          {messages.map((message, index) => (
            <div
              key={index}
              className={`max-w-[85%] rounded-2xl px-3 py-2.5 text-sm leading-5 ${
                message.role === "assistant"
                  ? "rounded-bl-sm border border-slate-200 bg-white text-slate-800"
                  : "ml-auto rounded-br-sm bg-emerald-600 text-white"
              }`}
            >
              {message.content}
            </div>
          ))}
        </div>

        <div className="border-t border-slate-200 bg-white p-3">
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type a message..."
              className="flex-1 rounded-full border border-slate-300 bg-slate-50 px-4 py-2.5 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-emerald-500 focus:bg-white"
            />

            <button
              type="button"
              onClick={handleSend}
              className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-600 text-white transition hover:bg-emerald-700"
            >
              ➤
            </button>
          </div>
        </div>
      </div>
    </>
  )
}

export default AiAssistantWidget