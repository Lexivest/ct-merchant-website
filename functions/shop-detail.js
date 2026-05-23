import { handleShopOg } from "./_lib/handleShopOg.js"

export async function onRequest(context) {
  return handleShopOg(context)
}
