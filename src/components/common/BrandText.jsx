/* eslint-disable react-refresh/only-export-components */
import { Fragment } from "react"

function BrandText({ className = "" }) {
  return (
    <span className={className}>
      <span className="text-pink-600">C</span>
      <span className="text-purple-900">T</span>
      <span className="text-blue-600">M</span>
      erchant
    </span>
  )
}

export function renderBrandedText(value, brandClassName = "") {
  if (typeof value !== "string" || !value.includes("CTMerchant")) {
    return value
  }

  return value.split(/(CTMerchant)/g).map((part, index) =>
    part === "CTMerchant" ? (
      <BrandText key={`${part}-${index}`} className={brandClassName} />
    ) : (
      <Fragment key={`text-${index}`}>{part}</Fragment>
    )
  )
}

export default BrandText
