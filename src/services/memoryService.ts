import { collection, query, getDocs, setDoc, doc, updateDoc, serverTimestamp, orderBy, limit } from 'firebase/firestore';
import { db, auth } from '../lib/firebase';

export interface MemoryFact {
  key: string;
  value: string;
  updatedAt: any;
}

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export async function saveMemoryFact(key: string, value: string) {
  const path = `memories/${key}`;
  try {
    const memoryRef = doc(db, 'memories', key.toLowerCase().replace(/\s+/g, '_'));
    await setDoc(memoryRef, {
      key,
      value,
      updatedAt: serverTimestamp()
    }, { merge: true });
    return true;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
    return false;
  }
}

export async function getAllMemories(): Promise<string> {
  try {
    const q = query(collection(db, 'memories'), orderBy('updatedAt', 'desc'));
    const snapshot = await getDocs(q);
    const memories = snapshot.docs.map(doc => {
      const data = doc.data() as MemoryFact;
      return `${data.key}: ${data.value}`;
    });
    return memories.join("\n");
  } catch (error) {
    console.error("Error fetching memories:", error);
    return "";
  }
}

export async function saveConversationHighlight(summary: string) {
  try {
    const highlightRef = doc(collection(db, 'highlights'));
    await setDoc(highlightRef, {
      summary,
      timestamp: serverTimestamp()
    });
    return true;
  } catch (error) {
    console.error("Error saving highlight:", error);
    return false;
  }
}

export async function getRecentHighlights(): Promise<string> {
  try {
    const q = query(collection(db, 'highlights'), orderBy('timestamp', 'desc'), limit(5));
    const snapshot = await getDocs(q);
    const highlights = snapshot.docs.map(doc => {
      const data = doc.data();
      return `- ${data.summary}`;
    });
    return highlights.reverse().join("\n");
  } catch (error) {
    console.error("Error fetching highlights:", error);
    return "";
  }
}
