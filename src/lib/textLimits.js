export function countWords(value) {
  const text = String(value || "").trim()
  if (!text) return 0
  return text.split(/\s+/).length
}

export function clampWords(value, maxWords) {
  const text = String(value || "")
  if (!maxWords || countWords(text) <= maxWords) return text
  return text.trim().split(/\s+/).slice(0, maxWords).join(" ")
}

export function isOverWordLimit(value, maxWords) {
  return countWords(value) > maxWords
}

export function getWordLimitError(label, value, maxWords) {
  if (!isOverWordLimit(value, maxWords)) return ""
  return `${label} must be ${maxWords} words or less.`
}
