const express = require('express');
const admin = require('firebase-admin');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(cors({
  origin: 'https://ydkm-chatapp.vercel.app'
}));
app.use(express.json());

// Log environment variables for debugging
console.log('Initializing Firebase Admin SDK with the following credentials:');
console.log({
  type: process.env.FIREBASE_TYPE,
  project_id: process.env.FIREBASE_PROJECT_ID,
  private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID,
  private_key: process.env.FIREBASE_PRIVATE_KEY ? process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n') : 'Not provided',
  client_email: process.env.FIREBASE_CLIENT_EMAIL,
  client_id: process.env.FIREBASE_CLIENT_ID,
  auth_uri: process.env.FIREBASE_AUTH_URI,
  token_uri: process.env.FIREBASE_TOKEN_URI,
  auth_provider_x509_cert_url: process.env.FIREBASE_AUTH_PROVIDER_CERT_URL,
  client_x509_cert_url: process.env.FIREBASE_CLIENT_CERT_URL
});

// Initialize Firebase Admin SDK with environment variables
try {
  admin.initializeApp({
    credential: admin.credential.cert({
      type: process.env.FIREBASE_TYPE,
      project_id: process.env.FIREBASE_PROJECT_ID,
      private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID,
      private_key: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'), // Ensure newlines are correctly escaped
      client_email: process.env.FIREBASE_CLIENT_EMAIL,
      client_id: process.env.FIREBASE_CLIENT_ID,
      auth_uri: process.env.FIREBASE_AUTH_URI,
      token_uri: process.env.FIREBASE_TOKEN_URI,
      auth_provider_x509_cert_url: process.env.FIREBASE_AUTH_PROVIDER_CERT_URL,
      client_x509_cert_url: process.env.FIREBASE_CLIENT_CERT_URL
    }),
  });
  console.log('Firebase Admin SDK initialized successfully');
} catch (error) {
  console.error('Error initializing Firebase Admin SDK:', error);
}

const db = admin.firestore();

// ---------------------------------- USERS ----------------------------------

// POST route to create a new user
app.post('/users', async (req, res) => {
  const { userId, customUserId } = req.body;

  try {
    const usersRef = db.collection('users');
    const newUser = await usersRef.add({
      userId,
      customUserId,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    res.status(201).json({ userId: newUser.id, message: 'User created successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Error creating user', message: error.message });
  }
});

// GET route to fetch all chats for a specific user
app.get('/users/:userId/chats', async (req, res) => {
  const { userId } = req.params;

  try {
    const chatsRef = db.collection('chats');
    const chatQuery1 = chatsRef.where('userId1', '==', userId);
    const chatQuery2 = chatsRef.where('userId2', '==', userId);

    const [chats1, chats2] = await Promise.all([chatQuery1.get(), chatQuery2.get()]);

    const chats = [...chats1.docs, ...chats2.docs].map(doc => ({
      id: doc.id,
      ...doc.data(),
      updatedAt: doc.data().updatedAt.toDate().toISOString(),
    }));

    if (chats.length === 0) {
      return res.status(404).json({ message: 'No chats found for this user.' });
    }

    res.status(200).json(chats);
  } catch (error) {
    res.status(500).json({ error: 'Error fetching chats', message: error.message });
  }
});

// ---------------------------------- CHATS ----------------------------------

// POST route to create or fetch a chat between two users
app.post('/chats', async (req, res) => {
  const { senderId, recipientId } = req.body;

  try {
    const chatsRef = db.collection('chats');
    const chatQuery = chatsRef
      .where('userId1', 'in', [senderId, recipientId])
      .where('userId2', 'in', [senderId, recipientId]);

    const chatSnapshot = await chatQuery.get();

    let chatId;
    if (chatSnapshot.empty) {
      const newChat = await chatsRef.add({
        userId1: senderId,
        userId2: recipientId,
        lastMessage: '',
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      chatId = newChat.id;
    } else {
      chatId = chatSnapshot.docs[0].id;
    }

    res.status(200).json({ chatId, message: 'Chat created or fetched successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Error creating or fetching chat', message: error.message });
  }
});

// GET route to fetch all messages for a specific chat
app.get('/chats/:chatId/messages', async (req, res) => {
  const { chatId } = req.params;

  try {
    const messagesRef = db.collection('chats').doc(chatId).collection('messages').orderBy('timestamp', 'asc');
    const messagesSnapshot = await messagesRef.get();

    if (messagesSnapshot.empty) {
      return res.status(404).json({ message: 'No messages found for this chat.' });
    }

    const messages = messagesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    res.status(200).json(messages);
  } catch (error) {
    res.status(500).json({ error: 'Error fetching messages', message: error.message });
  }
});

// ---------------------------------- MESSAGES ----------------------------------

// POST route to send a message in a chat
app.post('/messages', async (req, res) => {
  const { chatId, senderId, recipientId, text } = req.body;

  try {
    const messagesRef = db.collection('chats').doc(chatId).collection('messages');

    const newMessage = await messagesRef.add({
      chatId,
      senderId,
      recipientId,
      text,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
    });

    const chatRef = db.collection('chats').doc(chatId);
    await chatRef.update({
      lastMessage: text,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    res.status(201).json({ messageId: newMessage.id, text });
  } catch (error) {
    res.status(500).json({ error: 'Error sending message', message: error.message });
  }
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});

module.exports = app;
