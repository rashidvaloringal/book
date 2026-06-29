// ================================================================
// DATABASE LAYER - IndexedDB
// ================================================================

const DB_NAME = "IslamicDigitalLibrary";
const DB_VERSION = 3;

const STORES = {
  BOOKS: "books",
  CHUNKS: "book_chunks",
  TOC: "book_toc",
  BOOKMARKS: "bookmarks",
  PROGRESS: "progress",
  SETTINGS: "settings"
};

let dbInstance = null;

// ================================================================
// OPEN DATABASE
// ================================================================
function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      
      for (const key in STORES) {
        if (!db.objectStoreNames.contains(STORES[key])) {
          const store = db.createObjectStore(STORES[key], { keyPath: "id" });
          
          if (key === "CHUNKS") {
            store.createIndex("bookId", "bookId", { unique: false });
            store.createIndex("chunkNo", "chunkNo", { unique: false });
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
      resolve(dbInstance);
    };
    
    request.onerror = (event) => {
      reject(event.target.error);
    };
  });
}

// ================================================================
// GENERIC CRUD
// ================================================================
function getStore(storeName, mode = "readonly") {
  if (!dbInstance) throw new Error("Database not open");
  const tx = dbInstance.transaction(storeName, mode);
  return tx.objectStore(storeName);
}

async function putData(storeName, data) {
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
// CHUNKS
// ================================================================
async function getChunk(bookId, chunkNo) {
  const id = `${bookId}_${chunkNo}`;
  return await getData(STORES.CHUNKS, id);
}

async function getChunks(bookId, limit = 9999, offset = 0) {
  return new Promise((resolve, reject) => {
    try {
      const store = getStore(STORES.CHUNKS, "readonly");
      const index = store.index("bookId");
      const range = IDBKeyRange.only(bookId);
      const request = index.openCursor(range, "next");
      
      const results = [];
      let skipped = 0;
      let count = 0;
      
      request.onsuccess = (event) => {
        const cursor = event.target.result;
        if (cursor) {
          if (skipped < offset) {
            skipped++;
            cursor.continue();
          } else if (count < limit) {
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

async function saveChunk(bookId, chunkNo, pages) {
  const id = `${bookId}_${chunkNo}`;
  const data = { id, bookId, chunkNo, pages, updated_at: new Date().toISOString() };
  return await putData(STORES.CHUNKS, data);
}

async function deleteChunks(bookId) {
  const chunks = await getChunks(bookId);
  for (const chunk of chunks) {
    await deleteData(STORES.CHUNKS, chunk.id);
  }
  return chunks;
}

// ================================================================
// TOC
// ================================================================
async function getTOC(bookId) {
  const data = await getData(STORES.TOC, bookId);
  return data ? data.toc : null;
}

async function saveTOC(bookId, toc) {
  return await putData(STORES.TOC, { id: bookId, bookId, toc, updated_at: new Date().toISOString() });
}

async function appendTOC(bookId, tocItems) {
  let existing = await getTOC(bookId) || [];
  // Merge new items (avoid duplicates by sequence)
  const seqMap = new Map();
  existing.forEach(item => seqMap.set(item.sequence, item));
  tocItems.forEach(item => {
    if (!seqMap.has(item.sequence)) {
      seqMap.set(item.sequence, item);
    }
  });
  const merged = Array.from(seqMap.values()).sort((a, b) => a.sequence - b.sequence);
  return await saveTOC(bookId, merged);
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

async function addBookmark(bookId, sequence) {
  const id = `${bookId}_${sequence}`;
  const data = { id, bookId, sequence, created_at: new Date().toISOString() };
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
  return data || { id: bookId, bookId, sequence: 0, word_offset: 0 };
}

async function saveProgress(bookId, sequence, word_offset = 0) {
  return await putData(STORES.PROGRESS, { 
    id: bookId, 
    bookId, 
    sequence, 
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
// EXPORT
// ================================================================
window.DB = {
  open: openDB,
  getData,
  putData,
  getAllData,
  deleteData,
  clearStore,
  STORES,
  
  // Books
  getBooks,
  getBook,
  saveBook,
  saveBooks,
  updateBook,
  
  // Chunks
  getChunk,
  getChunks,
  saveChunk,
  deleteChunks,
  
  // TOC
  getTOC,
  saveTOC,
  appendTOC,
  
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