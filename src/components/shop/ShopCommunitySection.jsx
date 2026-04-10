import { useCallback, useEffect, useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"
import { FaBoxOpen, FaComments, FaFlag, FaPaperPlane } from "react-icons/fa6"

import { supabase } from "../../lib/supabase"
import StableImage from "../common/StableImage"
import { ShimmerBlock } from "../common/Shimmers"
import { useGlobalFeedback } from "../common/GlobalFeedbackProvider"
import { getFriendlyErrorMessage } from "../../lib/friendlyErrors"

function formatCommentTimestamp(value) {
  if (!value) return "Just now"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "Recently"
  return date.toLocaleString("en-NG", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })
}

function getNameInitials(value) {
  const parts = String(value || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)

  if (!parts.length) return "CT"
  return parts.map((part) => part[0]?.toUpperCase() || "").join("")
}

function buildCommentThreads(comments) {
  const safeComments = Array.isArray(comments) ? comments : []
  const repliesByParent = new Map()

  for (const comment of safeComments) {
    if (!comment?.parent_id) continue
    if (!repliesByParent.has(comment.parent_id)) {
      repliesByParent.set(comment.parent_id, [])
    }
    repliesByParent.get(comment.parent_id).push(comment)
  }

  for (const replyList of repliesByParent.values()) {
    replyList.sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    )
  }

  return safeComments
    .filter((comment) => !comment?.parent_id)
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .map((comment) => ({
      ...comment,
      replies: repliesByParent.get(comment.id) || [],
    }))
}

function CommentAvatar({ author }) {
  if (author.avatarUrl) {
    return (
      <img
        src={author.avatarUrl}
        alt={author.displayName}
        className="h-10 w-10 shrink-0 rounded-full border border-slate-200 object-cover"
      />
    )
  }

  return (
    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-pink-50 text-[0.78rem] font-black text-pink-600">
      {author.initials}
    </div>
  )
}

