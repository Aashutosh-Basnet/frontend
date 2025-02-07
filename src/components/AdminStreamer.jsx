import { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import Chat from '../chat/Chat';
import config from '../config';

const AdminStreamer = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState([]);
  const [streamError, setStreamError] = useState('');
  const [viewerStats, setViewerStats] = useState({ count: 0, viewers: [] });
  const [isVideoEnabled, setIsVideoEnabled] = useState(false);
  const [isAudioEnabled, setIsAudioEnabled] = useState(false);
  const socketRef = useRef(null);
  const mediaStreamRef = useRef(null);
  const videoRef = useRef(null);
  const peerConnectionsRef = useRef({});

  useEffect(() => {
    // Check if we have a token
    const token = localStorage.getItem('adminToken');
    if (token) {
      verifyToken(token);
    }
  }, []);

  const verifyToken = async (token) => {
    try {
      const response = await fetch(`${config.API_URL}/api/admin/verify`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (response.ok) {
        setIsAuthenticated(true);
        initializeSocket(token);
      } else {
        localStorage.removeItem('adminToken');
        setIsAuthenticated(false);
      }
    } catch (err) {
      console.error('Token verification failed:', err);
      localStorage.removeItem('adminToken');
      setIsAuthenticated(false);
    }
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const response = await fetch(`${config.API_URL}/api/admin/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ username, password })
      });

      const data = await response.json();

      if (response.ok) {
        localStorage.setItem('adminToken', data.token);
        setIsAuthenticated(true);
        initializeSocket(data.token);
      } else {
        setError(data.error || 'Login failed');
      }
    } catch (err) {
      setError('Failed to connect to server');
      console.error('Login error:', err);
    } finally {
      setLoading(false);
    }
  };

  const initializeSocket = (token) => {
    console.log('Initializing socket connection...');
    const socket = io(config.API_URL, {
      ...config.SOCKET_CONFIG,
      auth: { token }
    });

    socket.on('connect', () => {
      console.log('Connected to server');
      socket.emit('streamer:join');
    });

    socket.on('connect_error', (error) => {
      console.error('Socket connection error:', error);
      if (error.message === 'Invalid token') {
        setIsAuthenticated(false);
        localStorage.removeItem('adminToken');
      }
    });

    socket.on('connect', () => {
      console.log('Connected to server with ID:', socket.id);
      if (mediaStreamRef.current) {
        console.log('Emitting stream:start on connect...');
        socket.emit('stream:start');
      }
    });

    socket.on('connect_error', (error) => {
      console.error('Socket connection error:', error);
      setStreamError('Failed to connect to server. Please try again.');
    });

    socket.on('disconnect', (reason) => {
      console.log('Disconnected from server:', reason);
    });

    // Handle chat messages
    socket.on('chat:message', (msg) => {
      setMessages(prev => {
        if (prev.some(m => m.id === msg.id)) return prev;
        return [...prev.slice(-99), msg];
      });
    });

    // Request chat history
    socket.emit('chat:history');
    socket.on('chat:history', (history) => {
      if (Array.isArray(history)) {
        setMessages(history);
      }
    });

    // Handle viewer offers
    socket.on('offer', async ({ offer, viewerId }) => {
      try {
        let pc = peerConnectionsRef.current[viewerId];
        if (!pc) {
          pc = new RTCPeerConnection({
            iceServers: [
              { urls: 'stun:stun.l.google.com:19302' },
              { urls: 'stun:stun1.l.google.com:19302' }
            ]
          });
          peerConnectionsRef.current[viewerId] = pc;

          // Add local stream
          if (mediaStreamRef.current) {
            mediaStreamRef.current.getTracks().forEach(track => {
              pc.addTrack(track, mediaStreamRef.current);
            });
          }

          pc.onicecandidate = (event) => {
            if (event.candidate) {
              socket.emit('ice-candidate', {
                candidate: event.candidate,
                targetId: viewerId
              });
            }
          };

          pc.onconnectionstatechange = () => {
            console.log(`Connection state for viewer ${viewerId}:`, pc.connectionState);
          };
        }

        await pc.setRemoteDescription(new RTCSessionDescription(offer));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);

        socket.emit('answer', { answer, viewerId });
      } catch (error) {
        console.error('Error handling offer:', error);
      }
    });

    // Handle ICE candidates
    socket.on('ice-candidate', async ({ candidate, viewerId }) => {
      try {
        const pc = peerConnectionsRef.current[viewerId];
        if (pc) {
          await pc.addIceCandidate(new RTCIceCandidate(candidate));
        }
      } catch (error) {
        console.error('Error adding ICE candidate:', error);
      }
    });

    // Handle viewer stats
    socket.on('viewers:update', (stats) => {
      setViewerStats(stats);
    });

    // Store socket reference
    socketRef.current = socket;

    // Cleanup function
    return () => {
      console.log('Cleaning up socket connection...');
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach(track => {
          console.log('Stopping track:', track.kind);
          track.stop();
        });
        mediaStreamRef.current = null;
      }
      
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }

      Object.values(peerConnectionsRef.current).forEach(pc => {
        pc.close();
      });
      peerConnectionsRef.current = {};
      
      if (socket) {
        socket.removeAllListeners();
        socket.disconnect();
      }
    };
  };

  const toggleVideo = async () => {
    try {
      if (!mediaStreamRef.current) {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 1920 },
            height: { ideal: 1080 },
            frameRate: { ideal: 30 }
          },
          audio: isAudioEnabled
        });
        
        mediaStreamRef.current = stream;
        videoRef.current.srcObject = stream;
        setIsVideoEnabled(true);

        // Update all existing peer connections with the new stream
        Object.values(peerConnectionsRef.current).forEach(pc => {
          stream.getTracks().forEach(track => {
            pc.addTrack(track, stream);
          });
        });

        if (!socketRef.current) {
          initializeSocket(localStorage.getItem('adminToken'));
        }
        socketRef.current.emit('stream:start');
      } else {
        const videoTrack = mediaStreamRef.current.getVideoTracks()[0];
        if (videoTrack) {
          videoTrack.enabled = !videoTrack.enabled;
          setIsVideoEnabled(videoTrack.enabled);
        }
      }
    } catch (error) {
      console.error('Error accessing camera:', error);
      alert('Failed to access camera. Please check permissions.');
    }
  };

  const toggleAudio = async () => {
    if (!mediaStreamRef.current) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: isVideoEnabled,
          audio: true
        });
        mediaStreamRef.current = stream;
        videoRef.current.srcObject = stream;
        setIsAudioEnabled(true);
        
        if (!socketRef.current) {
          initializeSocket(localStorage.getItem('adminToken'));
        }
        socketRef.current.emit('stream:start');
      } catch (error) {
        console.error('Error accessing microphone:', error);
        alert('Failed to access microphone. Please check permissions.');
        return;
      }
    } else {
      const audioTrack = mediaStreamRef.current.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setIsAudioEnabled(audioTrack.enabled);
      }
    }
  };

  const handleSendMessage = (message) => {
    if (!socketRef.current || !message.trim()) return;

    const messageData = {
      username: 'Admin',
      message: message.trim(),
      timestamp: new Date().toISOString(),
      id: Math.random().toString(36).substr(2, 9)
    };

    socketRef.current.emit('chat:message', messageData);
  };

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-900">
        <div className="bg-gray-800 p-8 rounded-lg shadow-lg w-96">
          <h2 className="text-2xl font-bold text-white mb-6">Admin Login</h2>
          {error && (
            <div className="bg-red-500 text-white p-3 rounded mb-4">
              {error}
            </div>
          )}
          <form onSubmit={handleLogin}>
            <div className="mb-4">
              <label className="block text-gray-300 mb-2" htmlFor="username">
                Username
              </label>
              <input
                id="username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full p-2 rounded bg-gray-700 text-white border border-gray-600 focus:border-blue-500 focus:outline-none"
                required
              />
            </div>
            <div className="mb-6">
              <label className="block text-gray-300 mb-2" htmlFor="password">
                Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full p-2 rounded bg-gray-700 text-white border border-gray-600 focus:border-blue-500 focus:outline-none"
                required
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className={`w-full py-2 px-4 rounded ${
                loading
                  ? 'bg-blue-700 cursor-not-allowed'
                  : 'bg-blue-600 hover:bg-blue-700'
              } text-white font-semibold focus:outline-none`}
            >
              {loading ? 'Logging in...' : 'Login'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col lg:flex-row gap-4 p-4 bg-gray-900 min-h-screen">
      <div className="lg:w-2/3">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="w-full h-[calc(100vh-2rem)] object-contain rounded-lg bg-gray-800"
        />
        <div className="flex gap-4 mt-4">
          <button
            onClick={toggleVideo}
            className={`px-4 py-2 rounded ${
              isVideoEnabled ? 'bg-red-500' : 'bg-green-500'
            } text-white`}
          >
            {isVideoEnabled ? 'Stop Video' : 'Start Video'}
          </button>
          <button
            onClick={toggleAudio}
            className={`px-4 py-2 rounded ${
              isAudioEnabled ? 'bg-red-500' : 'bg-green-500'
            } text-white`}
          >
            {isAudioEnabled ? 'Mute Audio' : 'Unmute Audio'}
          </button>
        </div>
        
        <div className="mt-4 bg-gray-800 p-4 rounded-lg">
          <h3 className="text-white text-lg mb-2">Viewers: {viewerStats.count}</h3>
          <div className="grid grid-cols-2 gap-2">
            {viewerStats.viewers.slice(0, 50).map((viewer, index) => (
              <div key={index} className="text-gray-300 text-sm">
                {viewer.username} ({viewer.country})
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="lg:w-1/3">
        <Chat
          messages={messages}
          onSendMessage={handleSendMessage}
        />
      </div>
    </div>
  );
};

export default AdminStreamer;
