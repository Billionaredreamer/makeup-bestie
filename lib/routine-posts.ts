export type StoredRoutinePost = {
  id: string;
  creator: string;
  title: string;
  description: string;
  products: string[];
  createdAt: number;
  video: Blob;
  fileName: string;
};

const DATABASE = "makeup-bestie-community-v1";
const STORE = "routine-posts";

const openDatabase = () => new Promise<IDBDatabase>((resolve, reject) => {
  const request = window.indexedDB.open(DATABASE, 1);
  request.onupgradeneeded = () => {
    const database = request.result;
    if (!database.objectStoreNames.contains(STORE)) database.createObjectStore(STORE, { keyPath: "id" });
  };
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error || new Error("Local routine storage could not open."));
});

export async function listRoutinePosts() {
  const database = await openDatabase();
  return new Promise<StoredRoutinePost[]>((resolve, reject) => {
    const transaction = database.transaction(STORE, "readonly");
    const request = transaction.objectStore(STORE).getAll();
    request.onsuccess = () => resolve((request.result as StoredRoutinePost[]).sort((a, b) => b.createdAt - a.createdAt));
    request.onerror = () => reject(request.error || new Error("Local routine posts could not load."));
    transaction.oncomplete = () => database.close();
  });
}

export async function saveRoutinePost(post: StoredRoutinePost) {
  const database = await openDatabase();
  return new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(STORE, "readwrite");
    transaction.objectStore(STORE).put(post);
    transaction.oncomplete = () => { database.close(); resolve(); };
    transaction.onerror = () => { database.close(); reject(transaction.error || new Error("The routine could not be published on this device.")); };
  });
}
