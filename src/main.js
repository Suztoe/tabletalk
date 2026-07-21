// TableTalk - Lightweight X+Discord-like SNS with P2P WebRTC calling
// Built with Tauri for maximum lightweight performance

const API_BASE = 'http://localhost:3000/api';

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
  webRTC: {
    peerConnection: null,
    localStream: null,
    remoteStream: null
  }
};

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
  remoteVideo: document.getElementById('remote-video')
};

// Authentication
function initAuth() {
  // Check if user is already logged in
  const savedUser = localStorage.getItem('tabletalk_current_user');
  if (savedUser) {
    state.currentUser = JSON.parse(savedUser);
    state.isAuthenticated = true;
    showApp();
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
  elements.currentUserAvatar.textContent = state.currentUser.username.charAt(0).toUpperCase();
  elements.currentUserName.textContent = '@' + state.currentUser.username;
  
  // Initialize socket connection
  initSocket();
  
  // Initialize app features after authentication
  initNavigation();
  initTimeline();
  initChannels();
  initWebRTC();
  initProfile();
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
  state.socket = io('http://localhost:3000');
  
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
  
  state.socket.on('new_message', (message) => {
    if (!state.chats[message.channel]) {
      state.chats[message.channel] = [];
    }
    state.chats[message.channel].push(message);
    if (state.currentChannel === message.channel) {
      renderChat();
    }
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
}

// Timeline/Posts
async function initTimeline() {
  elements.postBtn.addEventListener('click', createPost);
  await loadPosts();
}

async function loadPosts() {
  try {
    const response = await fetch(`${API_BASE}/posts`);
    const posts = await response.json();
    state.posts = posts;
    renderTimeline();
  } catch (error) {
    console.error('Error loading posts:', error);
  }
}

async function createPost() {
  const content = elements.postInput.value.trim();
  if (!content) return;
  
  try {
    const response = await fetch(`${API_BASE}/posts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_id: state.currentUser.id,
        content: content
      })
    });
    
    if (response.ok) {
      elements.postInput.value = '';
      // Post will be added via socket event
    } else {
      alert('Failed to create post');
    }
  } catch (error) {
    console.error('Error creating post:', error);
    alert('Connection error');
  }
}

function renderTimeline() {
  elements.timeline.innerHTML = state.posts.map(post => `
    <div class="post">
      <div class="post-header">
        <div class="post-avatar">${post.avatar}</div>
        <div>
          <strong>@${post.username}</strong>
          <span style="color: #888; font-size: 12px; margin-left: 8px">${formatTime(new Date(post.created_at))}</span>
        </div>
      </div>
      <div class="post-content">${post.content}</div>
      <div class="post-actions">
        <span class="post-action" onclick="likePost(${post.id})">❤️ ${post.likes}</span>
        <span class="post-action">💬 Reply</span>
        <span class="post-action">🔄 Share</span>
      </div>
    </div>
  `).join('');
}

async function likePost(postId) {
  try {
    const response = await fetch(`${API_BASE}/posts/${postId}/like`, {
      method: 'PUT'
    });
    
    if (response.ok) {
      // Post will be updated via socket event
    } else {
      alert('Failed to like post');
    }
  } catch (error) {
    console.error('Error liking post:', error);
    alert('Connection error');
  }
}

// Channels/Chat
function initChannels() {
  elements.channelItems.forEach(item => {
    item.addEventListener('click', () => {
      const channel = item.dataset.channel;
      switchChannel(channel);
    });
  });
  
  elements.sendChat.addEventListener('click', sendChatMessage);
  elements.chatInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendChatMessage();
  });
}

async function switchChannel(channelName) {
  state.currentChannel = channelName;
  
  elements.channelItems.forEach(item => {
    item.classList.toggle('active', item.dataset.channel === channelName);
  });
  
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
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_id: state.currentUser.id,
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
      <span class="author">@${msg.username}</span>
      <span>${msg.content}</span>
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
  try {
    const response = await fetch(`${API_BASE}/users/${state.currentUser.id}/posts`);
    const posts = await response.json();
    const userPosts = document.getElementById('user-posts');
    userPosts.innerHTML = posts.map(post => `
      <div class="post">
        <div class="post-header">
          <div class="post-avatar">${post.avatar}</div>
          <div>
            <strong>@${post.username}</strong>
            <span style="color: #888; font-size: 12px; margin-left: 8px">${formatTime(new Date(post.created_at))}</span>
          </div>
        </div>
        <div class="post-content">${post.content}</div>
        <div class="post-actions">
          <span class="post-action">❤️ ${post.likes}</span>
        </div>
      </div>
    `).join('');
  } catch (error) {
    console.error('Error loading user posts:', error);
  }
}

// Initialize App
function init() {
  // Initialize authentication first
  initAuth();
  
  // Initialize app features (only if authenticated)
  if (state.isAuthenticated) {
    initNavigation();
    initTimeline();
    initChannels();
    initWebRTC();
    initProfile();
  }
  
  console.log('TableTalk initialized successfully');
}

// Start the app when DOM is ready
window.addEventListener('DOMContentLoaded', init);
