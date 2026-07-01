// ================================================================
// DATABASE LAYER - IndexedDB with Full Caching Support
// ================================================================

const DB_NAME = "IslamicDigitalLibrary";
const DB_VERSION = 5;

const STORES = {
  BOOKS: "books",
  CHUNKS: "book_chunks",
  TOC: "book_toc",
  BOOKMARKS: "bookmarks",
  PROGRESS: "progress",
  SETTINGS: "settings"
};

let dbInstance = null;
let dbReady = false;
const pendingOperations = [];

// ================================================================
// OPEN DATABASE
// ================================================================
function openDB() {
  return new Promise((resolve, reject) => {
    if (dbInstance && dbReady) {
      resolve(dbInstance);
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      const oldVersion = event.oldVersion;

      for (const key in STORES) {
        if (!db.objectStoreNames.contains(STORES[key])) {
          const store = db.createObjectStore(STORES[key], { keyPath: "id" });

          if (key === "CHUNKS") {
            store.createIndex("bookId", "bookId", { unique: false });
            store.createIndex("chunkNo", "chunkNo", { unique: false });
            store.createIndex("sequence", "sequence", { unique: false });
            store.createIndex("part", "part", { unique: false });
          }
          if (key === "BOOKMARKS") {
            store.createIndex("bookId", "bookId", { unique: false });
          }
          if (key === "PROGRESS") {
            store.createIndex("bookId", "bookId", { unique: true });
          }
          if (key === "TOC") {
            store.createIndex("bookId", "bookId", { unique: true });
          }
        }
      }
    };

    request.onsuccess = (event) => {
      dbInstance = event.target.result;
      dbReady = true;

      while (pendingOperations.length > 0) {
        const op = pendingOperations.shift();
        op.resolve(dbInstance);
      }
      resolve(dbInstance);
    };

    request.onerror = (event) => {
      reject(event.target.error);
    };
  });
}

function ensureDB() {
  return new Promise((resolve) => {
    if (dbInstance && dbReady) {
      resolve(dbInstance);
      return;
    }
    pendingOperations.push({ resolve });
    if (!dbInstance) {
      openDB().catch(() => {});
    }
  });
}

function getStore(storeName, mode = "readonly") {
  if (!dbInstance) throw new Error("Database not open");
  const tx = dbInstance.transaction(storeName, mode);
  return tx.objectStore(storeName);
}

// ================================================================
// GENERIC CRUD
// ================================================================
async function putData(storeName, data) {
  await ensureDB();
  return new Promise((resolve, reject) => {
    try {
      const store = getStore(storeName, "readwrite");
      const request = store.put(data);
      request.onsuccess = () => resolve(data);
      request.onerror = () => reject(request.error);
    } catch (err) { reject(err); }
  });
}

async function getData(storeName, id) {
  await ensureDB();
  return new Promise((resolve, reject) => {
    try {
      const store = getStore(storeName, "readonly");
      const request = store.get(id);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    } catch (err) { reject(err); }
  });
}

async function getAllData(storeName) {
  await ensureDB();
  return new Promise((resolve, reject) => {
    try {
      const store = getStore(storeName, "readonly");
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    } catch (err) { reject(err); }
  });
}

async function deleteData(storeName, id) {
  await ensureDB();
  return new Promise((resolve, reject) => {
    try {
      const store = getStore(storeName, "readwrite");
      const request = store.delete(id);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    } catch (err) { reject(err); }
  });
}

async function clearStore(storeName) {
  await ensureDB();
  return new Promise((resolve, reject) => {
    try {
      const store = getStore(storeName, "readwrite");
      const request = store.clear();
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    } catch (err) { reject(err); }
  });
}

// ================================================================
// BOOKS
// ================================================================
async function getBooks() {
  return await getAllData(STORES.BOOKS);
}

async function getBook(bookId) {
  return await getData(STORES.BOOKS, bookId);
}

async function saveBook(book) {
  book.id = book.id || book.bookId;
  return await putData(STORES.BOOKS, book);
}

async function saveBooks(books) {
  for (const book of books) {
    await saveBook(book);
  }
  return books;
}

async function updateBook(bookId, updates) {
  const book = await getBook(bookId);
  if (book) {
    Object.assign(book, updates);
    await saveBook(book);
  }
  return book;
}

// ================================================================
// CHUNKS - OPTIMIZED
// ================================================================
async function getChunk(bookId, chunkNo) {
  const id = `${bookId}_${chunkNo}`;
  return await getData(STORES.CHUNKS, id);
}

async function getChunks(bookId, limit = 0, offset = 0, loadAll = false) {
  await ensureDB();
  return new Promise((resolve, reject) => {
    try {
      const store = getStore(STORES.CHUNKS, "readonly");
      const index = store.index("bookId");
      const range = IDBKeyRange.only(bookId);
      const request = index.openCursor(range, "next");

      const results = [];
      let skipped = 0;
      let count = 0;
      const effectiveLimit = loadAll ? Infinity : (limit || Infinity);

      request.onsuccess = (event) => {
        const cursor = event.target.result;
        if (cursor) {
          if (skipped < offset) {
            skipped++;
            cursor.continue();
          } else if (count < effectiveLimit) {
            results.push(cursor.value);
            count++;
            cursor.continue();
          } else {
            resolve(results);
          }
        } else {
          resolve(results);
        }
      };
      request.onerror = () => reject(request.error);
    } catch (err) { reject(err); }
  });
}

async function getAllChunks(bookId) {
  return await getChunks(bookId, 0, 0, true);
}

