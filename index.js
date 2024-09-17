const express = require('express');
const admin = require('firebase-admin');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

// Initialize Firebase Admin SDK
const serviceAccount = require('./serviceAccountKey.json'); // Replace with your Firebase service account JSON

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

// ---------------------------------- USERS ----------------------------------

// POST route to create a new user
app.post('/users', async (req, res) => {
  const { userId, customUserId } = req.body; // Make sure you are sending these fields in the request body

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

    res.status(200).json({ chatId });
  } catch (error) {
    res.status(500).json({ error: 'Error creating/fetching chat', message: error.message });
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

app.listen(5000, () => console.log('Server running on http://localhost:5000'));

module.exports = app;