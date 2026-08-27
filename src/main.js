// TableTalk - Lightweight X+Discord-like SNS with P2P WebRTC calling
// Built with Tauri for maximum lightweight performance

const API_BASE = window.__TAURI__ ? 'http://localhost:3000/api' : '/api';
const SOCKET_URL = window.__TAURI__ ? 'http://localhost:3000' : undefined;

// State Management
const state = {
  currentView: 'timeline',
  currentChannel: 'general',
  isAuthenticated: false,
  currentUser: null,
  posts: [],
  chats: {
    general: [],
    random: [],
    voice: []
  },
  socket: null,
  channels: [],
  pendingChannel: null,
  uiInitialized: false,
  webRTC: {
    peerConnection: null,
    localStream: null,
    remoteStream: null
  }
};

function authHeaders() {
  const headers = { 'Content-Type': 'application/json' };
  if (state.currentUser?.token) {
    headers['Authorization'] = `Bearer ${state.currentUser.token}`;
  }
  return headers;
}

function escapeHtml(text) {
  if (text == null) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function renderMarkdown(text) {
  if (text == null) return '';
  let html = escapeHtml(text);

  const codes = [];
  html = html.replace(/`([^`]+)`/g, (match, code) => {
    codes.push(`<code>${code}</code>`);
    return `___CODE_${codes.length - 1}___`;
  });

  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
  html = html.replace(/~~(.+?)~~/g, '<s>$1</s>');
  html = html.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
  html = html.replace(/\n/g, '<br>');

  html = html.replace(/___CODE_(\d+)___/g, (_, i) => codes[i]);
  return html;
}

// DOM Elements
const elements = {
  authScreen: document.getElementById('auth-screen'),
  app: document.getElementById('app'),
  loginForm: document.getElementById('login-form'),
  registerForm: document.getElementById('register-form'),
  loginEmail: document.getElementById('login-email'),
  loginPassword: document.getElementById('login-password'),
  loginBtn: document.getElementById('login-btn'),
  toRegister: document.getElementById('to-register'),
  registerUsername: document.getElementById('register-username'),
  registerEmail: document.getElementById('register-email'),
  registerPassword: document.getElementById('register-password'),
  registerPasswordConfirm: document.getElementById('register-password-confirm'),
  registerBtn: document.getElementById('register-btn'),
  toLogin: document.getElementById('to-login'),
  currentUserAvatar: document.getElementById('current-user-avatar'),
  currentUserName: document.getElementById('current-user-name'),
  logoutBtn: document.getElementById('logout-btn'),
  navItems: document.querySelectorAll('.nav-item'),
  views: document.querySelectorAll('.view'),
  postInput: document.getElementById('post-input'),
  postBtn: document.getElementById('post-btn'),
  timeline: document.getElementById('timeline'),
  channelItems: document.querySelectorAll('.channel-item'),
  chatMessages: document.getElementById('chat-messages'),
  chatInput: document.getElementById('chat-input'),
  sendChat: document.getElementById('send-chat'),
  currentChannel: document.getElementById('current-channel'),
  callBtn: document.getElementById('call-btn'),
  callModal: document.getElementById('call-modal'),
  closeCall: document.getElementById('close-call'),
  startCall: document.getElementById('start-call'),
  endCall: document.getElementById('end-call'),
  callStatus: document.getElementById('call-status'),
  localVideo: document.getElementById('local-video'),
  remoteVideo: document.getElementById('remote-video'),
  searchInput: document.getElementById('search-input'),
  searchBtn: document.getElementById('search-btn'),
  searchResults: document.getElementById('search-results'),
  channelList: document.getElementById('channel-list'),
  createChannelForm: document.getElementById('create-channel-form'),
  newChannelName: document.getElementById('new-channel-name'),
  menuToggle: document.getElementById('menu-toggle'),
  sidebar: document.getElementById('sidebar'),
  sidebarOverlay: document.getElementById('sidebar-overlay'),
  toast: document.getElementById('toast')
};

// Authentication
function initAuth() {
  // Check if user is already logged in
  const savedUser = localStorage.getItem('tabletalk_current_user');
  if (savedUser) {
    try {
      state.currentUser = JSON.parse(savedUser);
      state.isAuthenticated = true;
      showApp();
    } catch (e) {
      console.error('Failed to restore session', e);
      localStorage.removeItem('tabletalk_current_user');
      showAuth();
    }
  } else {
    showAuth();
  }
  
  // Form switching
  elements.toRegister.addEventListener('click', (e) => {
    e.preventDefault();
    elements.loginForm.classList.add('hidden');
    elements.registerForm.classList.remove('hidden');
  });
  
  elements.toLogin.addEventListener('click', (e) => {
    e.preventDefault();
    elements.registerForm.classList.add('hidden');
    elements.loginForm.classList.remove('hidden');
  });
  
  // Login
  elements.loginBtn.addEventListener('click', login);
  elements.loginPassword.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') login();
  });
  
  // Register
  elements.registerBtn.addEventListener('click', register);
  elements.registerPasswordConfirm.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') register();
  });
  
  // Logout
  elements.logoutBtn.addEventListener('click', logout);
}

async function login() {
  const email = elements.loginEmail.value.trim();
  const password = elements.loginPassword.value;
  
  if (!email || !password) {
    alert('Please fill in all fields');
    return;
  }
  
  try {
    const response = await fetch(`${API_BASE}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    
    const data = await response.json();
    
    if (response.ok) {
      state.currentUser = data;
      state.isAuthenticated = true;
      localStorage.setItem('tabletalk_current_user', JSON.stringify(data));
      
      elements.loginEmail.value = '';
      elements.loginPassword.value = '';
      
      showApp();
    } else {
      alert(data.error || 'Login failed');
    }
  } catch (error) {
    console.error('Login error:', error);
    alert('Connection error');
  }
}

