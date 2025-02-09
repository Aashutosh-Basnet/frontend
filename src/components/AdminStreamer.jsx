import { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import Chat from '../chat/Chat';
import config from '../config';

const AdminStreamer = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [messages, setMessages] = useState([]);
  const [viewerStats, setViewerStats] = useState({ count: 0, viewers: [] });
  const [isVideoEnabled, setIsVideoEnabled] = useState(false);
  const [isAudioEnabled, setIsAudioEnabled] = useState(false);
  const socketRef = useRef(null);
  const mediaStreamRef = useRef(null);
  const videoRef = useRef(null);

  const handleLogin = (e) => {
    e.preventDefault();
    setError('');

    if (username === 'admin' && password === 'password123') {
      setIsAuthenticated(true);
      initializeSocket();
    } else {
      setError('Invalid username or password');
    }
  };

  const initializeSocket = () => {
    console.log('Initializing socket connection...');
    const socket = io(config.API_URL, config.SOCKET_CONFIG);
    
    socket.on('connect', () => {
      console.log('Connected to server');
      socket.emit('streamer:join');
    });
    
    socket.on('chat:message', (msg) => {
      setMessages(prev => [...prev.slice(-99), msg]);
    });
    
    socket.emit('chat:history');
    socket.on('chat:history', (history) => setMessages(history || []));
    
    socket.on('viewers:update', (stats) => setViewerStats(stats));
    
    socketRef.current = socket;
  };

  const toggleVideo = async () => {
    try {
      if (!mediaStreamRef.current) {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: isAudioEnabled });
        mediaStreamRef.current = stream;
        videoRef.current.srcObject = stream;
        setIsVideoEnabled(true);
        socketRef.current?.emit('stream:start');
      } else {
        const videoTrack = mediaStreamRef.current.getVideoTracks()[0];
        videoTrack.enabled = !videoTrack.enabled;
        setIsVideoEnabled(videoTrack.enabled);
      }
    } catch (error) {
      alert('Failed to access camera. Please check permissions.');
    }
  };

  const toggleAudio = async () => {
    if (!mediaStreamRef.current) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: isVideoEnabled, audio: true });
        mediaStreamRef.current = stream;
        videoRef.current.srcObject = stream;
        setIsAudioEnabled(true);
        socketRef.current?.emit('stream:start');
      } catch (error) {
        alert('Failed to access microphone. Please check permissions.');
      }
    } else {
      const audioTrack = mediaStreamRef.current.getAudioTracks()[0];
      audioTrack.enabled = !audioTrack.enabled;
      setIsAudioEnabled(audioTrack.enabled);
    }
  };

  const handleSendMessage = (message) => {
    if (!socketRef.current || !message.trim()) return;
    socketRef.current.emit('chat:message', { username: 'Admin', message, timestamp: new Date().toISOString() });
  };

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-900">
        <div className="bg-gray-800 p-8 rounded-lg shadow-lg w-96">
          <h2 className="text-2xl font-bold text-white mb-6">Admin Login</h2>
          {error && <div className="bg-red-500 text-white p-3 rounded mb-4">{error}</div>}
          <form onSubmit={handleLogin}>
            <div className="mb-4">
              <label className="block text-gray-300 mb-2">Username</label>
              <input type="text" value={username} onChange={(e) => setUsername(e.target.value)} className="w-full p-2 rounded bg-gray-700 text-white" required />
            </div>
            <div className="mb-6">
              <label className="block text-gray-300 mb-2">Password</label>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="w-full p-2 rounded bg-gray-700 text-white" required />
            </div>
            <button type="submit" className="w-full py-2 px-4 rounded bg-blue-600 text-white">Login</button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col lg:flex-row gap-4 p-4 bg-gray-900 min-h-screen">
      <div className="lg:w-2/3">
        <video ref={videoRef} autoPlay playsInline muted className="w-full h-[calc(100vh-2rem)] object-contain rounded-lg bg-gray-800" />
        <div className="flex gap-4 mt-4">
          <button onClick={toggleVideo} className={`px-4 py-2 rounded ${isVideoEnabled ? 'bg-red-500' : 'bg-green-500'} text-white`}>{isVideoEnabled ? 'Stop Video' : 'Start Video'}</button>
          <button onClick={toggleAudio} className={`px-4 py-2 rounded ${isAudioEnabled ? 'bg-red-500' : 'bg-green-500'} text-white`}>{isAudioEnabled ? 'Mute Audio' : 'Unmute Audio'}</button>
        </div>
        <div className="mt-4 bg-gray-800 p-4 rounded-lg">
          <h3 className="text-white text-lg mb-2">Viewers: {viewerStats.count}</h3>
        </div>
      </div>
      <div className="lg:w-1/3">
        <Chat messages={messages} onSendMessage={handleSendMessage} />
      </div>
    </div>
  );
};

export default AdminStreamer;
