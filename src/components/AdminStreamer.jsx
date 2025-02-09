import { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import Chat from '../chat/Chat';
import config from '../config';

const AdminStreamer = () => {
  const [messages, setMessages] = useState([]);
  const [streamError, setStreamError] = useState('');
  const [viewerStats, setViewerStats] = useState({ count: 0, viewers: [] });
  const [isVideoEnabled, setIsVideoEnabled] = useState(false);
  const [isAudioEnabled, setIsAudioEnabled] = useState(false);

  const socketRef = useRef(null);
  const mediaStreamRef = useRef(null);
  const peerConnectionsRef = useRef({});
  const videoRef = useRef(null);

  useEffect(() => {
    // Connect directly to socket
    initializeSocket();
    
    return () => {
      // Cleanup
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach(track => track.stop());
      }
      Object.values(peerConnectionsRef.current).forEach(pc => pc.close());
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
    };
  }, []);

  const initializeSocket = () => {
    console.log('Initializing socket connection...', config.API_URL);
    const socket = io(config.API_URL, {
      ...config.SOCKET_CONFIG,
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });

    socket.on('connect', () => {
      console.log('Successfully connected to server with ID:', socket.id);
      socket.emit('stream:start');
    });

    socket.on('connect_error', (error) => {
      console.error('Socket connection error:', error);
      setStreamError(`Connection error: ${error.message}`);
    });

    socket.on('disconnect', (reason) => {
      console.log('Disconnected from server:', reason);
      setStreamError(`Disconnected: ${reason}`);
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
            console.log(`Connection state for viewer ${viewerId}:, pc.connectionState`);
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

    socketRef.current = socket;
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
          initializeSocket();
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
          initializeSocket();
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

  return (
    <div className="flex flex-col h-screen bg-gray-900 text-white">
      <div className="flex-1 p-4">
        <div className="relative">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="w-full max-h-[80vh] bg-black"
          />
          <div className="absolute bottom-4 left-4 space-x-4">
            <button onClick={toggleVideo}>
              {isVideoEnabled ? 'Disable Video' : 'Enable Video'}
            </button>
            <button onClick={toggleAudio}>
              {isAudioEnabled ? 'Disable Audio' : 'Enable Audio'}
            </button>
          </div>
        </div>
        <div className="mt-4">
          <p>Viewers: {viewerStats.count}</p>
          {streamError && <p className="text-red-500">{streamError}</p>}
        </div>
      </div>
      <Chat messages={messages} onSendMessage={handleSendMessage} />
    </div>
  );
};

export default AdminStreamer;