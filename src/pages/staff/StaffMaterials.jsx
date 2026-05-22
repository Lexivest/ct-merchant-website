import { useCallback, useEffect, useRef, useState } from "react"
import {
  FaArrowUpFromBracket,
  FaCircleNotch,
  FaCopy,
  FaCheck,
  FaFile,
  FaFileLines,
  FaFilePdf,
  FaFileWord,
  FaRotateRight,
  FaShieldHalved,
  FaTrash,
  FaUpload,
} from "react-icons/fa6"
import { useGlobalFeedback } from "../../components/common/GlobalFeedbackProvider"
import { supabase } from "../../lib/supabase"
import { SectionHeading, StaffPortalShell, formatDateTime, useStaffPortalSession } from "./StaffPortalShared"

const BUCKET = "brand-assets"

// Only show root-level files (not the logos/ folder or its contents)
function isRootFile(item) {
  return item.id !== null && !item.name.includes("/")
}

function formatFileSize(bytes) {
  if (!bytes || bytes === 0) return "—"
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function fileIcon(name) {
  const ext = String(name || "").split(".").pop().toLowerCase()
  if (ext === "pdf") return <FaFilePdf className="text-red-500" />
  if (ext === "docx" || ext === "doc") return <FaFileWord className="text-blue-600" />
  if (ext === "txt") return <FaFileLines className="text-slate-500" />
  return <FaFile className="text-slate-400" />
}

function prettyName(name) {
  return String(name || "").replace(/[-_]/g, " ").replace(/\.\w+$/, "")
}

export default function StaffMaterials() {
  const { isSuperAdmin } = useStaffPortalSession()
  const { confirm, notify } = useGlobalFeedback()

  const [files, setFiles] = useState([])
  const [loadingFiles, setLoadingFiles] = useState(true)
  const [fetchError, setFetchError] = useState(null)

  // Upload state
  const fileInputRef = useRef(null)
  const [pendingFile, setPendingFile] = useState(null)   // the File object
  const [customName, setCustomName] = useState("")        // optional rename
  const [uploading, setUploading] = useState(false)
  const [dragOver, setDragOver] = useState(false)

  // Copy feedback — key = file name
  const [copiedKey, setCopiedKey] = useState(null)

  // ── Helpers ──────────────────────────────────────────────────────────────

  const getPublicUrl = useCallback((name) => {
    const { data } = supabase.storage.from(BUCKET).getPublicUrl(name)
    return data?.publicUrl || ""
  }, [])

  async function handleCopy(text, key) {
    try {
      await navigator.clipboard.writeText(text)
      setCopiedKey(key)
      setTimeout(() => setCopiedKey(null), 2000)
    } catch {
      notify({ type: "error", title: "Copy failed", message: "Please copy the URL manually." })
    }
  }

  // ── Fetch ─────────────────────────────────────────────────────────────────

  const fetchFiles = useCallback(async () => {
    setLoadingFiles(true)
    setFetchError(null)
    try {
      const { data, error } = await supabase.storage.from(BUCKET).list("", {
        limit: 200,
        sortBy: { column: "created_at", order: "desc" },
      })
      if (error) throw error
      setFiles((data || []).filter(isRootFile))
    } catch (err) {
      setFetchError(err.message || "Could not load files.")
    } finally {
      setLoadingFiles(false)
    }
  }, [])

  useEffect(() => {
    fetchFiles()
  }, [fetchFiles])

  // ── File selection ────────────────────────────────────────────────────────

  function onFileSelected(file) {
    if (!file) return
    setPendingFile(file)
    // Pre-fill custom name with the original filename (user can edit it)
    setCustomName(file.name)
  }

  function onInputChange(e) {
    onFileSelected(e.target.files?.[0] || null)
    // Reset input so the same file can be re-selected if needed
    e.target.value = ""
  }

  function onDrop(e) {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files?.[0]
    if (file) onFileSelected(file)
  }

  // ── Upload ────────────────────────────────────────────────────────────────

  async function handleUpload() {
    if (!pendingFile || uploading) return

    const storageName = (customName.trim() || pendingFile.name).replace(/\s+/g, "_")

    const isUpdate = files.some((f) => f.name === storageName)
    if (isUpdate) {
      const confirmed = await confirm({
        title: "Replace existing file?",
        message: `A file named "${storageName}" already exists. Uploading will replace it — all existing download links will automatically serve the new version.`,
        confirmLabel: "Yes, replace",
        cancelLabel: "Cancel",
      })
      if (!confirmed) return
    }

    setUploading(true)
    try {
      const { error } = await supabase.storage
        .from(BUCKET)
        .upload(storageName, pendingFile, {
          upsert: true,
          cacheControl: "31536000",
          contentType: pendingFile.type || "application/octet-stream",
        })

      if (error) throw error

      notify({
        type: "success",
        title: isUpdate ? "File replaced" : "File uploaded",
        message: isUpdate
          ? `"${storageName}" has been replaced. All download links now serve the new version.`
          : `"${storageName}" is now available for download.`,
      })

      setPendingFile(null)
      setCustomName("")
      await fetchFiles()
    } catch (err) {
      notify({
        type: "error",
        title: "Upload failed",
        message: err.message || "Could not upload the file. Please try again.",
      })
    } finally {
      setUploading(false)
    }
  }

  // ── Delete ────────────────────────────────────────────────────────────────

  async function handleDelete(name) {
    const confirmed = await confirm({
      title: "Delete file?",
      message: `"${name}" will be permanently deleted. Any download links pointing to it will stop working.`,
      confirmLabel: "Delete",
      cancelLabel: "Cancel",
    })
    if (!confirmed) return

    try {
      const { error } = await supabase.storage.from(BUCKET).remove([name])
      if (error) throw error

      notify({ type: "success", title: "File deleted", message: `"${name}" has been removed.` })
      setFiles((prev) => prev.filter((f) => f.name !== name))
    } catch (err) {
      notify({
        type: "error",
        title: "Delete failed",
        message: err.message || "Could not delete the file. Please try again.",
      })
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <StaffPortalShell
      title="Materials Manager"
      description="Upload and manage downloadable resources for merchants — guides, manuals, and documents."
    >
      {!isSuperAdmin ? (
        <div className="mx-auto max-w-lg rounded-2xl border border-rose-200 bg-rose-50 p-8 text-center">
          <FaShieldHalved className="mx-auto mb-4 text-4xl text-rose-400" />
          <p className="font-black text-rose-700">Super admin access required.</p>
        </div>
      ) : (
        <div className="mx-auto max-w-[860px] space-y-6">

          {/* ── Upload panel ─────────────────────────────────────── */}
          <div className="overflow-hidden rounded-[22px] border border-slate-200 bg-white shadow-sm">
            <SectionHeading
              eyebrow="Upload"
              title="Add or replace a material"
              description="To update an existing file, upload a new version with the same filename — all existing download links will automatically serve the updated version."
            />

            <div className="px-5 pb-6 pt-2 space-y-4">
              {/* Drop zone */}
              <div
                onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
                onDragLeave={() => setDragOver(false)}
                onDrop={onDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`flex cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed px-6 py-10 text-center transition ${
                  dragOver
                    ? "border-rose-400 bg-rose-50"
                    : "border-slate-200 bg-slate-50 hover:border-rose-300 hover:bg-rose-50/50"
                }`}
              >
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-rose-100 text-2xl text-rose-600">
                  <FaArrowUpFromBracket />
                </div>
                <div>
                  <p className="text-sm font-black text-slate-800">
                    {pendingFile ? pendingFile.name : "Drag & drop a file here"}
                  </p>
                  <p className="mt-0.5 text-xs font-semibold text-slate-400">
                    {pendingFile
                      ? `${formatFileSize(pendingFile.size)} · Click to change`
                      : "or click to browse — PDF, Word, or any document"}
                  </p>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  onChange={onInputChange}
                />
              </div>

              {/* Custom filename */}
              {pendingFile && (
                <div>
                  <label className="mb-1.5 block text-[0.78rem] font-black uppercase tracking-widest text-slate-400">
                    Save as filename
                  </label>
                  <input
                    type="text"
                    value={customName}
                    onChange={(e) => setCustomName(e.target.value)}
                    placeholder={pendingFile.name}
                    className="w-full rounded-xl border border-slate-300 bg-slate-50 px-4 py-2.5 font-mono text-sm text-slate-800 outline-none transition focus:border-rose-400 focus:ring-2 focus:ring-rose-100"
                  />
                  <p className="mt-1.5 text-[0.72rem] font-semibold text-slate-400">
                    Spaces will be replaced with underscores. Keep it descriptive — merchants will see this name in the URL.
                  </p>
                </div>
              )}

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  disabled={!pendingFile || uploading}
                  onClick={handleUpload}
                  className="flex items-center gap-2 rounded-xl bg-rose-600 px-5 py-2.5 text-sm font-black text-white shadow-sm transition hover:bg-rose-500 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {uploading ? (
                    <><FaCircleNotch className="animate-spin" /> Uploading...</>
                  ) : (
                    <><FaUpload /> Upload file</>
                  )}
                </button>
                {pendingFile && !uploading && (
                  <button
                    type="button"
                    onClick={() => { setPendingFile(null); setCustomName("") }}
                    className="text-sm font-bold text-slate-400 transition hover:text-slate-600"
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* ── File list ──────────────────────────────────────────── */}
          <div className="overflow-hidden rounded-[22px] border border-slate-200 bg-white shadow-sm">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <SectionHeading
                eyebrow="Library"
                title="Uploaded materials"
                description={`${files.length} file${files.length !== 1 ? "s" : ""} available for download`}
              />
              <button
                type="button"
                onClick={fetchFiles}
                disabled={loadingFiles}
                className="flex shrink-0 items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-600 transition hover:bg-slate-100"
              >
                <FaRotateRight className={loadingFiles ? "animate-spin" : ""} />
                Refresh
              </button>
            </div>

            {loadingFiles ? (
              <div className="flex items-center justify-center py-16">
                <FaCircleNotch className="animate-spin text-2xl text-rose-400" />
              </div>
            ) : fetchError ? (
              <div className="py-12 text-center">
                <p className="mb-3 text-sm font-bold text-rose-600">{fetchError}</p>
                <button
                  type="button"
                  onClick={fetchFiles}
                  className="rounded-xl bg-rose-600 px-4 py-2 text-sm font-black text-white hover:bg-rose-500"
                >
                  Try again
                </button>
              </div>
            ) : files.length === 0 ? (
              <div className="py-16 text-center text-slate-400">
                <FaFile className="mx-auto mb-3 text-4xl text-slate-200" />
                <p className="text-sm font-bold">No materials uploaded yet.</p>
                <p className="mt-1 text-xs font-semibold">Upload your first file above.</p>
              </div>
            ) : (
              <ul className="divide-y divide-slate-100">
                {files.map((file) => {
                  const publicUrl = getPublicUrl(file.name)
                  const sizeBytes = file.metadata?.size
                  const lastModified = file.metadata?.lastModified || file.updated_at || file.created_at

                  return (
                    <li key={file.name} className="flex items-center gap-4 px-5 py-4">
                      {/* Icon */}
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-xl">
                        {fileIcon(file.name)}
                      </div>

                      {/* Details */}
                      <div className="flex-1 min-w-0">
                        <div
                          className="truncate text-sm font-black text-slate-900"
                          title={file.name}
                        >
                          {prettyName(file.name)}
                        </div>
                        <div className="truncate text-[0.7rem] font-mono text-slate-400" title={file.name}>
                          {file.name}
                        </div>
                        <div className="mt-0.5 flex items-center gap-3 text-[0.7rem] font-semibold text-slate-400">
                          <span>{formatFileSize(sizeBytes)}</span>
                          {lastModified && (
                            <span>Updated {formatDateTime(lastModified)}</span>
                          )}
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex shrink-0 items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleCopy(publicUrl, file.name)}
                          title="Copy public URL"
                          className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-600 transition hover:bg-slate-100"
                        >
                          {copiedKey === file.name ? (
                            <><FaCheck className="text-emerald-600" /><span className="text-emerald-600 hidden sm:inline">Copied!</span></>
                          ) : (
                            <><FaCopy /><span className="hidden sm:inline">Copy URL</span></>
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(file.name)}
                          title="Delete file"
                          className="flex h-9 w-9 items-center justify-center rounded-xl border border-rose-100 bg-rose-50 text-sm text-rose-400 transition hover:border-rose-300 hover:bg-rose-100 hover:text-rose-700"
                        >
                          <FaTrash />
                        </button>
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>

          {/* ── How update works ──────────────────────────────────── */}
          <div className="rounded-2xl border border-blue-100 bg-blue-50 px-5 py-4 text-sm font-semibold leading-relaxed text-blue-700">
            <span className="font-black">How updates work: </span>
            Upload a new version of any file using the exact same filename. The public URL never changes — merchants who already have the link will automatically download the new version. No links need to be updated anywhere in the app.
          </div>

        </div>
      )}
    </StaffPortalShell>
  )
}