export default function ShopCommunitySection({
  shopId,
  ownerId,
  shopName,
  products,
  user,
  preselectedProductId,
  onOpenProduct,
}) {
  const navigate = useNavigate()
  const { notify } = useGlobalFeedback()
  const isLoggedIn = Boolean(user?.id)

  const [comments, setComments] = useState([])
  const [commentsLoading, setCommentsLoading] = useState(true)
  const [commentsError, setCommentsError] = useState("")
  const [authorProfiles, setAuthorProfiles] = useState({})
  const [commentProducts, setCommentProducts] = useState({})
  const [commentBody, setCommentBody] = useState("")
  const [selectedProductId, setSelectedProductId] = useState("")
  const [submittingComment, setSubmittingComment] = useState(false)
  const [replyBody, setReplyBody] = useState("")
  const [expandedThreadId, setExpandedThreadId] = useState(null)

  const commentThreads = useMemo(() => buildCommentThreads(comments), [comments])
  const approvedCommentCount = useMemo(
    () => comments.filter((comment) => comment.status === "approved").length,
    [comments]
  )
  const selectedProduct = useMemo(() => {
    if (!selectedProductId) return null
    return (
      commentProducts[String(selectedProductId)] ||
      products.find((item) => String(item.id) === String(selectedProductId)) ||
      null
    )
  }, [commentProducts, products, selectedProductId])

  useEffect(() => {
    if (!preselectedProductId) return
    if (!products.some((product) => String(product.id) === String(preselectedProductId))) return
    setSelectedProductId(String(preselectedProductId))
  }, [preselectedProductId, products])

  const fetchComments = useCallback(async () => {
    if (!shopId) {
      setComments([])
      setCommentsLoading(false)
      return
    }

    try {
      setCommentsLoading(true)
      setCommentsError("")

      const { data: commentRows, error: commentError } = await supabase
        .from("shop_comments")
        .select(
          "id, shop_id, product_id, user_id, parent_id, body, status, moderation_reason, created_at"
        )
        .eq("shop_id", shopId)
        .order("created_at", { ascending: true })

      if (commentError) throw commentError

      const safeComments = commentRows || []
      setComments(safeComments)

      const userIds = [...new Set(safeComments.map((comment) => comment.user_id).filter(Boolean))]
      const productIds = [
        ...new Set(safeComments.map((comment) => comment.product_id).filter(Boolean)),
      ]

      const [profileResult, productResult] = await Promise.allSettled([
        userIds.length > 0
          ? supabase.from("profiles").select("id, full_name, avatar_url").in("id", userIds)
          : Promise.resolve({ data: [] }),
        productIds.length > 0
          ? supabase.from("products").select("id, name, image_url").in("id", productIds)
          : Promise.resolve({ data: [] }),
      ])

      if (profileResult.status === "fulfilled" && !profileResult.value.error) {
        setAuthorProfiles(
          Object.fromEntries((profileResult.value.data || []).map((profile) => [profile.id, profile]))
        )
      } else {
        setAuthorProfiles({})
      }

      if (productResult.status === "fulfilled" && !productResult.value.error) {
        setCommentProducts(
          Object.fromEntries(
            (productResult.value.data || []).map((product) => [String(product.id), product])
          )
        )
      } else {
        setCommentProducts({})
      }
    } catch (err) {
      console.error("Error fetching community comments:", err)
      setCommentsError("Could not load the community discussion right now.")
    } finally {
      setCommentsLoading(false)
    }
  }, [shopId])

  useEffect(() => {
    fetchComments()
  }, [fetchComments])

  useEffect(() => {
    if (!shopId) return undefined

    let debounceTimer
    const channel = supabase
      .channel(`public:shop_comments:shop_id=eq.${shopId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "shop_comments", filter: `shop_id=eq.${shopId}` },
        () => {
          window.clearTimeout(debounceTimer)
          debounceTimer = window.setTimeout(() => {
            fetchComments()
          }, 1500)
        }
      )
      .subscribe()

    return () => {
      window.clearTimeout(debounceTimer)
      supabase.removeChannel(channel)
    }
  }, [fetchComments, shopId])

  const getCommentAuthor = useCallback(
    (comment) => {
      const profile = authorProfiles[comment.user_id]
      const displayName =
        profile?.full_name ||
        (comment.user_id === ownerId ? shopName || "Shop Owner" : "CTMerchant User")

      return {
        displayName,
        avatarUrl: profile?.avatar_url || "",
        initials: getNameInitials(displayName),
        isOwner: comment.user_id === ownerId,
      }
    },
    [authorProfiles, ownerId, shopName]
  )

  const openProductDetail = useCallback(
    async (productId) => {
      if (!productId) return

      if (typeof onOpenProduct === "function") {
        onOpenProduct(productId)
        return
      }

      try {
        const { data: productRow, error: productError } = await supabase
          .from("products")
          .select("id")
          .eq("id", Number(productId))
          .maybeSingle()

        if (productError) throw productError
        if (!productRow?.id) throw new Error("missing")

        navigate(`/product-detail?id=${productRow.id}`)
      } catch {
        notify({
          type: "info",
          title: "Product no longer exists",
          message: "This tagged product is no longer available.",
        })
      }
    },
    [navigate, notify, onOpenProduct]
  )

  const openAbuseReport = useCallback(
    (comment) => {
      if (!isLoggedIn) {
        notify({
          type: "info",
          title: "Login required",
          message: "Please sign in before reporting abusive content.",
        })
        return
      }

      const excerpt = encodeURIComponent(String(comment.body || "").slice(0, 120))
      navigate(
        `/user-dashboard?tab=services&view=report-abuse&shop_id=${encodeURIComponent(
          shopId
        )}&comment_id=${encodeURIComponent(comment.id)}&context=shop_comment&excerpt=${excerpt}`
      )
    },
    [isLoggedIn, navigate, notify, shopId]
  )

  const submitComment = useCallback(
    async ({ body, parentId = null, productId = "" }) => {
      if (!isLoggedIn) {
        notify({
          type: "info",
          title: "Login required",
          message: "Please sign in to join the shop discussion.",
        })
        return
      }

      const trimmedBody = String(body || "").trim()
      if (trimmedBody.length < 3) {
        notify({
          type: "error",
          title: "Comment too short",
          message: "Please write at least a short sentence before posting.",
        })
        return
      }

      if (trimmedBody.length > 500) {
        notify({
          type: "error",
          title: "Comment too long",
          message: "Please keep your comment within 500 characters.",
        })
        return
      }

      try {
        setSubmittingComment(true)

        const { error: insertError } = await supabase.from("shop_comments").insert({
          shop_id: Number(shopId),
          product_id: productId ? Number(productId) : null,
          user_id: user.id,
          parent_id: parentId,
          body: trimmedBody,
          status: "pending",
        })

        if (insertError) throw insertError

        if (parentId) {
          setReplyBody("")
          setExpandedThreadId(null)
        } else {
          setCommentBody("")
          if (!preselectedProductId) {
            setSelectedProductId("")
          }
        }

        notify({
          type: "success",
          title: "Comment submitted",
          message: "Your comment is now awaiting moderation review.",
        })

        await fetchComments()
      } catch (err) {
        console.error("Error submitting comment:", err)
        notify({
          type: "error",
          title: "Could not submit comment",
          message: getFriendlyErrorMessage(err, "Please try again in a moment."),
        })
      } finally {
        setSubmittingComment(false)
      }
    },
    [fetchComments, isLoggedIn, notify, preselectedProductId, shopId, user?.id]
  )

  return (
    <section className="mb-2 border-y border-slate-300 bg-white px-4 py-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3">
        <div>
          <h2 className="flex items-center gap-2 text-[1.12rem] font-extrabold text-[#0F1111]">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-pink-100 text-pink-600">
              <FaComments />
            </span>
            Shop Community
          </h2>
          <p className="mt-1 text-[0.84rem] text-slate-500">
            Feedback, product questions, and owner replies live here.
          </p>
        </div>
        <div className="text-[0.82rem] font-semibold text-slate-500">
          <span className="font-extrabold text-[#2E1065]">{approvedCommentCount}</span> approved threads
        </div>
      </div>

      <div className="mb-5 rounded-[20px] border border-slate-200 bg-[#FCFCFD] p-4">
        {!isLoggedIn ? (
          <div className="rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-[0.86rem] font-semibold text-blue-900">
            Sign in to post, comment, or report abuse in this shop community.
          </div>
        ) : (
          <>
            <div className="mb-3 block">
              <span className="mb-1.5 block text-[0.72rem] font-extrabold uppercase tracking-[0.12em] text-slate-500">
                Product Reference
              </span>
              
              <div className="flex gap-3 overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                <button
                  type="button"
                  onClick={() => setSelectedProductId("")}
                  className={`flex w-[132px] shrink-0 flex-col gap-2 rounded-[16px] border p-2.5 text-left transition ${
                    !selectedProductId
                      ? "border-blue-500 bg-blue-50"
                      : "border-slate-300 bg-white hover:border-slate-400 hover:bg-slate-50"
                  }`}
                >
                  <div className={`flex h-[84px] w-full items-center justify-center rounded-xl ${!selectedProductId ? "bg-blue-500 text-white" : "bg-slate-200 text-slate-400"}`}>
                    <FaBoxOpen className="text-[1.2rem]" />
                  </div>
                  <div className={`line-clamp-2 text-[0.75rem] font-extrabold leading-[1.2] ${!selectedProductId ? "text-blue-700" : "text-[#0F1111]"}`}>
                    General shop topic
                  </div>
                </button>

                {products.map((product) => {
                  const isActive = String(product.id) === String(selectedProductId)
                  return (
                    <button
                      key={product.id}
                      type="button"
                      onClick={() => setSelectedProductId(String(product.id))}
                      className={`flex w-[132px] shrink-0 flex-col gap-2 rounded-[16px] border p-2.5 text-left transition ${
                        isActive
                          ? "border-blue-500 bg-blue-50"
                          : "border-slate-300 bg-white hover:border-slate-400 hover:bg-slate-50"
                      }`}
                    >
                      {product.image_url ? (
                        <div className="h-[84px] w-full overflow-hidden rounded-xl bg-white">
                          <StableImage
                            src={product.image_url}
                            alt={product.name}
                            containerClassName="h-full w-full bg-white"
                            className="h-full w-full object-cover"
                          />
                        </div>
                      ) : (
                        <div className={`flex h-[84px] w-full items-center justify-center rounded-xl ${isActive ? "bg-blue-200 text-blue-600" : "bg-slate-200 text-slate-400"}`}>
                          <FaBoxOpen className="text-[1.2rem]" />
                        </div>
                      )}
                      <div className={`line-clamp-2 text-[0.75rem] font-extrabold leading-[1.2] ${isActive ? "text-blue-700" : "text-[#0F1111]"}`}>
                        {product.name}
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>

            {selectedProduct ? (
              <button
                type="button"
                onClick={() => openProductDetail(selectedProductId)}
                className="mb-3 flex items-center gap-3 rounded-[18px] border border-blue-200 bg-blue-50 px-3 py-3 text-left"
              >
                {selectedProduct.image_url ? (
                  <StableImage
                    src={selectedProduct.image_url}
                    alt={selectedProduct.name || "Selected product"}
                    containerClassName="h-[68px] w-[68px] shrink-0 overflow-hidden rounded-xl bg-white"
                    className="h-full w-full object-contain"
                  />
                ) : (
                  <div className="flex h-[68px] w-[68px] shrink-0 items-center justify-center rounded-xl border border-blue-100 bg-blue-100 text-blue-400">
                    <FaBoxOpen className="text-[1.5rem]" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="text-[0.68rem] font-black uppercase tracking-[0.12em] text-blue-600">
                    Attached Product
                  </div>
                  <div className="truncate text-[0.88rem] font-bold text-[#0F1111]">
                    {selectedProduct.name || "Open product"}
                  </div>
                </div>
              </button>
            ) : null}

            <textarea
              value={commentBody}
              onChange={(event) => setCommentBody(event.target.value)}
              placeholder="Share a shop experience, ask a question, or start a product discussion..."
              className="min-h-[112px] w-full rounded-[18px] border border-slate-200 bg-white px-4 py-3 text-[0.92rem] leading-6 text-[#0F1111] outline-none transition focus:border-pink-300 focus:ring-4 focus:ring-pink-100"
              maxLength={500}
            />
            <div className="mt-3 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div className="text-[0.78rem] font-medium text-slate-500">
                {commentBody.trim().length}/500 - Public after approval
              </div>
              <button
                type="button"
                onClick={() => submitComment({ body: commentBody, productId: selectedProductId })}
                disabled={submittingComment}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-pink-600 px-4 py-2.5 text-[0.84rem] font-extrabold text-white transition hover:bg-pink-700 disabled:cursor-not-allowed disabled:bg-pink-300"
              >
                <FaPaperPlane className="text-[0.78rem]" />
                {submittingComment ? "Submitting..." : "Post"}
              </button>
            </div>
          </>
        )}
      </div>

      {commentsLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((item) => (
            <div key={item} className="rounded-[18px] border border-slate-200 bg-white px-4 py-4">
              <div className="mb-3 flex items-center gap-3">
                <ShimmerBlock className="h-10 w-10 rounded-full" />
                <div className="flex-1">
                  <ShimmerBlock className="mb-2 h-3.5 w-32 rounded" />
                  <ShimmerBlock className="h-3 w-20 rounded" />
                </div>
              </div>
              <ShimmerBlock className="mb-2 h-3.5 w-full rounded" />
              <ShimmerBlock className="h-3.5 w-3/4 rounded" />
            </div>
          ))}
        </div>
      ) : commentsError ? (
        <div className="rounded-[22px] border border-red-200 bg-red-50 px-5 py-5 text-[0.92rem] font-semibold text-red-700">
          {commentsError}
        </div>
      ) : commentThreads.length === 0 ? (
        <div className="rounded-[24px] border border-dashed border-slate-300 bg-slate-50 px-5 py-10 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-white text-[1.4rem] text-pink-500 shadow-sm">
            <FaComments />
          </div>
          <div className="text-[1.05rem] font-extrabold text-[#0F1111]">No community comments yet</div>
          <div className="mt-2 text-[0.9rem] text-slate-500">
            Start the first conversation about this shop&apos;s service, delivery, or products.
          </div>
        </div>
      ) : (
        <div className="space-y-5">
          {commentThreads.map((comment) => {
            const author = getCommentAuthor(comment)
            const product = comment.product_id
              ? commentProducts[String(comment.product_id)] ||
                products.find((item) => String(item.id) === String(comment.product_id))
              : null

            return (
              <div key={comment.id} className="rounded-[20px] border border-slate-200 bg-white">
                <div className="flex items-start gap-3 px-4 py-4">
                  <CommentAvatar author={author} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <div className="text-[0.84rem] font-extrabold text-[#0F1111]">{author.displayName}</div>
                      {author.isOwner ? (
                        <span className="rounded-full bg-[#FCE7F3] px-2 py-0.5 text-[0.62rem] font-extrabold uppercase tracking-[0.12em] text-pink-600">
                          Shop Owner
                        </span>
                      ) : null}
                      {comment.status !== "approved" ? (
                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[0.62rem] font-extrabold uppercase tracking-[0.12em] text-amber-700">
                          {comment.status === "pending" ? "Awaiting Review" : comment.status}
                        </span>
                      ) : null}
                    </div>

                    <div className="mt-0.5 text-[0.71rem] font-semibold text-slate-400">
                      {formatCommentTimestamp(comment.created_at)}
                    </div>

                    {product ? (
                      <button
                        type="button"
                        onClick={() => openProductDetail(comment.product_id)}
                        className="mt-3 flex w-full max-w-[400px] items-center gap-3 rounded-[16px] bg-[#F8FAFC] p-2.5 text-left transition hover:bg-slate-100"
                      >
                        {product.image_url ? (
                          <div className="h-[72px] w-[72px] shrink-0 overflow-hidden rounded-[14px] bg-white">
                            <StableImage
                              src={product.image_url}
                              alt={product.name}
                              containerClassName="h-full w-full bg-white"
                              className="h-full w-full object-cover"
                            />
                          </div>
                        ) : (
                          <div className="flex h-[72px] w-[72px] shrink-0 items-center justify-center rounded-[14px] bg-slate-200 text-slate-400">
                            <FaBoxOpen className="text-2xl" />
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="text-[0.68rem] font-extrabold uppercase tracking-widest text-slate-500">
                            Ref Product
                          </div>
                          <div className="mt-0.5 line-clamp-2 text-[0.88rem] font-bold leading-snug text-[#0F1111]">
                            {product.name}
                          </div>
                        </div>
                      </button>
                    ) : null}

                    <div className="mt-2 whitespace-pre-wrap text-[0.88rem] leading-6 text-slate-700">
                      {comment.body}
                    </div>

                    {comment.moderation_reason ? (
                      <div className="mt-2 rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-[0.76rem] font-medium text-amber-700">
                        Moderation note: {comment.moderation_reason}
                      </div>
                    ) : null}

                    {expandedThreadId === comment.id && comment.replies.length > 0 ? (
                      <div className="mt-3 space-y-3 border-l border-slate-200 pl-4">
                        {comment.replies.map((reply) => {
                          const replyAuthor = getCommentAuthor(reply)
                          return (
                            <div key={reply.id}>
                              <div className="flex items-start gap-3">
                                <CommentAvatar author={replyAuthor} />
                                <div className="min-w-0 flex-1">
                                  <div className="text-[0.82rem] font-extrabold text-[#0F1111]">
                                    {replyAuthor.displayName}
                                  </div>
                                  <div className="mt-0.5 text-[0.71rem] font-semibold text-slate-400">
                                    {formatCommentTimestamp(reply.created_at)}
                                  </div>
                                  <div className="mt-1.5 whitespace-pre-wrap text-[0.84rem] leading-6 text-slate-700">
                                    {reply.body}
                                  </div>
                                </div>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    ) : null}

                    <div className="mt-3 border-t border-slate-100 pt-3">
                      <div className="flex flex-wrap items-center gap-4 text-[0.76rem] font-bold">
                        <button
                          type="button"
                          onClick={() =>
                            setExpandedThreadId((current) => (current === comment.id ? null : comment.id))
                          }
                          className="text-slate-600 transition hover:text-pink-600"
                        >
                          {comment.replies.length} comment{comment.replies.length === 1 ? "" : "s"}
                        </button>
                        <button
                          type="button"
                          onClick={() => openAbuseReport(comment)}
                          className="inline-flex items-center gap-1.5 text-slate-500 transition hover:text-red-600"
                        >
                          <FaFlag className="text-[0.68rem]" />
                          Report Abuse
                        </button>
                      </div>

                      {expandedThreadId === comment.id ? (
                        <div className="mt-3 rounded-2xl border border-pink-100 bg-[#FCFCFD] p-3">
                          <textarea
                            value={replyBody}
                            onChange={(event) => setReplyBody(event.target.value)}
                            placeholder="Write a comment under this thread..."
                            className="min-h-[88px] w-full rounded-[16px] border border-slate-200 bg-white px-3 py-3 text-[0.88rem] leading-6 text-[#0F1111] outline-none transition focus:border-pink-300 focus:ring-4 focus:ring-pink-100"
                            maxLength={500}
                          />
                          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                            <div className="text-[0.75rem] font-medium text-slate-500">
                              {replyBody.trim().length}/500
                            </div>
                            <button
                              type="button"
                              onClick={() =>
                                submitComment({
                                  body: replyBody,
                                  parentId: comment.id,
                                  productId: comment.product_id ? String(comment.product_id) : "",
                                })
                              }
                              disabled={submittingComment}
                              className="inline-flex items-center gap-2 rounded-xl bg-pink-600 px-4 py-2 text-[0.8rem] font-extrabold text-white transition hover:bg-pink-700 disabled:cursor-not-allowed disabled:bg-pink-300"
                            >
                              <FaPaperPlane className="text-[0.72rem]" />
                              {submittingComment ? "Submitting..." : "Comment"}
                            </button>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}