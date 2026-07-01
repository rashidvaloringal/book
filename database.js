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

async function saveBookMetadata(book) { 
  book.id = book.id || book.bookId; 
  return await putData(STORES.BOOKS, book); 
}

// ================================================================
// CHUNKS
// ================================================================
async function getAllChunks(bookId) {
  await ensureDB();
  return new Promise((resolve, reject) => {
    try {
      const store = getStore(STORES.CHUNKS, "readonly");
      const index = store.index("bookId");
      const range = IDBKeyRange.only(bookId);
      const request = index.openCursor(range, "next");
      const results = [];
      request.onsuccess = (event) => {
        const cursor = event.target.result;
        if (cursor) { 
          results.push(cursor.value); 
          cursor.continue(); 
        } else { 
          resolve(results); 
        }
      };
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
  await ensureDB();
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
  return await putData(STORES.BOOKMARKS, { 
    id, 
    bookId, 
    sequence, 
    pageData, 
    created_at: new Date().toISOString() 
  }); 
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
// STORAGE INFO
// ================================================================
async function getStorageInfo() {
  await ensureDB();
  let totalSize = 0, totalChunks = 0, bookCount = 0;
  try {
    const books = await getBooks(); 
    bookCount = books.length;
    for (const book of books) {
      const chunks = await getAllChunks(book.id); 
      totalChunks += chunks.length;
      for (const chunk of chunks) { 
        totalSize += JSON.stringify(chunk).length; 
      }
    }
  } catch(e) {}
  return { 
    bookCount, 
    totalChunks, 
    totalSize: (totalSize / 1024 / 1024).toFixed(2) + ' MB' 
  };
}

// ================================================================
// CLEAR ALL DATA
// ================================================================
async function clearAllDBData() { 
  for (const key in STORES) { 
    await clearStore(STORES[key]); 
  } 
}

// ================================================================
// LIBRARYDB - For easy access from index.html
// ================================================================
const LibraryDB = {
  // Get full book data (all pages merged)
  getBook: async function(bookId) {
    try {
      const chunks = await getAllChunks(bookId);
      if (chunks && chunks.length > 0) {
        let allPages = [];
        for (const chunk of chunks) {
          allPages = allPages.concat(chunk.pages);
        }
        allPages.sort((a, b) => a.sequence - b.sequence);
        return allPages;
      }
      return null;
    } catch(e) {
      console.error('LibraryDB.getBook error:', e);
      return null;
    }
  },

  // Save full book data (splits into chunks)
  saveBook: async function(bookId, pages) {
    try {
      if (!pages || pages.length === 0) return;
      const CHUNK_SIZE = 100;
      const numChunks = Math.ceil(pages.length / CHUNK_SIZE);
      for (let i = 0; i < numChunks; i++) {
        const start = i * CHUNK_SIZE;
        const end = Math.min(start + CHUNK_SIZE, pages.length);
        const chunkPages = pages.slice(start, end);
        await saveChunk(bookId, i, chunkPages, 1, start);
      }
      // Save book metadata (use putData directly to avoid recursion)
      await putData(STORES.BOOKS, { 
        id: bookId, 
        bookId, 
        downloaded: true, 
        total_pages: pages.length,
        updated_at: new Date().toISOString()
      });
      return true;
    } catch(e) {
      console.error('LibraryDB.saveBook error:', e);
      throw e;
    }
  },

  // Remove book from IndexedDB
  removeBook: async function(bookId) {
    try {
      const chunks = await getAllChunks(bookId);
      for (const chunk of chunks) {
        await deleteData(STORES.CHUNKS, chunk.id);
      }
      await deleteData(STORES.BOOKS, bookId);
      return true;
    } catch(e) {
      console.error('LibraryDB.removeBook error:', e);
      throw e;
    }
  },

  // Check if book exists in IndexedDB
  hasBook: async function(bookId) {
    try {
      const chunks = await getAllChunks(bookId);
      return chunks && chunks.length > 0;
    } catch(e) {
      return false;
    }
  },

  // Get storage info
  getStorageInfo: async function() {
    return await getStorageInfo();
  },

  // Clear all data
  clearAll: async function() {
    await clearAllDBData();
  }
};

// ================================================================
// EXPORT
// ================================================================
const DB = {
  open: openDB, 
  ensure: ensureDB, 
  getStorageInfo, 
  clearAllData: clearAllDBData,
  getBooks, 
  getBook, 
  saveBook: saveBookMetadata, 
  getAllChunks, 
  saveChunk,
  getTOC, 
  saveTOC, 
  getBookmarks, 
  addBookmark, 
  removeBookmark, 
  getProgress, 
  saveProgress
};

// Expose to window
if (typeof window !== 'undefined') { 
  window.DB = DB;
  window.LibraryDB = LibraryDB;
  openDB().catch(console.error);
  console.log('✅ database.js loaded. LibraryDB available.');
}

// Export for module use
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { DB, LibraryDB };
}