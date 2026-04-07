import { useEffect, useState } from "react"
import { FaCircleCheck, FaCircleNotch, FaComments, FaEye, FaReply } from "react-icons/fa6"
import { supabase } from "../../lib/supabase"
import { useGlobalFeedback } from "../../components/common/GlobalFeedbackProvider"
import { getFriendlyErrorMessage } from "../../lib/friendlyErrors"
import {
  SectionHeading,
  StaffPortalShell,
  formatDateTime,
  getCommentStatusBadge,
  getStaffCommentThreads,
} from "./StaffPortalShared"

export default function StaffCommunity() {
  const { notify } = useGlobalFeedback()
  const [commentThreads, setCommentThreads] = useState([])
  const [loadingComments, setLoadingComments] = useState(true)
  const [selectedCommentThread, setSelectedCommentThread] = useState(null)
  const [commentFilter, setCommentFilter] = useState("pending")
  const [moderatingCommentId, setModeratingCommentId] = useState(null)
  const [moderationDrafts, setModerationDrafts] = useState({})

  async function fetchCommentQueue() {
    setLoadingComments(true)
    try {
      const { data: commentRows, error: commentError } = await supabase
        .from("shop_comments")
        .select("id, shop_id, product_id, user_id, parent_id, body, status, moderation_reason, created_at, updated_at")
        .order("created_at", { ascending: false })
        .limit(200)

      if (commentError) throw commentError

      const comments = commentRows || []
      const shopIds = Array.from(new Set(comments.map((item) => item.shop_id).filter(Boolean)))
      const productIds = Array.from(new Set(comments.map((item) => item.product_id).filter(Boolean)))
      const userIds = Array.from(new Set(comments.map((item) => item.user_id).filter(Boolean)))

      const [shopsResult, productsResult, profilesResult] = await Promise.allSettled([
        shopIds.length
          ? supabase.from("shops").select("id, name, unique_id, owner_id").in("id", shopIds)
          : Promise.resolve({ data: [] }),
        productIds.length
          ? supabase.from("products").select("id, name").in("id", productIds)
          : Promise.resolve({ data: [] }),
        userIds.length
          ? supabase.from("profiles").select("id, full_name, avatar_url").in("id", userIds)
          : Promise.resolve({ data: [] }),
      ])

      const shopsMap =
        shopsResult.status === "fulfilled" && !shopsResult.value.error
          ? Object.fromEntries((shopsResult.value.data || []).map((shop) => [String(shop.id), shop]))
          : {}
      const productsMap =
        productsResult.status === "fulfilled" && !productsResult.value.error
          ? Object.fromEntries((productsResult.value.data || []).map((product) => [String(product.id), product]))
          : {}
      const profilesMap =
        profilesResult.status === "fulfilled" && !profilesResult.value.error
          ? Object.fromEntries((profilesResult.value.data || []).map((profile) => [profile.id, profile]))
          : {}

      const enriched = comments.map((comment) => {
        const shop = shopsMap[String(comment.shop_id)] || null
        const product = comment.product_id ? productsMap[String(comment.product_id)] || null : null
        const profile = profilesMap[comment.user_id] || null
        return {
          ...comment,
          shop_name: shop?.name || "Unknown Shop",
          shop_unique_id: shop?.unique_id || "",
          shop_owner_id: shop?.owner_id || null,
          product_name: product?.name || "",
          author_name: profile?.full_name || "CTMerchant User",
          author_avatar_url: profile?.avatar_url || "",
          is_owner_comment: Boolean(shop?.owner_id && shop.owner_id === comment.user_id),
        }
      })

      const nextThreads = getStaffCommentThreads(enriched)
      setCommentThreads(nextThreads)
      setModerationDrafts((prev) => {
        const next = { ...prev }
        nextThreads.forEach((thread) => {
          thread.comments.forEach((comment) => {
            if (next[comment.id] === undefined) next[comment.id] = comment.moderation_reason || ""
          })
        })
        return next
      })
    } catch (err) {
      console.error("Error fetching comment queue:", err)
      notify({
        type: "error",
        title: "Could not load comments",
        message: getFriendlyErrorMessage(err, "Could not load shop comments. Retry."),
      })
    } finally {
      setLoadingComments(false)
    }
  }

  useEffect(() => {
    fetchCommentQueue()
  }, [])

  useEffect(() => {
    const channel = supabase
      .channel("public:shop_comments:staff-community")
      .on("postgres_changes", { event: "*", schema: "public", table: "shop_comments" }, () => {
        fetchCommentQueue()
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [])

  const updateModerationDraft = (commentId, value) => {
    setModerationDrafts((prev) => ({ ...prev, [commentId]: value }))
  }

  const moderateComment = async (comment, nextStatus) => {
    const note = String(moderationDrafts[comment.id] || "").trim()
    if (nextStatus === "rejected" && !note) {
      notify({
        type: "error",
        title: "Reason required",
        message: "Please enter a moderation reason before rejecting this comment.",
      })
      return
    }

    setModeratingCommentId(comment.id)
    try {
      const { error } = await supabase
        .from("shop_comments")
        .update({
          status: nextStatus,
          moderation_reason: nextStatus === "approved" ? null : note || null,
        })
        .eq("id", comment.id)

      if (error) throw error
      await fetchCommentQueue()
      notify({
        type: "success",
        title: "Comment updated",
        message: `Comment marked as ${nextStatus}.`,
      })
    } catch (err) {
      console.error("Error moderating comment:", err)
      notify({
        type: "error",
        title: "Moderation failed",
        message: getFriendlyErrorMessage(err, "Could not update this comment. Retry."),
      })
    } finally {
      setModeratingCommentId(null)
    }
  }

  const filteredCommentThreads = commentThreads.filter((thread) => {
    if (commentFilter === "all") return true
    return thread.comments.some((comment) => comment.status === commentFilter)
  })
  const pendingCommentCount = commentThreads.reduce((sum, thread) => sum + thread.pendingCount, 0)
  const approvedCommentTotal = commentThreads.reduce((sum, thread) => sum + thread.approvedCount, 0)
  const hiddenCommentTotal = commentThreads.reduce((sum, thread) => sum + thread.hiddenCount, 0)
  const rejectedCommentTotal = commentThreads.reduce((sum, thread) => sum + thread.rejectedCount, 0)

  return (
    <StaffPortalShell
      activeKey="community"
      title="Community Moderation"
      description="A dedicated moderation workspace for all shop conversations, replies, and visibility decisions."
    >
      <SectionHeading
        eyebrow="Trust & Safety"
        title="Shop Discussion Queue"
        description="Review public discussion threads, approve valuable comments, and keep the community clean and useful."
        actions={
          <button
            type="button"
            onClick={fetchCommentQueue}
            className="rounded-full bg-white px-4 py-2 text-sm font-bold text-slate-600 shadow-sm transition hover:bg-slate-100"
          >
            Refresh Comments
          </button>
        }
      />

      <div className="mb-8 grid grid-cols-2 gap-4 md:grid-cols-4">
        <div className="rounded-2xl bg-amber-50 p-4"><div className="text-xs font-bold uppercase tracking-wide text-amber-600">Pending</div><div className="mt-2 text-2xl font-black text-slate-900">{pendingCommentCount}</div></div>
        <div className="rounded-2xl bg-green-50 p-4"><div className="text-xs font-bold uppercase tracking-wide text-green-600">Approved</div><div className="mt-2 text-2xl font-black text-slate-900">{approvedCommentTotal}</div></div>
        <div className="rounded-2xl bg-slate-100 p-4"><div className="text-xs font-bold uppercase tracking-wide text-slate-500">Hidden</div><div className="mt-2 text-2xl font-black text-slate-900">{hiddenCommentTotal}</div></div>
        <div className="rounded-2xl bg-rose-50 p-4"><div className="text-xs font-bold uppercase tracking-wide text-rose-600">Rejected</div><div className="mt-2 text-2xl font-black text-slate-900">{rejectedCommentTotal}</div></div>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        {[
          { key: "pending", label: "Pending Review" },
          { key: "approved", label: "Approved" },
          { key: "hidden", label: "Hidden" },
          { key: "rejected", label: "Rejected" },
          { key: "all", label: "All Threads" },
        ].map((option) => (
          <button
            key={option.key}
            type="button"
            onClick={() => setCommentFilter(option.key)}
            className={`rounded-full px-4 py-2 text-xs font-bold transition ${
              commentFilter === option.key ? "bg-slate-900 text-white" : "bg-white text-slate-600 shadow-sm hover:bg-slate-100"
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>

      <div className="rounded-3xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-left text-sm text-slate-600">
            <thead className="border-b border-slate-200 bg-white text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-6 py-4 font-bold">Thread</th>
                <th className="px-6 py-4 font-bold">Shop</th>
                <th className="px-6 py-4 font-bold">Author</th>
                <th className="px-6 py-4 font-bold">Status Mix</th>
                <th className="px-6 py-4 font-bold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loadingComments ? (
                <tr><td colSpan="5" className="px-6 py-8 text-center"><FaCircleNotch className="mx-auto animate-spin text-2xl text-slate-400" /></td></tr>
              ) : filteredCommentThreads.length === 0 ? (
                <tr><td colSpan="5" className="px-6 py-10 text-center font-medium text-slate-500">No comment threads found for this filter.</td></tr>
              ) : (
                filteredCommentThreads.map((thread) => (
                  <tr key={thread.id} className="transition hover:bg-slate-50">
                    <td className="px-6 py-4">
                      <div className="max-w-[360px]">
                        <div className="line-clamp-2 font-semibold text-slate-900">{thread.root.body}</div>
                        <div className="mt-2 flex flex-wrap gap-2 text-xs">
                          <span className="rounded-full bg-slate-100 px-2.5 py-1 font-bold text-slate-600">
                            {thread.root.product_name || "General shop service"}
                          </span>
                          <span className="rounded-full bg-slate-100 px-2.5 py-1 font-bold text-slate-600">
                            {thread.comments.length} comment{thread.comments.length === 1 ? "" : "s"}
                          </span>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="font-bold text-slate-900">{thread.root.shop_name}</div>
                      <div className="mt-1 text-xs font-mono text-slate-500">{thread.root.shop_unique_id || "No ID"}</div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="font-semibold text-slate-900">{thread.root.author_name}</div>
                      <div className="mt-1 text-xs text-slate-500">{formatDateTime(thread.root.created_at)}</div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-wrap gap-2">
                        {thread.pendingCount > 0 ? <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-bold text-amber-800">{thread.pendingCount} pending</span> : null}
                        {thread.approvedCount > 0 ? <span className="rounded-full bg-green-100 px-2.5 py-1 text-xs font-bold text-green-800">{thread.approvedCount} approved</span> : null}
                        {thread.hiddenCount > 0 ? <span className="rounded-full bg-slate-200 px-2.5 py-1 text-xs font-bold text-slate-700">{thread.hiddenCount} hidden</span> : null}
                        {thread.rejectedCount > 0 ? <span className="rounded-full bg-rose-100 px-2.5 py-1 text-xs font-bold text-rose-800">{thread.rejectedCount} rejected</span> : null}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button
                        type="button"
                        onClick={() => setSelectedCommentThread(thread)}
                        className="inline-flex items-center gap-2 rounded-lg bg-[#2E1065] px-4 py-2 text-xs font-bold text-white transition hover:bg-[#4c1d95]"
                      >
                        <FaEye /> Review Thread
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {selectedCommentThread ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4">
          <div className="max-h-[92vh] w-full max-w-5xl overflow-y-auto rounded-3xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
              <div>
                <h3 className="text-lg font-bold text-slate-900">Community Thread Review</h3>
                <p className="text-sm text-slate-500">{selectedCommentThread.root.shop_name} • {selectedCommentThread.comments.length} comment{selectedCommentThread.comments.length === 1 ? "" : "s"}</p>
              </div>
              <button onClick={() => setSelectedCommentThread(null)} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-100">
                Close
              </button>
            </div>

            <div className="grid gap-6 p-6 lg:grid-cols-[1.2fr_0.8fr]">
              <div className="space-y-4">
                {selectedCommentThread.comments.map((comment) => (
                  <div key={comment.id} className={`rounded-3xl border p-5 shadow-sm ${comment.parent_id ? "bg-slate-50 lg:ml-8" : "bg-white"}`}>
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="text-base font-extrabold text-slate-900">{comment.author_name}</div>
                      {comment.is_owner_comment ? <span className="rounded-full bg-pink-100 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-pink-600">Shop Owner</span> : null}
                      <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide ${getCommentStatusBadge(comment.status)}`}>{comment.status}</span>
                      {comment.parent_id ? <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-slate-500"><FaReply /> Reply</span> : null}
                    </div>
                    <div className="mt-1 text-xs font-medium text-slate-400">{formatDateTime(comment.created_at)}</div>
                    <div className="mt-4 whitespace-pre-wrap text-sm leading-7 text-slate-700">{comment.body}</div>

                    <div className="mt-4">
                      <label className="mb-2 block text-xs font-bold uppercase tracking-wide text-slate-500">Moderation Note</label>
                      <textarea
                        value={moderationDrafts[comment.id] || ""}
                        onChange={(event) => updateModerationDraft(comment.id, event.target.value)}
                        placeholder="Optional for approve/hide. Required for reject."
                        className="min-h-[96px] w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm leading-6 text-slate-700 outline-none transition focus:border-pink-300 focus:ring-4 focus:ring-pink-100"
                      />
                    </div>

                    <div className="mt-4 flex flex-wrap gap-2">
                      <button type="button" onClick={() => moderateComment(comment, "approved")} disabled={moderatingCommentId === comment.id} className="inline-flex items-center gap-2 rounded-xl bg-green-600 px-4 py-2 text-xs font-bold text-white transition hover:bg-green-700 disabled:opacity-60">
                        {moderatingCommentId === comment.id ? <FaCircleNotch className="animate-spin" /> : <FaCircleCheck />} Approve
                      </button>
                      <button type="button" onClick={() => moderateComment(comment, "hidden")} disabled={moderatingCommentId === comment.id} className="rounded-xl bg-slate-800 px-4 py-2 text-xs font-bold text-white transition hover:bg-slate-900 disabled:opacity-60">
                        Hide
                      </button>
                      <button type="button" onClick={() => moderateComment(comment, "rejected")} disabled={moderatingCommentId === comment.id} className="rounded-xl bg-rose-600 px-4 py-2 text-xs font-bold text-white transition hover:bg-rose-700 disabled:opacity-60">
                        Reject
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              <div className="space-y-4">
                <div className="rounded-3xl border border-slate-200 bg-slate-50 p-5 shadow-sm">
                  <div className="mb-3 text-sm font-bold text-[#2E1065]">Thread Summary</div>
                  <div className="space-y-3 text-sm text-slate-700">
                    <div><div className="text-xs font-semibold uppercase tracking-wide text-slate-400">Shop</div><div className="mt-1 font-semibold text-slate-900">{selectedCommentThread.root.shop_name}</div></div>
                    <div><div className="text-xs font-semibold uppercase tracking-wide text-slate-400">Shop ID</div><div className="mt-1 font-mono font-semibold text-slate-900">{selectedCommentThread.root.shop_unique_id || "Unassigned"}</div></div>
                    <div><div className="text-xs font-semibold uppercase tracking-wide text-slate-400">Latest Activity</div><div className="mt-1 font-semibold text-slate-900">{formatDateTime(selectedCommentThread.latestAt)}</div></div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </StaffPortalShell>
  )
}

