// Determine the API URL based on the current environment
const getApiUrl = () => {
  const currentUrl = window.location.origin;
  const env = import.meta.env.VITE_NODE_ENV || 'development';
  
  // Production environment
  if (env === 'production') {
    return import.meta.env.VITE_API_URL || currentUrl.replace(/:\d+$/, ':3001');
  }
  
  // If we're on a dev tunnel
  if (currentUrl.includes('devtunnels.ms')) {
    return 'https://r4mb4ww9-3001.inc1.devtunnels.ms';
  }
  
  // Local development
  return 'http://localhost:3001';
};

// Socket.IO configuration
const getSocketConfig = () => ({
  transports: ['websocket', 'polling'],
  reconnection: true,
  reconnectionAttempts: parseInt(import.meta.env.VITE_SOCKET_RECONNECTION_ATTEMPTS) || 5,
  reconnectionDelay: parseInt(import.meta.env.VITE_SOCKET_RECONNECTION_DELAY) || 1000,
  reconnectionDelayMax: parseInt(import.meta.env.VITE_SOCKET_RECONNECTION_DELAY_MAX) || 5000,
  timeout: parseInt(import.meta.env.VITE_SOCKET_TIMEOUT) || 20000,
  autoConnect: true,
  path: '/socket.io/',
  forceNew: true,
  secure: import.meta.env.VITE_NODE_ENV === 'production'
});

// App configuration
const config = {
  API_URL: getApiUrl(),
  SOCKET_CONFIG: getSocketConfig(),
  MAX_FILE_SIZE: parseInt(import.meta.env.VITE_MAX_FILE_SIZE) || 10 * 1024 * 1024, // 10MB
  MAX_MESSAGE_LENGTH: parseInt(import.meta.env.VITE_MAX_MESSAGE_LENGTH) || 1000,
  DEFAULT_AVATAR: '/assets/default-avatar.png'
};

// Freeze the configuration to prevent runtime modifications
Object.freeze(config);

export default config;
