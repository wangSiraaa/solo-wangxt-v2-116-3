import type { DiagnosticReview, ProjectExport, StoredProject } from '../score/types'
import { xmlSignature } from '../score/diagnostics'

const databaseName = 'rehearsal-stand'
const storeName = 'projects'
const version = 1

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(databaseName, version)
    request.onupgradeneeded = () => {
      const database = request.result
      if (!database.objectStoreNames.contains(storeName)) {
        database.createObjectStore(storeName, { keyPath: 'id' })
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

function requestPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

export async function listProjects(): Promise<StoredProject[]> {
  const database = await openDatabase()
  try {
    const result = await requestPromise(database.transaction(storeName, 'readonly').objectStore(storeName).getAll())
    return result.map(normalizeProject).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  } finally {
    database.close()
  }
}

export async function saveProject(project: StoredProject): Promise<void> {
  const database = await openDatabase()
  try {
    await requestPromise(database.transaction(storeName, 'readwrite').objectStore(storeName).put(project))
  } finally {
    database.close()
  }
}

export async function deleteProject(id: string): Promise<void> {
  const database = await openDatabase()
  try {
    await requestPromise(database.transaction(storeName, 'readwrite').objectStore(storeName).delete(id))
  } finally {
    database.close()
  }
}

export function createProject(name: string, originalXml: string): StoredProject {
  const now = new Date().toISOString()
  return {
    id: crypto.randomUUID(),
    name,
    originalXml,
    marks: [],
    reviews: [],
    updatedAt: now,
    createdAt: now,
  }
}

/**
 * 兼容旧版工程：没有 reviews 字段时补空数组。
 */
export function normalizeProject(raw: StoredProject): StoredProject {
  return {
    ...raw,
    marks: Array.isArray(raw.marks) ? raw.marks : [],
    reviews: Array.isArray(raw.reviews) ? raw.reviews : [],
  }
}

/**
 * 按 XML 内容指纹找到同一首乐曲的已存工程（最近更新的一个）。
 * 不同工程（不同 XML 指纹）互不匹配。
 */
export async function findProjectByXml(xml: string): Promise<StoredProject | null> {
  const signature = xmlSignature(xml)
  const all = await listProjects()
  return all.find((item) => xmlSignature(item.originalXml) === signature) ?? null
}

/**
 * 重新载入一份 XML 时恢复核对记录：
 * 只在同一内容 XML 的工程中取回；不同工程（不同 XML 指纹）的记录不会串用。
 */
export async function findReviewsForXml(xml: string): Promise<DiagnosticReview[]> {
  const match = await findProjectByXml(xml)
  return match ? normalizeProject(match).reviews : []
}

export function exportProject(project: StoredProject): ProjectExport {
  return {
    format: 'local-rehearsal-project/v1',
    project: JSON.parse(JSON.stringify(project)) as StoredProject,
  }
}

export function downloadText(filename: string, content: string, mime: string): void {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}

export async function importProjectFile(file: File): Promise<StoredProject> {
  const text = await file.text()
  const parsed = JSON.parse(text) as ProjectExport
  if (parsed.format !== 'local-rehearsal-project/v1' || !parsed.project?.originalXml) {
    throw new Error('不是有效的 local-rehearsal-project/v1 工程文件。')
  }
  return normalizeProject({
    ...parsed.project,
    id: crypto.randomUUID(),
    updatedAt: new Date().toISOString(),
  })
}