async function register() {
  const username = elements.registerUsername.value.trim();
  const email = elements.registerEmail.value.trim();
  const password = elements.registerPassword.value;
  const passwordConfirm = elements.registerPasswordConfirm.value;
  
  if (!username || !email || !password || !passwordConfirm) {
    alert('Please fill in all fields');
    return;
  }
  
  if (password !== passwordConfirm) {
    alert('Passwords do not match');
    return;
  }
  
  try {
    const response = await fetch(`${API_BASE}/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, email, password })
    });
    
    const data = await response.json();
    
    if (response.ok) {
      state.currentUser = data;
      state.isAuthenticated = true;
      localStorage.setItem('tabletalk_current_user', JSON.stringify(data));
      
      elements.registerUsername.value = '';
      elements.registerEmail.value = '';
      elements.registerPassword.value = '';
      elements.registerPasswordConfirm.value = '';
      
      showApp();
    } else {
      alert(data.error || 'Registration failed');
    }
  } catch (error) {
    console.error('Registration error:', error);
    alert('Connection error');
  }
}

function showAuth() {
  elements.authScreen.classList.remove('hidden');
  elements.app.classList.add('hidden');
}

function showApp() {
  elements.authScreen.classList.add('hidden');
  elements.app.classList.remove('hidden');

  // Update user info in sidebar
  const userInitial = (state.currentUser.username?.charAt(0) || '?').toUpperCase();
  const userHandle = '@' + (state.currentUser.username || 'user');
  elements.currentUserAvatar.textContent = userInitial;
  elements.currentUserName.textContent = userHandle;

  // Update profile header
  document.querySelector('.profile-avatar').textContent = userInitial;
  const profileHeading = document.querySelector('#profile-view h2');
  if (profileHeading) profileHeading.textContent = userHandle;

  // Initialize socket connection
  initSocket();

  if (!state.uiInitialized) {
    // Attach DOM listeners once; data refreshes on subsequent logins
    initNavigation();
    initTimeline();
    initChannels();
    initWebRTC();
    initProfile();
    initSearch();
    initMobileNav();
    state.uiInitialized = true;
  } else {
    loadPosts();
    loadChannels();
  }
}

function logout() {
  // Disconnect socket
  if (state.socket) {
    state.socket.disconnect();
    state.socket = null;
  }
  
  state.currentUser = null;
  state.isAuthenticated = false;
  localStorage.removeItem('tabletalk_current_user');
  
  elements.loginForm.classList.remove('hidden');
  elements.registerForm.classList.add('hidden');
  
  showAuth();
}

// Socket.io connection
function initSocket() {
  state.socket = io(SOCKET_URL);

  state.socket.on('connect', () => {
    console.log('Connected to server');
    state.socket.emit('join_channel', state.currentChannel);
  });

  state.socket.on('new_post', (post) => {
    state.posts.unshift(post);
    renderTimeline();
  });

  state.socket.on('post_liked', (post) => {
    const index = state.posts.findIndex(p => p.id === post.id);
    if (index !== -1) {
      state.posts[index] = post;
      renderTimeline();
    }
  });

  state.socket.on('post_edited', (post) => {
    const index = state.posts.findIndex(p => p.id === post.id);
    if (index !== -1) {
      state.posts[index] = post;
      renderTimeline();
      loadUserPosts();
    }
  });

  state.socket.on('post_deleted', (postId) => {
    state.posts = state.posts.filter(p => p.id !== postId);
    renderTimeline();
    loadUserPosts();
  });

  state.socket.on('post_relettered', ({ id, reletters }) => {
    const post = state.posts.find(p => p.id === id);
    if (post) {
      post.reletters = reletters;
      renderTimeline();
    }
  });

  state.socket.on('new_message', (message) => {
    if (!state.chats[message.channel]) {
      state.chats[message.channel] = [];
    }
    state.chats[message.channel].push(message);
    if (state.currentChannel === message.channel) {
      renderChat();
    }
  });

  state.socket.on('channel_created', (data) => {
    const name = typeof data === 'string' ? data : data?.name;
    if (!name || state.pendingChannel === name || state.channels.includes(name)) return;
    state.channels.push(name);
    state.chats[name] = [];
    renderChannelList();
    showToast(`Channel #${name} created`);
  });

  state.socket.on('disconnect', () => {
    console.log('Disconnected from server');
  });
}

