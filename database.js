// ================================================================
// DATABASE LAYER - IndexedDB
// ================================================================

const DB_NAME = "IslamicDigitalLibraryDB";
const DB_VERSION = 2;
const STORES = {
  CATALOG: "master_catalog",
  CHUNKS: "book_chunks",
  TOC: "book_toc",
  BOOKMARKS: "bookmarks",
  PROGRESS: "reading_progress",
  SETTINGS: "settings",
  SYNC: "sync_state"
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
      
      // Create stores if they don't exist
      for (const key in STORES) {
        if (!db.objectStoreNames.contains(STORES[key])) {
          db.createObjectStore(STORES[key], { keyPath: "id" });
        }
      }
      
      // Create indexes for book_chunks
      if (db.objectStoreNames.contains(STORES.CHUNKS)) {
        const store = request.transaction.objectStore(STORES.CHUNKS);
        if (!store.indexNames.contains("bookId")) {
          store.createIndex("bookId", "bookId", { unique: false });
        }
        if (!store.indexNames.contains("sequence")) {
          store.createIndex("sequence", "sequence", { unique: false });
        }
        if (!store.indexNames.contains("part")) {
          store.createIndex("part", "part", { unique: false });
        }
      }
      
      // Create indexes for TOC
      if (db.objectStoreNames.contains(STORES.TOC)) {
        const store = request.transaction.objectStore(STORES.TOC);
        if (!store.indexNames.contains("bookId")) {
          store.createIndex("bookId", "bookId", { unique: false });
        }
        if (!store.indexNames.contains("level")) {
          store.createIndex("level", "level", { unique: false });
        }
      }
      
      // Create indexes for bookmarks
      if (db.objectStoreNames.contains(STORES.BOOKMARKS)) {
        const store = request.transaction.objectStore(STORES.BOOKMARKS);
        if (!store.indexNames.contains("bookId")) {
          store.createIndex("bookId", "bookId", { unique: false });
        }
      }
      
      // Create indexes for progress
      if (db.objectStoreNames.contains(STORES.PROGRESS)) {
        const store = request.transaction.objectStore(STORES.PROGRESS);
        if (!store.indexNames.contains("bookId")) {
          store.createIndex("bookId", "bookId", { unique: true });
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
// GENERIC CRUD OPERATIONS
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
    } catch (err) {
      reject(err);
    }
  });
}

async function getData(storeName, id) {
  return new Promise((resolve, reject) => {
    try {
      const store = getStore(storeName, "readonly");
      const request = store.get(id);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    } catch (err) {
      reject(err);
    }
  });
}

async function getAllData(storeName) {
  return new Promise((resolve, reject) => {
    try {
      const store = getStore(storeName, "readonly");
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    } catch (err) {
      reject(err);
    }
  });
}

async function deleteData(storeName, id) {
  return new Promise((resolve, reject) => {
    try {
      const store = getStore(storeName, "readwrite");
      const request = store.delete(id);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    } catch (err) {
      reject(err);
    }
  });
}

async function clearStore(storeName) {
  return new Promise((resolve, reject) => {
    try {
      const store = getStore(storeName, "readwrite");
      const request = store.clear();
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    } catch (err) {
      reject(err);
    }
  });
}

// ================================================================
// BOOK CHUNKS - SPECIALIZED
// ================================================================
async function getBookChunks(bookId, limit = 10, offset = 0) {
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
    } catch (err) {
      reject(err);
    }
  });
}

async function getBookChunkBySequence(bookId, sequence) {
  return new Promise((resolve, reject) => {
    try {
      const store = getStore(STORES.CHUNKS, "readonly");
      const index = store.index("sequence");
      const range = IDBKeyRange.only(sequence);
      const request = index.openCursor(range, "next");
      
      request.onsuccess = (event) => {
        const cursor = event.target.result;
        if (cursor) {
          if (cursor.value.bookId === bookId) {
            resolve(cursor.value);
          } else {
            cursor.continue();
          }
        } else {
          resolve(null);
        }
      };
      
      request.onerror = () => reject(request.error);
    } catch (err) {
      reject(err);
    }
  });
}

async function saveBookChunks(chunks) {
  const store = getStore(STORES.CHUNKS, "readwrite");
  for (const chunk of chunks) {
    store.put(chunk);
  }
  return true;
}

// ================================================================
// BOOK TOC
// ================================================================
async function getBookTOC(bookId) {
  return new Promise((resolve, reject) => {
    try {
      const store = getStore(STORES.TOC, "readonly");
      const index = store.index("bookId");
      const range = IDBKeyRange.only(bookId);
      const request = index.getAll(range);
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    } catch (err) {
      reject(err);
    }
  });
}

async function saveBookTOC(bookId, tocItems) {
  const store = getStore(STORES.TOC, "readwrite");
  for (const item of tocItems) {
    item.bookId = bookId;
    store.put(item);
  }
  return true;
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
    } catch (err) {
      reject(err);
    }
  });
}

async function addBookmark(bookId, sequence, note = "") {
  const bookmark = {
    id: `${bookId}_${Date.now()}`,
    bookId: bookId,
    sequence: sequence,
    note: note,
    created_at: new Date().toISOString()
  };
  await putData(STORES.BOOKMARKS, bookmark);
  return bookmark;
}

async function removeBookmark(bookmarkId) {
  await deleteData(STORES.BOOKMARKS, bookmarkId);
}

// ================================================================
// READING PROGRESS
// ================================================================
async function getProgress(bookId) {
  const progress = await getData(STORES.PROGRESS, bookId);
  return progress || { bookId, sequence: 0, character_offset: 0, audio_position: 0 };
}

async function saveProgress(bookId, sequence, character_offset = 0, audio_position = 0) {
  const progress = {
    id: bookId,
    bookId: bookId,
    sequence: sequence,
    character_offset: character_offset,
    audio_position: audio_position,
    updated_at: new Date().toISOString()
  };
  await putData(STORES.PROGRESS, progress);
  return progress;
}

// ================================================================
// SETTINGS
// ================================================================
async function getSettings() {
  const settings = await getData(STORES.SETTINGS, "user_settings");
  return settings || {};
}

async function saveSettings(settings) {
  settings.id = "user_settings";
  await putData(STORES.SETTINGS, settings);
  return settings;
}

// ================================================================
// CATALOG
// ================================================================
async function getCatalog() {
  return await getAllData(STORES.CATALOG);
}

async function saveCatalog(books) {
  const store = getStore(STORES.CATALOG, "readwrite");
  for (const book of books) {
    store.put(book);
  }
  return true;
}

async function getBook(bookId) {
  return await getData(STORES.CATALOG, bookId);
}

async function updateBook(bookId, updates) {
  const book = await getBook(bookId);
  if (book) {
    Object.assign(book, updates);
    await putData(STORES.CATALOG, book);
  }
  return book;
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
  
  // Book chunks
  getBookChunks,
  getBookChunkBySequence,
  saveBookChunks,
  
  // TOC
  getBookTOC,
  saveBookTOC,
  
  // Bookmarks
  getBookmarks,
  addBookmark,
  removeBookmark,
  
  // Progress
  getProgress,
  saveProgress,
  
  // Settings
  getSettings,
  saveSettings,
  
  // Catalog
  getCatalog,
  saveCatalog,
  getBook,
  updateBook,
  
  STORES
};