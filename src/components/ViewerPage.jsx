import { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import Chat from '../chat/Chat';
import config from '../config';
import { getRTCConfig } from '../utils/rtcConfig';

const ViewerPage = () => {
  const [username, setUsername] = useState(() => localStorage.getItem('viewerName') || '');
  const [isJoined, setIsJoined] = useState(false);
  const [messages, setMessages] = useState([]);
  const [connectionStatus, setConnectionStatus] = useState('disconnected'); // 'connected', 'disconnected', 'connecting'
  const [error, setError] = useState(null);
  const socketRef = useRef(null);
  const videoRef = useRef(null);
  const peerConnectionRef = useRef(null);

  const handleJoin = (e) => {
    e.preventDefault();
    if (username.trim()) {
      localStorage.setItem('viewerName', username);
      setIsJoined(true);
    }
  };

  const handleSendMessage = (message) => {
    if (socketRef.current && message.trim()) {
      const messageData = {
        username,
        message: message.trim(),
        timestamp: new Date().toISOString(),
        id: Math.random().toString(36).substr(2, 9)
      };
      socketRef.current.emit('chat:message', messageData);
    }
  };

  const handleReconnect = async () => {
    try {
      setConnectionStatus('connecting');
      setError(null);

      // Close existing connections
      if (peerConnectionRef.current) {
        peerConnectionRef.current.close();
        peerConnectionRef.current = null;
      }
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }

      // Clear video
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }

      // Reinitialize socket connection
      socketRef.current = io(config.API_URL, config.SOCKET_CONFIG);
      
      // Set up socket event listeners
      setupSocketListeners();
      
      // Socket will automatically try to connect
      socketRef.current.connect();

    } catch (error) {
      console.error('Reconnection failed:', error);
      setError('Failed to reconnect. Please try again.');
      setConnectionStatus('disconnected');
    }
  };

  const setupSocketListeners = () => {
    if (!socketRef.current) return;

    socketRef.current.on('connect', () => {
      console.log('Connected to server');
      socketRef.current.emit('viewer:join', username);
    });

    socketRef.current.on('chat:message', (msg) => {
      setMessages(prev => {
        if (prev.some(m => m.id === msg.id)) return prev;
        return [...prev.slice(-99), msg];
      });
    });

    socketRef.current.on('chat:history', (history) => {
      if (Array.isArray(history)) {
        setMessages(history);
      }
    });

    socketRef.current.on('stream-available', async ({ streamerId }) => {
      console.log('Stream is available, streamerId:', streamerId);
      try {
        const pc = await setupPeerConnection();
        
        // Add ICE candidate handler
        pc.onicecandidate = (event) => {
          if (event.candidate) {
            console.log('Viewer sending ICE candidate to streamer');
            socketRef.current.emit('ice-candidate', {
              candidate: event.candidate,
              targetId: streamerId
            });
          }
        };

        // Log negotiation needed events
        pc.onnegotiationneeded = (event) => {
          console.log('Negotiation needed event:', event);
        };

        // Add transceivers before creating offer
        console.log('Adding transceivers...');
        pc.addTransceiver('video', { direction: 'recvonly' });
        pc.addTransceiver('audio', { direction: 'recvonly' });
        
        console.log('Creating offer...');
        const offer = await pc.createOffer({
          offerToReceiveAudio: true,
          offerToReceiveVideo: true
        });
        
        console.log('Setting local description...');
        await pc.setLocalDescription(offer);
        console.log('Local description set successfully');
        
        console.log('Sending offer to streamer:', streamerId);
        socketRef.current.emit('offer', {
          offer: pc.localDescription,
          streamerId
        });
      } catch (error) {
        console.error('Error in stream-available handler:', error);
        setError('Failed to setup video stream. Please try reconnecting.');
      }
    });

    socketRef.current.on('answer', async ({ answer }) => {
      console.log('Received answer from streamer:', answer);
      try {
        if (peerConnectionRef.current) {
          await peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(answer));
          console.log('Set remote description successfully');
        } else {
          console.error('No peer connection available when receiving answer');
        }
      } catch (error) {
        console.error('Error setting remote description:', error);
        setError('Failed to establish video connection. Please try reconnecting.');
      }
    });

    socketRef.current.on('ice-candidate', async ({ candidate }) => {
      console.log('Received ICE candidate');
      try {
        if (peerConnectionRef.current) {
          await peerConnectionRef.current.addIceCandidate(new RTCIceCandidate(candidate));
          console.log('Added ICE candidate successfully');
        }
      } catch (error) {
        console.error('Error adding ICE candidate:', error);
      }
    });

    // Request chat history after connection
    socketRef.current.emit('chat:history');
  };

  const setupPeerConnection = async () => {
    const pc = new RTCPeerConnection(getRTCConfig());
    peerConnectionRef.current = pc;

    // Handle incoming tracks
    pc.ontrack = (event) => {
      console.log('Received track:', event.track.kind);
      if (videoRef.current && event.streams && event.streams[0]) {
        // Store the stream ID to check if it's a new stream
        const currentStreamId = videoRef.current.srcObject?.id;
        const newStreamId = event.streams[0].id;

        // Only set new stream if it's different from current
        if (currentStreamId !== newStreamId) {
          console.log('Setting new video source:', event.streams[0]);
          videoRef.current.srcObject = event.streams[0];
          
          // Wait for loadedmetadata before attempting to play
          videoRef.current.onloadedmetadata = () => {
            console.log('Video metadata loaded, attempting to play');
            const playPromise = videoRef.current.play();
            
            if (playPromise !== undefined) {
              playPromise
                .then(() => {
                  console.log('Video playback started successfully');
                })
                .catch(e => {
                  console.error('Error playing video:', e);
                  if (e.name === 'NotAllowedError') {
                    setError('Autoplay blocked. Please click to play the video.');
                  } else if (e.name === 'AbortError') {
                    console.log('Play request aborted, will retry when media is ready');
                  }
                });
            }
          };

          // Handle video errors
          videoRef.current.onerror = (e) => {
            console.error('Video element error:', e);
            setError('Error loading video stream. Please try reconnecting.');
          };
        }
      }
    };

    // Handle connection state changes
    pc.onconnectionstatechange = () => {
      console.log('Connection state changed:', pc.connectionState);
      switch (pc.connectionState) {
        case 'connected':
          setConnectionStatus('connected');
          setError(null);
          break;
        case 'disconnected':
        case 'failed':
          setConnectionStatus('disconnected');
          setError('Connection lost. Please try reconnecting.');
          break;
        case 'connecting':
          setConnectionStatus('connecting');
          break;
      }
    };

    // Add connection failure handling
    pc.onicecandidateerror = (event) => {
      console.error('ICE candidate error:', event);
    };

    pc.oniceconnectionstatechange = () => {
      console.log('ICE connection state:', pc.iceConnectionState);
      if (pc.iceConnectionState === 'failed') {
        console.log('ICE connection failed, attempting restart...');
        pc.restartIce();
      }
    };

    return pc;
  };

  useEffect(() => {
    if (isJoined) {
      socketRef.current = io(config.API_URL, config.SOCKET_CONFIG);
      setupSocketListeners();

      return () => {
        if (socketRef.current) {
          socketRef.current.disconnect();
        }
        if (peerConnectionRef.current) {
          peerConnectionRef.current.close();
        }
      };
    }
  }, [isJoined, username]);

  if (!isJoined) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-900">
        <form onSubmit={handleJoin} className="bg-gray-800 p-8 rounded-lg shadow-lg">
          <h2 className="text-2xl text-white mb-4">Join Stream</h2>
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Enter your username"
            className="w-full p-2 mb-4 bg-gray-700 text-white rounded"
            required
          />
          <button
            type="submit"
            className="w-full bg-blue-500 text-white p-2 rounded hover:bg-blue-600"
          >
            Join
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="flex flex-col lg:flex-row gap-4 p-4 bg-gray-900 min-h-screen">
      <div className="lg:w-2/3 relative">
        {/* Connection Status Bar */}
        <div className={`absolute top-0 left-0 right-0 p-2 text-white text-center
          ${connectionStatus === 'connected' ? 'bg-green-500' : 
            connectionStatus === 'connecting' ? 'bg-yellow-500' : 'bg-red-500'}`}>
          {connectionStatus === 'connected' ? 'Connected' :
           connectionStatus === 'connecting' ? 'Connecting...' : 'Disconnected'}
        </div>

        {/* Video Container */}
        <div className="relative">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted={false}
            controls
            className="w-full h-[calc(100vh-2rem)] object-contain rounded-lg bg-gray-800"
          />
          {error && error.includes('Autoplay blocked') && (
            <button
              onClick={() => videoRef.current?.play()}
              className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 
                       bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-lg"
            >
              Click to Play Video
            </button>
          )}
        </div>

        {/* Error Message and Reconnect Button */}
        {(connectionStatus === 'disconnected' || error) && (
          <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 text-center">
            {error && (
              <div className="text-red-500 mb-4 bg-gray-800 p-4 rounded-lg">
                {error}
              </div>
            )}
            <button
              onClick={handleReconnect}
              disabled={connectionStatus === 'connecting'}
              className={`px-6 py-3 rounded-lg text-white font-semibold
                ${connectionStatus === 'connecting' 
                  ? 'bg-gray-500 cursor-not-allowed'
                  : 'bg-blue-600 hover:bg-blue-700'}`}
            >
              {connectionStatus === 'connecting' ? (
                <span className="flex items-center">
                  <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Reconnecting...
                </span>
              ) : (
                'Reconnect'
              )}
            </button>
          </div>
        )}
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

export default ViewerPage;
