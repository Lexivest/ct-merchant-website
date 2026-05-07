/* eslint-disable react-refresh/only-export-components */
import { Fragment } from "react"

const BRAND_PATTERN = /(CTMerchant|CTMERCHANT|CT Merchant)/g
const BRAND_DETECT_PATTERN = /(CTMerchant|CTMERCHANT|CT Merchant)/
const BRAND_EXACT_PATTERN = /^(CTMerchant|CTMERCHANT|CT Merchant)$/

function BrandText({ className = "" }) {
  return (
    <span className={className}>
      <span className="text-pink-600">C</span>
      <span className="text-[#FFD400]">T</span>
      <span className="text-blue-600">M</span>
      erchant
    </span>
  )
}

export function renderBrandedText(value, brandClassName = "") {
  if (typeof value !== "string" || !BRAND_DETECT_PATTERN.test(value)) {
    return value
  }

  return value.split(BRAND_PATTERN).map((part, index) =>
    BRAND_EXACT_PATTERN.test(part) ? (
      <BrandText key={`${part}-${index}`} className={brandClassName} />
    ) : (
      <Fragment key={`text-${index}`}>{part}</Fragment>
    )
  )
}

export default BrandText
