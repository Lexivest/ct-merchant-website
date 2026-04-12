import { useEffect, useRef, useState } from "react"
import { supabase } from "../../lib/supabase"
import { getFriendlyErrorMessage } from "../../lib/friendlyErrors"

const DAILY_LIMIT = 15

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
      // Ignore storage errors in strict privacy modes
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
      // Ignore storage errors
    }
  }

  const handleSend = async () => {
    const trimmed = input.trim()
    if (!trimmed || isSending) return

    if (usage.count >= DAILY_LIMIT) {
      setMessages((prev) => [
        ...prev,
        {
          role: "error",
          content:
            "You have reached the free daily limit of 15 messages. This limit prevents system abuse. Please check back tomorrow.",
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
        },
      })

      if (error) {
        throw new Error(getFriendlyErrorMessage(error, "Could not reach AI server."))
      }

      const reply =
        data?.reply?.trim() || "No response received from the assistant."

      const isErrorReply =
        reply.startsWith("Error:") || reply.startsWith("System")

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
          content:
            getFriendlyErrorMessage(error, "Could not reach AI server."),
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
        className={`fixed bottom-36 right-6 z-40 flex h-[360px] w-[calc(100%-3rem)] max-w-[320px] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl transition-all duration-300 ${
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

        <div
          ref={scrollContainerRef}
          className="flex-1 space-y-3 overflow-y-auto bg-slate-50 p-3"
        >
          {messages.map((message, index) => (
            <div
              key={index}
              className={`max-w-[85%] rounded-2xl px-3 py-2.5 text-sm leading-5 ${
                message.role === "assistant"
                  ? "rounded-bl-sm border border-slate-200 bg-white text-slate-800"
                  : message.role === "error"
                  ? "mx-auto border border-red-200 bg-red-50 text-center text-red-700"
                  : "ml-auto rounded-br-sm bg-emerald-600 text-white"
              }`}
            >
              {message.content}
            </div>
          ))}

          {isSending ? (
            <div className="max-w-[85%] rounded-2xl rounded-bl-sm border border-slate-200 bg-white px-3 py-2.5 text-sm leading-5 text-slate-500">
              Typing...
            </div>
          ) : null}

          <div ref={messagesEndRef} />
        </div>

        <div className="border-t border-slate-200 bg-white p-3">
          <div className="mb-2 text-[11px] font-semibold text-slate-400">
            {Math.max(0, DAILY_LIMIT - usage.count)} free messages left today
          </div>

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
              disabled={isSending}
              className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-600 text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
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