async function getChunkCount(bookId) {
  await ensureDB();
  return new Promise((resolve, reject) => {
    try {
      const store = getStore(STORES.CHUNKS, "readonly");
      const index = store.index("bookId");
      const range = IDBKeyRange.only(bookId);
      const request = index.count(range);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    } catch (err) { reject(err); }
  });
}

async function saveChunk(bookId, chunkNo, pages, part = 1, sequence = null) {
  const id = `${bookId}_${chunkNo}`;
  const data = { 
    id, 
    bookId, 
    chunkNo, 
    pages, 
    part: part || 1,
    sequence: sequence || chunkNo,
    updated_at: new Date().toISOString() 
  };
  return await putData(STORES.CHUNKS, data);
}

async function saveChunks(bookId, chunksData) {
  const promises = chunksData.map(({ chunkNo, pages, part, sequence }) => 
    saveChunk(bookId, chunkNo, pages, part, sequence)
  );
  return await Promise.all(promises);
}

async function deleteChunks(bookId) {
  const chunks = await getAllChunks(bookId);
  for (const chunk of chunks) {
    await deleteData(STORES.CHUNKS, chunk.id);
  }
  return chunks;
}

async function hasCachedChunks(bookId) {
  const count = await getChunkCount(bookId);
  return count > 0;
}

async function getChunksByPart(bookId, part) {
  await ensureDB();
  return new Promise((resolve, reject) => {
    try {
      const store = getStore(STORES.CHUNKS, "readonly");
      const index = store.index("part");
      const range = IDBKeyRange.only(part);
      const request = index.openCursor(range, "next");

      const results = [];
      request.onsuccess = (event) => {
        const cursor = event.target.result;
        if (cursor) {
          if (cursor.value.bookId === bookId) {
            results.push(cursor.value);
          }
          cursor.continue();
        } else {
          resolve(results);
        }
      };
      request.onerror = () => reject(request.error);
    } catch (err) { reject(err); }
  });
}

// ================================================================
// TOC
// ================================================================
async function getTOC(bookId) {
  const data = await getData(STORES.TOC, bookId);
  return data ? data.toc : null;
}

async function saveTOC(bookId, toc) {
  return await putData(STORES.TOC, { 
    id: bookId, 
    bookId, 
    toc, 
    updated_at: new Date().toISOString() 
  });
}

// ================================================================
// BOOKMARKS
// ================================================================
async function getBookmarks(bookId) {
  return new Promise((resolve, reject) => {
    try {
      const store = getStore(STORES.BOOKMARKS, "readonly");
      const index = store.index("bookId");
      const range = IDBKeyRange.only(bookId);
      const request = index.getAll(range);
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    } catch (err) { reject(err); }
  });
}

async function addBookmark(bookId, sequence, pageData) {
  const id = `${bookId}_${sequence}`;
  const data = { id, bookId, sequence, pageData, created_at: new Date().toISOString() };
  return await putData(STORES.BOOKMARKS, data);
}

async function removeBookmark(bookId, sequence) {
  const id = `${bookId}_${sequence}`;
  return await deleteData(STORES.BOOKMARKS, id);
}

// ================================================================
// PROGRESS
// ================================================================
async function getProgress(bookId) {
  const data = await getData(STORES.PROGRESS, bookId);
  return data || { id: bookId, bookId, sequence: 0, part: 1, word_offset: 0 };
}

async function saveProgress(bookId, sequence, part = 1, word_offset = 0) {
  return await putData(STORES.PROGRESS, { 
    id: bookId, 
    bookId, 
    sequence, 
    part,
    word_offset,
    updated_at: new Date().toISOString() 
  });
}

// ================================================================
// SETTINGS
// ================================================================
async function getSettings() {
  const data = await getData(STORES.SETTINGS, "user_settings");
  return data || {};
}

async function saveSettings(settings) {
  settings.id = "user_settings";
  return await putData(STORES.SETTINGS, settings);
}

// ================================================================
// STORAGE INFO
// ================================================================
async function getStorageInfo() {
  await ensureDB();
  let totalSize = 0;
  let totalChunks = 0;
  let bookCount = 0;

  try {
    const books = await getBooks();
    bookCount = books.length;

    for (const book of books) {
      const chunks = await getAllChunks(book.id);
      totalChunks += chunks.length;
      for (const chunk of chunks) {
        const json = JSON.stringify(chunk);
        totalSize += json.length;
      }
    }
  } catch(e) {}

  return {
    bookCount,
    totalChunks,
    totalSize: (totalSize / 1024 / 1024).toFixed(2) + ' MB',
    totalSizeBytes: totalSize
  };
}

// ================================================================
// CLEANUP
// ================================================================
async function clearAllData() {
  for (const key in STORES) {
    await clearStore(STORES[key]);
  }
}

// ================================================================
// EXPORT
// ================================================================
const DB = {
  open: openDB,
  ensure: ensureDB,
  getData,
  putData,
  getAllData,
  deleteData,
  clearStore,
  STORES,
  getStorageInfo,
  clearAllData,

  // Books
  getBooks,
  getBook,
  saveBook,
  saveBooks,
  updateBook,

  // Chunks
  getChunk,
  getChunks,
  getAllChunks,
  getChunkCount,
  hasCachedChunks,
  saveChunk,
  saveChunks,
  deleteChunks,
  getChunksByPart,

  // TOC
  getTOC,
  saveTOC,

  // Bookmarks
  getBookmarks,
  addBookmark,
  removeBookmark,

  // Progress
  getProgress,
  saveProgress,

  // Settings
  getSettings,
  saveSettings
};

if (typeof window !== 'undefined') {
  window.DB = DB;
  openDB().catch(console.error);
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = DB;
}