const DRAFT_STORAGE_PREFIX = "ctm_persistent_draft_v1_"
const DRAFT_DB_NAME = "ctm-persistent-drafts"
const DRAFT_DB_VERSION = 1
const DRAFT_FILE_STORE = "draft-files"

function getMetadataStorageKey(draftKey) {
  return `${DRAFT_STORAGE_PREFIX}${draftKey}`
}

function getIndexedDb() {
  if (typeof window === "undefined" || !("indexedDB" in window)) {
    return Promise.resolve(null)
  }

  return new Promise((resolve, reject) => {
    const request = window.indexedDB.open(DRAFT_DB_NAME, DRAFT_DB_VERSION)

    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve(request.result)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(DRAFT_FILE_STORE)) {
        db.createObjectStore(DRAFT_FILE_STORE, { keyPath: "key" })
      }
    }
  })
}

async function readDraftFiles(draftKey) {
  const db = await getIndexedDb()
  if (!db) return {}

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(DRAFT_FILE_STORE, "readonly")
    const store = transaction.objectStore(DRAFT_FILE_STORE)
    const request = store.get(draftKey)

    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve(request.result?.files || {})

    transaction.oncomplete = () => db.close()
    transaction.onerror = () => reject(transaction.error)
  })
}

async function writeDraftFiles(draftKey, files) {
  const db = await getIndexedDb()
  if (!db) return

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(DRAFT_FILE_STORE, "readwrite")
    const store = transaction.objectStore(DRAFT_FILE_STORE)
    store.put({
      key: draftKey,
      files,
      updatedAt: Date.now(),
    })

    transaction.oncomplete = () => {
      db.close()
      resolve()
    }
    transaction.onerror = () => reject(transaction.error)
  })
}

async function removeDraftFiles(draftKey) {
  const db = await getIndexedDb()
  if (!db) return

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(DRAFT_FILE_STORE, "readwrite")
    const store = transaction.objectStore(DRAFT_FILE_STORE)
    store.delete(draftKey)

    transaction.oncomplete = () => {
      db.close()
      resolve()
    }
    transaction.onerror = () => reject(transaction.error)
  })
}

export async function loadPersistentDraft(draftKey) {
  if (!draftKey || typeof window === "undefined") {
    return { data: null, files: {} }
  }

  let metadata = null
  try {
    const raw = window.localStorage.getItem(getMetadataStorageKey(draftKey))
    metadata = raw ? JSON.parse(raw) : null
  } catch (error) {
    console.warn("Could not read local draft metadata:", error.message)
  }

  let files = {}
  try {
    files = await readDraftFiles(draftKey)
  } catch (error) {
    console.warn("Could not read local draft files:", error.message)
  }

  return {
    data: metadata?.data || null,
    files,
    updatedAt: metadata?.updatedAt || null,
  }
}

export async function savePersistentDraft(draftKey, { data, files = {} }) {
  if (!draftKey || typeof window === "undefined") return

  try {
    window.localStorage.setItem(
      getMetadataStorageKey(draftKey),
      JSON.stringify({
        updatedAt: Date.now(),
        data,
      })
    )
  } catch (error) {
    console.warn("Could not write local draft metadata:", error.message)
  }

  try {
    await writeDraftFiles(draftKey, files)
  } catch (error) {
    console.warn("Could not write local draft files:", error.message)
  }
}

export async function clearPersistentDraft(draftKey) {
  if (!draftKey || typeof window === "undefined") return

  try {
    window.localStorage.removeItem(getMetadataStorageKey(draftKey))
  } catch (error) {
    console.warn("Could not clear local draft metadata:", error.message)
  }

  try {
    await removeDraftFiles(draftKey)
  } catch (error) {
    console.warn("Could not clear local draft files:", error.message)
  }
}