// Navigation
function initNavigation() {
  elements.navItems.forEach(item => {
    item.addEventListener('click', () => {
      const view = item.dataset.view;
      switchView(view);
    });
  });
}

function switchView(viewName) {
  state.currentView = viewName;

  elements.navItems.forEach(item => {
    item.classList.toggle('active', item.dataset.view === viewName);
  });

  elements.views.forEach(view => {
    view.classList.toggle('active', view.id === `${viewName}-view`);
  });

  if (viewName === 'profile') loadUserPosts();
}

// Timeline/Letters
async function initTimeline() {
  elements.postBtn.addEventListener('click', createPost);
  elements.postInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) createPost();
  });
  elements.timeline.addEventListener('click', handleTimelineClick);
  await loadPosts();
}

function handleTimelineClick(e) {
  const actionEl = e.target.closest('.post-action[data-action]');
  if (!actionEl) return;
  const action = actionEl.dataset.action;
  const postId = Number(actionEl.dataset.id);
  if (action === 'like') likePost(postId);
  if (action === 'delete') deletePost(postId);
  if (action === 'reletter') reletterPost(postId);
}

async function loadPosts() {
  try {
    const response = await fetch(`${API_BASE}/posts`);
    const posts = await response.json();
    state.posts = posts;
    renderTimeline();
  } catch (error) {
    console.error('Error loading letters:', error);
  }
}

async function createPost() {
  const content = elements.postInput.value.trim();
  if (!content) return;

  try {
    const response = await fetch(`${API_BASE}/posts`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ content })
    });
    
    if (response.ok) {
      elements.postInput.value = '';
      // Letter will be added via socket event
    } else {
      alert('Failed to create letter');
    }
  } catch (error) {
    console.error('Error creating letter:', error);
    alert('Connection error');
  }
}

function renderTimeline() {
  if (!state.posts.length) {
    elements.timeline.innerHTML = '<p class="empty-state">No letters yet. Start the conversation!</p>';
    return;
  }

  elements.timeline.innerHTML = state.posts.map(post => {
    const avatar = escapeHtml(post.avatar || (post.username?.charAt(0) || '?').toUpperCase());
    const isOwn = post.user_id === state.currentUser?.id;
    const isReletter = post.type === 'reletter';
    const reletterHeader = isReletter ? `<div class="reletter-header">🔁 Reletter from @${escapeHtml(post.original_username || '')}</div>` : '';
    return `
    <div class="post ${isReletter ? 'reletter' : ''}" data-id="${post.id}">
      <div class="post-header">
        <div class="post-avatar">${avatar}</div>
        <div>
          <strong>@${escapeHtml(post.username)}</strong>
          <span style="color: #888; font-size: 12px; margin-left: 8px">${formatTime(new Date(post.created_at))}</span>
        </div>
      </div>
      ${reletterHeader}
      <div class="post-content">${escapeHtml(post.content)}</div>
      <div class="post-actions">
        <span class="post-action" data-action="like" data-id="${post.id}">❤️ ${post.likes}</span>
        <span class="post-action">💬 Reply</span>
        <span class="post-action" data-action="reletter" data-id="${post.id}">🔁 Reletter ${post.reletters || 0}</span>
        ${isOwn ? `<span class="post-action" data-action="delete" data-id="${post.id}">🗑️ Delete</span>` : ''}
      </div>
    </div>
  `}).join('');
}

