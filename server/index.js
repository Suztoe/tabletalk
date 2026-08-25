import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer);

app.use(express.json());

const PORT = process.env.PORT || 3000;

const users = [];
const posts = [];
const channels = ['general', 'random', 'voice'];
const messages = [];

let nextUserId = 1;
let nextPostId = 1;
let nextMessageId = 1;

function now() {
  return new Date().toISOString();
}

function findUser(id) {
  return users.find(u => u.id === Number(id));
}

function findUserByToken(token) {
  return users.find(u => u.token === token);
}

function avatarFor(username) {
  return (username?.charAt(0) || '?').toUpperCase();
}

function hashPassword(password, salt) {
  return crypto.scryptSync(password, salt, 64).toString('hex');
}

function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

function toSafeUser(user) {
  const { passwordHash, salt, token, ...safe } = user;
  return safe;
}

// REST API
app.post('/api/register', (req, res) => {
  const { username, email, password } = req.body;
  if (!username || !email || !password) {
    return res.status(400).json({ error: 'Missing fields' });
  }
  if (users.some(u => u.email === email)) {
    return res.status(409).json({ error: 'Email already registered' });
  }
  const salt = crypto.randomBytes(16).toString('hex');
  const passwordHash = hashPassword(password, salt);
  const token = generateToken();
  const user = { id: nextUserId++, username, email, passwordHash, salt, token, avatar: avatarFor(username) };
  users.push(user);
  res.status(201).json({ ...toSafeUser(user), token });
});

app.post('/api/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Missing fields' });
  }
  const user = users.find(u => u.email === email);
  if (!user || user.passwordHash !== hashPassword(password, user.salt)) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  res.json({ ...toSafeUser(user), token: user.token });
});

function requireAuth(req, res, next) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  const user = token ? findUserByToken(token) : null;
  if (!user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  req.user = user;
  next();
}

app.get('/api/posts', (_req, res) => {
  const sorted = [...posts].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  res.json(sorted);
});

app.post('/api/posts', requireAuth, (req, res) => {
  const { content } = req.body;
  if (!content?.trim()) {
    return res.status(400).json({ error: 'Missing fields' });
  }
  const user = req.user;
  const post = {
    id: nextPostId++,
    user_id: user.id,
    username: user.username,
    avatar: user.avatar || avatarFor(user.username),
    content: content.trim(),
    likes: 0,
    created_at: now()
  };
  posts.push(post);
  io.emit('new_post', post);
  res.status(201).json(post);
});

app.put('/api/posts/:id/like', (req, res) => {
  const post = posts.find(p => p.id === Number(req.params.id));
  if (!post) return res.status(404).json({ error: 'Post not found' });
  post.likes += 1;
  io.emit('post_liked', post);
  res.json(post);
});

app.put('/api/posts/:id', requireAuth, (req, res) => {
  const post = posts.find(p => p.id === Number(req.params.id));
  if (!post) return res.status(404).json({ error: 'Post not found' });
  const { content } = req.body;
  if (post.user_id !== req.user.id) {
    return res.status(403).json({ error: 'Not allowed' });
  }
  if (!content?.trim()) return res.status(400).json({ error: 'Empty content' });
  post.content = content.trim();
  post.edited_at = now();
  io.emit('post_edited', post);
  res.json(post);
});

app.delete('/api/posts/:id', requireAuth, (req, res) => {
  const idx = posts.findIndex(p => p.id === Number(req.params.id));
  if (idx === -1) return res.status(404).json({ error: 'Post not found' });
  const post = posts[idx];
  if (post.user_id !== req.user.id) {
    return res.status(403).json({ error: 'Not allowed' });
  }
  posts.splice(idx, 1);
  io.emit('post_deleted', post.id);
  res.sendStatus(204);
});

app.get('/api/messages/:channel', (req, res) => {
  const channel = req.params.channel;
  if (!channels.includes(channel)) {
    return res.status(404).json({ error: 'Channel not found' });
  }
  const channelMessages = messages
    .filter(m => m.channel === channel)
    .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  res.json(channelMessages);
});

app.post('/api/messages', requireAuth, (req, res) => {
  const { channel, content } = req.body;
  if (!channel || !content?.trim()) {
    return res.status(400).json({ error: 'Missing fields' });
  }
  if (!channels.includes(channel)) {
    return res.status(404).json({ error: 'Channel not found' });
  }
  const user = req.user;
  const message = {
    id: nextMessageId++,
    user_id: user.id,
    username: user.username,
    avatar: user.avatar || avatarFor(user.username),
    channel,
    content: content.trim(),
    created_at: now()
  };
  messages.push(message);
  io.to(channel).emit('new_message', message);
  res.status(201).json(message);
});

app.get('/api/channels', (_req, res) => {
  res.json(channels);
});

app.post('/api/channels', requireAuth, (req, res) => {
  const { name } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'Missing name' });
  const normalized = name.trim().toLowerCase().replace(/\s+/g, '-');
  if (channels.includes(normalized)) {
    return res.status(409).json({ error: 'Channel already exists' });
  }
  channels.push(normalized);
  io.emit('channel_created', { name: normalized });
  res.status(201).json({ name: normalized });
});

app.get('/api/users/:id/posts', (req, res) => {
  const user = findUser(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  const userPosts = posts
    .filter(p => p.user_id === user.id)
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  res.json(userPosts);
});

app.get('/api/users/:id', (req, res) => {
  const user = findUser(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json(toSafeUser(user));
});

app.get('/api/search', (req, res) => {
  const q = (req.query.q || '').toLowerCase().trim();
  if (!q) return res.json({ posts: [], messages: [] });
  const foundPosts = posts.filter(p => p.content.toLowerCase().includes(q) || p.username.toLowerCase().includes(q));
  const foundMessages = messages.filter(m => m.content.toLowerCase().includes(q) || m.username.toLowerCase().includes(q));
  res.json({ posts: foundPosts, messages: foundMessages });
});

// Static web frontend
app.use(express.static(path.join(__dirname, '../src')));

// Socket.IO
io.on('connection', (socket) => {
  socket.on('join_channel', (channel) => {
    if (!channel || !channels.includes(channel)) return;
    socket.rooms.forEach(room => {
      if (room !== socket.id) socket.leave(room);
    });
    socket.join(channel);
  });
});

httpServer.listen(PORT, () => {
  console.log(`TableTalk web server running at http://localhost:${PORT}`);
});
