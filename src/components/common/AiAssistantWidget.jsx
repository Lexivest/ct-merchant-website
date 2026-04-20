import { useEffect, useRef, useState } from "react"
import { FaRobot, FaRotateLeft } from "react-icons/fa6"
import { supabase } from "../../lib/supabase"
import { getFriendlyErrorMessage } from "../../lib/friendlyErrors"
import useAuthSession from "../../hooks/useAuthSession"

const DAILY_LIMIT = 15

function AiAssistantWidget({ mode = "ambassador", shopData = null, productData = null, isRepoSearch = false }) {
  const [isOpen, setIsOpen] = useState(false)
  const { profile } = useAuthSession()
  const firstName = profile?.full_name?.split(" ")[0] || ""

  // Define initial messages based on mode
  const getInitialMessage = () => {
    const greeting = firstName ? `Hello ${firstName}! 👋` : "Hello! 👋"

    if (isRepoSearch && !profile) {
      return `${greeting} I'm CT-AI. 🛍️ Please <a href="/" style="color:#db2777; font-weight:bold; text-decoration:underline;">login to your account</a> to use the AI Shopping Assistant for similar products, price comparison, and more.`
    }

    if (productData) {
      return `${greeting} I'm CT-AI, your Shopping Assistant for *${productData.name}*. 📦 I can help you find similar products and compare their prices. How can I assist you?`
    }
    if (mode === "shopping" && shopData) {
      return `${greeting} I'm CT-AI, your Shopping Assistant for ${shopData.name}. 🛍️ I can help you find similar shops in this category, locate shops in your area, or tell you more about this shop. How can I help?`
    }
    return `${greeting} I am CT-AI, the CTMerchant System Ambassador. We are a digital collection of shops and their locations in a city to enhance discovery and mitigate fake online sales claims. How can I assist you today?`
  }

  const getSuggestions = () => {
    if (isRepoSearch && !profile) {
      return [
        "Login to my account"
      ]
    }

    if (productData) {
      return [
        "Find similar products and compare prices"
      ]
    }
    if (mode === "shopping") {
      return [
        "Similar shops in this category?",
        "Shops in your area?",
        "Tell me about this shop"
      ]
    }
    return [
      "Who we are?",
      "How to use the platform?",
      "Our services?"
    ]
  }

  const [messages, setMessages] = useState([
    {
      role: "assistant",
      content: getInitialMessage(),
    },
  ])

  const [input, setInput] = useState("")
  const [isSending, setIsSending] = useState(false)

  const messagesEndRef = useRef(null)
  const scrollContainerRef = useRef(null)

  const usage = (() => {
    const today = new Date().toISOString().split("T")[0]
    let parsed = { date: today, count: 0 }

    try {
      if (typeof window !== "undefined" && window.localStorage) {
        const raw = window.localStorage.getItem("ctm_ai_anon_usage")
        if (raw) {
          const stored = JSON.parse(raw)
          if (stored.date === today) parsed = stored
        }
        if (parsed.count === 0) {
          window.localStorage.setItem("ctm_ai_anon_usage", JSON.stringify(parsed))
        }
      }
    } catch {
      // Ignore
    }

    return parsed
  })()

  useEffect(() => {
    if (!isOpen) return

    const timer = setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "end",
      })
    }, 50)

    return () => clearTimeout(timer)
  }, [messages, isSending, isOpen])

  const toggleChat = () => {
    setIsOpen((prev) => !prev)
  }

  const resetChat = () => {
    setMessages([
      {
        role: "assistant",
        content: getInitialMessage(),
      },
    ])
    setInput("")
    setIsSending(false)
  }

  const saveUsage = (nextCount) => {
    const today = new Date().toISOString().split("T")[0]
    try {
      if (typeof window !== "undefined" && window.localStorage) {
        window.localStorage.setItem(
          "ctm_ai_anon_usage",
          JSON.stringify({
            date: today,
            count: nextCount,
          })
        )
      }
    } catch {
      // Ignore
    }
  }

  const handleSend = async (textOverride = null) => {
    const trimmed = (textOverride || input).trim()
    if (!trimmed || isSending) return

    if (usage.count >= DAILY_LIMIT) {
      setMessages((prev) => [
        ...prev,
        {
          role: "error",
          content: "You have reached the free daily limit. Please check back tomorrow.",
        },
      ])
      setInput("")
      return
    }

    const userMessage = {
      role: "user",
      content: trimmed,
    }

    const nextMessages = [...messages, userMessage]
    setMessages(nextMessages)
    setInput("")
    setIsSending(true)

    try {
      const history = nextMessages
        .filter((item) => item.role === "user" || item.role === "assistant")
        .slice(-6)
        .map((item) => ({
          role: item.role,
          content: item.content,
        }))

      const { data, error } = await supabase.functions.invoke("ai-assistant", {
        body: {
          query: trimmed,
          history,
          mode,
          context: {
            page: productData ? "product_detail" : (shopData ? "shop_detail" : "home"),
            product: productData,
            shop: shopData,
            profile: profile ? {
              city_id: profile.city_id,
              area_id: profile.area_id,
              city_name: profile.cities?.name,
              area_name: profile.areas?.name
            } : null
          }
        },
      })

      if (error) {
        throw new Error(getFriendlyErrorMessage(error, "Could not reach AI server."))
      }

      const reply = data?.reply?.trim() || "No response received."
      const isErrorReply = reply.startsWith("Error:") || reply.startsWith("System")

      setMessages((prev) => [
        ...prev,
        {
          role: isErrorReply ? "error" : "assistant",
          content: reply,
        },
      ])

      if (!isErrorReply) {
        saveUsage(usage.count + 1)
      }
    } catch (error) {
      setMessages((prev) => [
        ...prev,
        {
          role: "error",
          content: getFriendlyErrorMessage(error, "Could not reach AI server."),
        },
      ])
    } finally {
      setIsSending(false)
    }
  }

  const handleKeyDown = (event) => {
    if (event.key === "Enter") {
      event.preventDefault()
      handleSend()
    }
  }

  return (
    <>
      <div className="fixed bottom-20 right-6 z-40 flex flex-col items-center gap-1.5">
        <div className="relative">
          <button
            type="button"
            onClick={toggleChat}
            className="flex h-11 w-11 items-center justify-center rounded-full bg-pink-600 text-white shadow-lg transition hover:scale-105 hover:bg-pink-700"
          >
            <FaRobot className="text-xl" />
          </button>

          {!isOpen && (
            <div className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full border-2 border-white bg-slate-900 text-[8px] font-black text-white">
              1
            </div>
          )}
        </div>

        <span className="text-[9px] font-black uppercase tracking-widest text-pink-600">
          ask CT-AI
        </span>
      </div>

      <div
        className={`fixed bottom-36 right-6 z-40 flex h-[420px] w-[calc(100%-3rem)] max-w-[340px] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl transition-all duration-300 ${
          isOpen
            ? "pointer-events-auto translate-y-0 opacity-100"
            : "pointer-events-none translate-y-5 opacity-0"
        }`}
      >
        <div className="flex items-center justify-between bg-pink-600 px-4 py-3 text-white">
          <div className="flex flex-col">
            <span className="text-[9px] font-black uppercase tracking-tighter">
              CT-AI Shopping Assistant
            </span>
            {(shopData || productData) && (
              <span className="text-[10px] font-bold opacity-80 line-clamp-1">
                {productData?.name || shopData?.name}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            {messages.length > 1 && (
              <button
                type="button"
                onClick={resetChat}
                title="Clear Chat"
                className="flex h-7 w-7 items-center justify-center rounded-full bg-white/20 text-xs text-white/90 transition hover:bg-white/30 hover:text-white"
              >
                <FaRotateLeft />
              </button>
            )}

            <button
              type="button"
              onClick={toggleChat}
              className="flex h-7 w-7 items-center justify-center rounded-full text-xl text-white/80 transition hover:bg-white/10 hover:text-white"
            >
              ×
            </button>
          </div>
        </div>

        <div
          ref={scrollContainerRef}
          className="flex-1 space-y-3 overflow-y-auto bg-slate-50 p-3"
        >
          {messages.map((message, index) => (
            <div
              key={index}
              className={`max-w-[90%] rounded-2xl px-3 py-2.5 text-sm leading-5 ${
                message.role === "assistant"
                  ? "rounded-bl-sm border border-slate-200 bg-white text-slate-800"
                  : message.role === "error"
                  ? "mx-auto border border-red-200 bg-red-50 text-center text-red-700"
                  : "ml-auto rounded-br-sm bg-pink-600 text-white shadow-sm"
              }`}
            >
              {message.role === "assistant" ? (
                <div dangerouslySetInnerHTML={{ __html: message.content }} />
              ) : (
                message.content
              )}
            </div>
          ))}

          {isSending ? (
            <div className="max-w-[85%] rounded-2xl rounded-bl-sm border border-slate-200 bg-white px-3 py-2.5 text-sm leading-5 text-slate-500 italic">
              AI is thinking...
            </div>
          ) : null}

          <div ref={messagesEndRef} />
        </div>

        <div className="border-t border-slate-200 bg-white p-3">
          {(messages.length <= 3 || input.trim() === "") && (
            <div className="mb-3 flex flex-wrap gap-1.5">
              {getSuggestions().map((suggestion) => (
                <button
                  key={suggestion}
                  onClick={() => handleSend(suggestion)}
                  className="rounded-full border border-pink-100 bg-pink-50 px-2.5 py-1 text-[10px] font-bold text-pink-600 transition hover:bg-pink-100"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          )}

          <div className="flex items-center gap-2">
            <input
              type="text"
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask anything..."
              className="flex-1 rounded-full border border-slate-300 bg-slate-50 px-4 py-2.5 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-pink-500 focus:bg-white"
            />

            <button
              type="button"
              onClick={() => handleSend()}
              disabled={isSending}
              className="flex h-10 w-10 items-center justify-center rounded-full bg-pink-600 text-white transition hover:bg-pink-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              ➤
            </button>
          </div>
          <div className="mt-2 text-center text-[9px] font-bold text-slate-400">
            {Math.max(0, DAILY_LIMIT - usage.count)} / {DAILY_LIMIT} free queries left today
          </div>
        </div>
      </div>
    </>
  )
}

export default AiAssistantWidget