async function likePost(postId) {
  try {
    const response = await fetch(`${API_BASE}/posts/${postId}/like`, {
      method: 'PUT'
    });

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      alert(data.error || 'Failed to like letter');
    }
  } catch (error) {
    console.error('Error liking letter:', error);
    alert('Connection error');
  }
}

async function deletePost(postId) {
  if (!confirm('Delete this letter?')) return;
  try {
    const response = await fetch(`${API_BASE}/posts/${postId}`, {
      method: 'DELETE',
      headers: authHeaders()
    });

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      alert(data.error || 'Failed to delete letter');
    }
  } catch (error) {
    console.error('Error deleting letter:', error);
    alert('Connection error');
  }
}

async function reletterPost(postId) {
  try {
    const response = await fetch(`${API_BASE}/posts/${postId}/reletter`, {
      method: 'POST',
      headers: authHeaders()
    });

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      alert(data.error || 'Failed to reletter');
    }
  } catch (error) {
    console.error('Error relettering:', error);
    alert('Connection error');
  }
}

// Channels/Chat
async function initChannels() {
  await loadChannels();

  elements.channelList.addEventListener('click', (e) => {
    const item = e.target.closest('.channel-item');
    if (!item) return;
    switchChannel(item.dataset.channel);
  });

  elements.createChannelForm.addEventListener('submit', createChannel);

  elements.sendChat.addEventListener('click', sendChatMessage);
  elements.chatInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendChatMessage();
  });
}

async function loadChannels() {
  try {
    const response = await fetch(`${API_BASE}/channels`);
    state.channels = await response.json();
    state.channels.forEach(c => {
      if (!state.chats[c]) state.chats[c] = [];
    });
    renderChannelList();
  } catch (error) {
    console.error('Error loading channels:', error);
  }
}

function renderChannelList() {
  if (!elements.channelList) return;
  elements.channelList.innerHTML = state.channels.map(channel => `
    <div class="channel-item ${channel === state.currentChannel ? 'active' : ''}" data-channel="${channel}"># ${escapeHtml(channel)}</div>
  `).join('');
}

async function createChannel(e) {
  e.preventDefault();
  const name = elements.newChannelName.value.trim().toLowerCase().replace(/\s+/g, '-');
  if (!name) return;

  state.pendingChannel = name;
  try {
    const response = await fetch(`${API_BASE}/channels`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ name })
    });

    if (response.ok) {
      elements.newChannelName.value = '';
      const { name: channel } = await response.json();
      if (!state.channels.includes(channel)) {
        state.channels.push(channel);
        state.chats[channel] = [];
      }
      switchChannel(channel);
      showToast(`Channel #${channel} created`);
    } else {
      const data = await response.json().catch(() => ({}));
      alert(data.error || 'Failed to create channel');
    }
  } catch (error) {
    console.error('Error creating channel:', error);
    alert('Connection error');
  } finally {
    state.pendingChannel = null;
  }
}

async function switchChannel(channelName) {
  state.currentChannel = channelName;

  renderChannelList();

  elements.currentChannel.textContent = `# ${channelName}`;
  elements.chatInput.placeholder = `Message #${channelName}`;

  // Emit socket event to join channel
  if (state.socket) {
    state.socket.emit('join_channel', channelName);
  }

  await loadMessages(channelName);
}

async function loadMessages(channel) {
  try {
    const response = await fetch(`${API_BASE}/messages/${channel}`);
    const messages = await response.json();
    state.chats[channel] = messages;
    renderChat();
  } catch (error) {
    console.error('Error loading messages:', error);
  }
}

async function sendChatMessage() {
  const content = elements.chatInput.value.trim();
  if (!content) return;

  try {
    const response = await fetch(`${API_BASE}/messages`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        channel: state.currentChannel,
        content: content
      })
    });
    
    if (response.ok) {
      elements.chatInput.value = '';
      // Message will be added via socket event
    } else {
      alert('Failed to send message');
    }
  } catch (error) {
    console.error('Error sending message:', error);
    alert('Connection error');
  }
}

