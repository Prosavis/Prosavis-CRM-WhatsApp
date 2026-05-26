import { readFileSync } from 'node:fs';
import { initializeApp, cert, getApps, type App } from 'firebase-admin/app';
import {
  getFirestore,
  type Firestore,
  type QueryDocumentSnapshot,
} from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { getFirebaseConfig } from './config.js';

let app: App | undefined;
let db: Firestore | undefined;

export function initFirebaseAdmin(): { app: App; db: Firestore } {
  if (app && db) return { app, db };

  const { projectId, storageBucket } = getFirebaseConfig();

  if (getApps().length === 0) {
    const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
    if (!credPath) {
      throw new Error('GOOGLE_APPLICATION_CREDENTIALS es requerido');
    }
    const serviceAccount = JSON.parse(readFileSync(credPath, 'utf8'));
    app = initializeApp({
      credential: cert(serviceAccount),
      projectId,
      storageBucket,
    });
  } else {
    app = getApps()[0];
  }

  db = getFirestore(app);
  return { app, db };
}

export function getFirebaseStorage() {
  const { app: firebaseApp } = initFirebaseAdmin();
  return getStorage(firebaseApp);
}

export async function countCollection(collectionPath: string): Promise<number> {
  const { db: firestore } = initFirebaseAdmin();
  const snapshot = await firestore.collection(collectionPath).count().get();
  return snapshot.data().count;
}

export async function countCollectionGroup(groupId: string): Promise<number> {
  const { db: firestore } = initFirebaseAdmin();
  const snapshot = await firestore.collectionGroup(groupId).count().get();
  return snapshot.data().count;
}

export async function countSubcollectionExecutions(): Promise<number> {
  const { db: firestore } = initFirebaseAdmin();
  const snapshot = await firestore.collectionGroup('executions').count().get();
  return snapshot.data().count;
}

export async function countChatMessages(): Promise<number> {
  let total = 0;
  for await (const batch of iterateChatMessages(500)) {
    total += batch.length;
  }
  return total;
}

/** Conteo legacy (incluye subcolecciones `messages` fuera de `chats/*`). Solo diagnóstico. */
export async function countChatMessagesCollectionGroup(): Promise<number> {
  const { db: firestore } = initFirebaseAdmin();
  const snapshot = await firestore.collectionGroup('messages').count().get();
  return snapshot.data().count;
}

export async function* iterateCollection(
  collectionPath: string,
  batchSize = 500
): AsyncGenerator<QueryDocumentSnapshot[]> {
  const { db: firestore } = initFirebaseAdmin();
  let lastDoc: QueryDocumentSnapshot | undefined;

  while (true) {
    let query = firestore.collection(collectionPath).orderBy('__name__').limit(batchSize);
    if (lastDoc) {
      query = query.startAfter(lastDoc);
    }

    const snapshot = await query.get();
    if (snapshot.empty) break;

    yield snapshot.docs;
    lastDoc = snapshot.docs[snapshot.docs.length - 1];
    if (snapshot.size < batchSize) break;
  }
}

export async function* iterateCollectionOrdered(
  collectionPath: string,
  orderField: string,
  batchSize = 500,
  since?: Date
): AsyncGenerator<QueryDocumentSnapshot[]> {
  const { db: firestore } = initFirebaseAdmin();
  let lastDoc: QueryDocumentSnapshot | undefined;

  while (true) {
    let query = firestore
      .collection(collectionPath)
      .orderBy(orderField, 'asc')
      .limit(batchSize);

    if (since) {
      query = query.where(orderField, '>', since);
    }
    if (lastDoc) {
      query = query.startAfter(lastDoc);
    }

    const snapshot = await query.get();
    if (snapshot.empty) break;

    yield snapshot.docs;
    lastDoc = snapshot.docs[snapshot.docs.length - 1];
    if (snapshot.size < batchSize) break;
  }
}

export async function loadAllDocs(collectionPath: string): Promise<QueryDocumentSnapshot[]> {
  const docs: QueryDocumentSnapshot[] = [];
  for await (const batch of iterateCollection(collectionPath)) {
    docs.push(...batch);
  }
  return docs;
}

export async function getDistinctServiceIds(): Promise<string[]> {
  const { db: firestore } = initFirebaseAdmin();
  const serviceIds = new Set<string>();

  const clientsSnap = await firestore.collection('crmClients').select('serviceId').get();
  for (const doc of clientsSnap.docs) {
    const serviceId = doc.data().serviceId as string | undefined;
    if (serviceId) serviceIds.add(serviceId);
  }

  const servicesSnap = await firestore.collection('services').select().get();
  for (const doc of servicesSnap.docs) {
    serviceIds.add(doc.id);
  }

  return [...serviceIds].sort();
}

export async function* iterateCollectionGroup(
  groupId: string,
  batchSize = 500,
  pathPrefix?: string
): AsyncGenerator<QueryDocumentSnapshot[]> {
  const { db: firestore } = initFirebaseAdmin();
  let lastDoc: QueryDocumentSnapshot | undefined;

  while (true) {
    let query = firestore.collectionGroup(groupId).orderBy('__name__').limit(batchSize);
    if (lastDoc) {
      query = query.startAfter(lastDoc);
    }

    const snapshot = await query.get();
    if (snapshot.empty) break;

    const docs = pathPrefix
      ? snapshot.docs.filter((doc) => doc.ref.path.startsWith(pathPrefix))
      : snapshot.docs;

    if (docs.length > 0) {
      yield docs;
    }

    lastDoc = snapshot.docs[snapshot.docs.length - 1];
    if (snapshot.size < batchSize) break;
  }
}

export async function loadAllCollectionGroupDocs(
  groupId: string,
  pathPrefix?: string
): Promise<QueryDocumentSnapshot[]> {
  const docs: QueryDocumentSnapshot[] = [];
  for await (const batch of iterateCollectionGroup(groupId, 500, pathPrefix)) {
    docs.push(...batch);
  }
  return docs;
}

export async function* iterateChatMessages(
  batchSize = 500
): AsyncGenerator<Array<{ chatId: string; doc: QueryDocumentSnapshot }>> {
  const { db: firestore } = initFirebaseAdmin();
  let lastChat: QueryDocumentSnapshot | undefined;

  while (true) {
    let chatQuery = firestore.collection('chats').orderBy('__name__').limit(50);
    if (lastChat) {
      chatQuery = chatQuery.startAfter(lastChat);
    }

    const chatsSnap = await chatQuery.get();
    if (chatsSnap.empty) break;

    for (const chatDoc of chatsSnap.docs) {
      let lastMessage: QueryDocumentSnapshot | undefined;

      while (true) {
        let messageQuery = chatDoc.ref
          .collection('messages')
          .orderBy('__name__')
          .limit(batchSize);
        if (lastMessage) {
          messageQuery = messageQuery.startAfter(lastMessage);
        }

        const messagesSnap = await messageQuery.get();
        if (messagesSnap.empty) break;

        yield messagesSnap.docs.map((doc) => ({ chatId: chatDoc.id, doc }));

        lastMessage = messagesSnap.docs[messagesSnap.docs.length - 1];
        if (messagesSnap.size < batchSize) break;
      }
    }

    lastChat = chatsSnap.docs[chatsSnap.docs.length - 1];
    if (chatsSnap.size < 50) break;
  }
}
