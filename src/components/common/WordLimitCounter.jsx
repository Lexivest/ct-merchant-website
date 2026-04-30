import { countWords } from "../../lib/textLimits"

function WordLimitCounter({ value, limit, className = "" }) {
  const count = countWords(value)
  const isNearLimit = count >= Math.floor(limit * 0.9)

  return (
    <span className={`text-[0.72rem] font-bold ${isNearLimit ? "text-pink-600" : "text-slate-400"} ${className}`}>
      {count}/{limit} words
    </span>
  )
}

export default WordLimitCounter