function renderChat() {
  const messages = state.chats[state.currentChannel] || [];
  elements.chatMessages.innerHTML = messages.map(msg => `
    <div class="chat-message">
      <span class="author">@${escapeHtml(msg.username)}</span>
      <span class="markdown-content">${renderMarkdown(msg.content)}</span>
      <span style="color: #888; font-size: 12px; margin-left: 8px">${formatTime(new Date(msg.created_at))}</span>
    </div>
  `).join('');

  elements.chatMessages.scrollTop = elements.chatMessages.scrollHeight;
}

// WebRTC Calling (P2P without signaling server)
function initWebRTC() {
  elements.callBtn.addEventListener('click', () => {
    elements.callModal.classList.remove('hidden');
    elements.callStatus.textContent = 'Ready to start P2P call';
  });
  
  elements.closeCall.addEventListener('click', () => {
    elements.callModal.classList.add('hidden');
    endCall();
  });
  
  elements.startCall.addEventListener('click', createOffer);
  elements.endCall.addEventListener('click', endCall);
}

async function createOffer() {
  try {
    elements.callStatus.textContent = 'Requesting media access...';
    
    // Get local media stream
    state.webRTC.localStream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: true
    });
    
    elements.localVideo.srcObject = state.webRTC.localStream;
    
    // Create peer connection
    const config = {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
      ]
    };
    
    state.webRTC.peerConnection = new RTCPeerConnection(config);
    
    // Add local stream to peer connection
    state.webRTC.localStream.getTracks().forEach(track => {
      state.webRTC.peerConnection.addTrack(track, state.webRTC.localStream);
    });
    
    // Handle remote stream
    state.webRTC.peerConnection.ontrack = (event) => {
      elements.remoteVideo.srcObject = event.streams[0];
    };
    
    // Handle ICE candidates
    state.webRTC.peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        console.log('ICE Candidate:', event.candidate);
      }
    };
    
    // Create offer
    const offer = await state.webRTC.peerConnection.createOffer();
    await state.webRTC.peerConnection.setLocalDescription(offer);
    
    elements.callStatus.textContent = 'Copy this offer and send to peer:';
    
    // Show offer in a prompt for manual copy
    const offerText = JSON.stringify(offer);
    prompt('Copy this offer and send it to your peer:', offerText);
    
    // Wait for answer
    const answerText = prompt('Paste the answer from your peer:');
    if (answerText) {
      const answer = JSON.parse(answerText);
      await state.webRTC.peerConnection.setRemoteDescription(answer);
      elements.callStatus.textContent = 'P2P connection established!';
    }
    
  } catch (error) {
    console.error('Error creating offer:', error);
    elements.callStatus.textContent = 'Error: ' + error.message;
  }
}

function endCall() {
  if (state.webRTC.localStream) {
    state.webRTC.localStream.getTracks().forEach(track => track.stop());
  }
  
  if (state.webRTC.peerConnection) {
    state.webRTC.peerConnection.close();
    state.webRTC.peerConnection = null;
  }
  
  state.webRTC.localStream = null;
  state.webRTC.remoteStream = null;
  
  elements.localVideo.srcObject = null;
  elements.remoteVideo.srcObject = null;
  elements.callStatus.textContent = 'Ready to start P2P call';
}

// Utility Functions
function formatTime(date) {
  const now = new Date();
  const diff = now - date;
  
  if (diff < 60000) return 'just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return date.toLocaleDateString();
}

// Profile
async function initProfile() {
  await loadUserPosts();
}

async function loadUserPosts() {
  const userPosts = document.getElementById('user-posts');
  try {
    if (!state.currentUser?.id) {
      userPosts.innerHTML = '<p class="empty-state">No user data available.</p>';
      return;
    }
    const response = await fetch(`${API_BASE}/users/${state.currentUser.id}/posts`);
    if (!response.ok) throw new Error('Failed to load user letters');
    const posts = await response.json();
    if (!posts.length) {
      userPosts.innerHTML = '<p class="empty-state">No letters yet.</p>';
      return;
    }
    userPosts.innerHTML = posts.map(post => {
      const avatar = escapeHtml(post.avatar || (post.username?.charAt(0) || '?').toUpperCase());
      const isReletter = post.type === 'reletter';
      const reletterHeader = isReletter ? `<div class="reletter-header">🔁 Reletter from @${escapeHtml(post.original_username || '')}</div>` : '';
      return `
      <div class="post ${isReletter ? 'reletter' : ''}">
        <div class="post-header">
          <div class="post-avatar">${avatar}</div>
          <div>
            <strong>@${escapeHtml(post.username)}</strong>
            <span style="color: #888; font-size: 12px; margin-left: 8px">${formatTime(new Date(post.created_at))}</span>
          </div>
        </div>
        ${reletterHeader}
        <div class="post-content">${escapeHtml(post.content)}</div>
        <div class="post-actions">
          <span class="post-action">❤️ ${post.likes}</span>
        </div>
      </div>
    `}).join('');
  } catch (error) {
    console.error('Error loading user letters:', error);
  }
}

// Search
function initSearch() {
  elements.searchBtn.addEventListener('click', performSearch);
  elements.searchInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') performSearch();
  });
}

async function performSearch() {
  const q = elements.searchInput.value.trim();
  if (!q) {
    elements.searchResults.innerHTML = '<p class="empty-state">Enter a keyword to search.</p>';
    return;
  }

  try {
    const response = await fetch(`${API_BASE}/search?q=${encodeURIComponent(q)}`);
    if (!response.ok) throw new Error('Search failed');
    const data = await response.json();
    renderSearchResults(data, q);
  } catch (error) {
    console.error('Search error:', error);
    elements.searchResults.innerHTML = '<p class="empty-state">Search failed. Try again.</p>';
  }
}

function renderSearchResults(data, q) {
  const postResults = data.posts || [];
  const messageResults = data.messages || [];

  let html = '';
  if (!postResults.length && !messageResults.length) {
    html = '<p class="empty-state">No results found.</p>';
  } else {
    if (postResults.length) {
      html += '<h3 class="search-section">Letters</h3>' + postResults.map(post => {
        const avatar = escapeHtml(post.avatar || (post.username?.charAt(0) || '?').toUpperCase());
        return `
        <div class="post">
          <div class="post-header">
            <div class="post-avatar">${avatar}</div>
            <div>
              <strong>@${escapeHtml(post.username)}</strong>
              <span style="color: #888; font-size: 12px; margin-left: 8px">${formatTime(new Date(post.created_at))}</span>
            </div>
          </div>
          <div class="post-content">${escapeHtml(post.content)}</div>
          <div class="post-actions">
            <span class="post-action">❤️ ${post.likes}</span>
          </div>
        </div>
        `;
      }).join('');
    }
    if (messageResults.length) {
      html += '<h3 class="search-section">Messages</h3>' + messageResults.map(msg => `
        <div class="chat-message">
          <span class="author">#${escapeHtml(msg.channel)} @${escapeHtml(msg.username)}</span>
          <span class="markdown-content">${renderMarkdown(msg.content)}</span>
          <span style="color: #888; font-size: 12px; margin-left: 8px">${formatTime(new Date(msg.created_at))}</span>
        </div>
      `).join('');
    }
  }
  elements.searchResults.innerHTML = html;
}

// Mobile navigation
function initMobileNav() {
  if (!elements.menuToggle || !elements.sidebar || !elements.sidebarOverlay) return;

  elements.menuToggle.addEventListener('click', () => {
    elements.sidebar.classList.toggle('open');
    elements.sidebarOverlay.classList.toggle('open');
  });

  elements.sidebarOverlay.addEventListener('click', () => {
    elements.sidebar.classList.remove('open');
    elements.sidebarOverlay.classList.remove('open');
  });

  elements.navItems.forEach(item => {
    item.addEventListener('click', () => {
      elements.sidebar.classList.remove('open');
      elements.sidebarOverlay.classList.remove('open');
    });
  });
}

// Toast notifications
function showToast(message, duration = 3000) {
  if (!elements.toast) return;
  elements.toast.textContent = message;
  elements.toast.classList.remove('hidden');
  setTimeout(() => {
    elements.toast.classList.add('hidden');
  }, duration);
}

// Initialize App
function init() {
  // Initialize authentication first; showApp will set up the rest after login
  initAuth();

  console.log('TableTalk initialized successfully');
}

// Start the app when DOM is ready
window.addEventListener('DOMContentLoaded', init);
