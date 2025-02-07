import { useEffect, useRef, useState } from "react";
import { IoMdClose } from "react-icons/io";
import { IoSend } from "react-icons/io5";

const Chat = ({ messages = [], onSendMessage }) => {
  const [newMessage, setNewMessage] = useState("");
  const chatContainerRef = useRef(null);
  const lastMessageRef = useRef(null);

  const profilePics = [
    '😺','🐶','🐯','🦁','🐭','🐞','🪲','🪰','🦟','🪳'
  ];

  const getProfilePic = (username) => {
    if (!username) return '👤'; // Default profile icon
    let hash = 0;
    for (let i = 0; i < username.length; i++) {
      hash = username.charCodeAt(i) + ((hash << 5) - hash);
    }
    return profilePics[Math.abs(hash) % profilePics.length];
  };

  // Scroll to bottom when new messages arrive
  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (newMessage.trim() && typeof onSendMessage === 'function') {
      onSendMessage(newMessage.trim());
      setNewMessage("");
    }
  };

  const getMessageContent = (msg) => {
    // If it's a bot message with text property
    if (msg.text) return msg.text;
    // If it's a bot message with message property
    if (msg.message) return msg.message;
    // If it's a direct string message
    if (typeof msg === 'string') return msg;
    // Default case
    return '';
  };

  const getMessageUsername = (msg) => {
    if (msg.user) return msg.user;
    if (msg.username) return msg.username;
    if (msg.isBot) return 'Bot';
    return 'User';
  };

  return (
    <div className="bg-gray-800 rounded-lg overflow-hidden h-full flex flex-col">
      <div className="p-4 border-b border-gray-700 flex justify-between items-center">
        <h2 className="text-white text-xl font-semibold">Live Chat</h2>
        <IoMdClose className="text-gray-400 hover:text-white cursor-pointer" />
      </div>

      {/* Messages container */}
      <div 
        ref={chatContainerRef}
        className="flex-1 overflow-y-auto p-4 space-y-4"
        style={{ maxHeight: 'calc(100vh - 200px)' }}
      >
        {messages.map((msg, index) => (
          <div
            key={msg.id || index}
            ref={index === messages.length - 1 ? lastMessageRef : null}
            className={`animate-fadeIn ${msg.isBot ? 'opacity-80' : ''}`}
          >
            <div className="flex items-start space-x-2">
              <div 
                className={`w-10 h-8 rounded-full flex items-center justify-center text-white
                  ${msg.isBot ? 'bg-blue-600' : 
                    getMessageUsername(msg) === 'Admin' ? 'bg-red-600' : 'bg-blue-600'}`}
              >
                {msg.profilePic || getProfilePic(getMessageUsername(msg))}
              </div>
              
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline space-x-2">
                  <span 
                    className={`font-medium truncate
                      ${msg.isBot ? 'text-blue-400' : 
                        getMessageUsername(msg) === 'Admin' ? 'text-red-400' : 'text-[rgb(70,136,213)]'}`}
                  >
                    {getMessageUsername(msg)}
                  </span>
                  <span className="text-gray-400 text-xs">
                    {msg.timestamp ? new Date(msg.timestamp).toLocaleTimeString() : new Date().toLocaleTimeString()}
                  </span>
                </div>
                <p className="text-gray-300 break-words mt-1">{getMessageContent(msg)}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Message input */}
      <form onSubmit={handleSubmit} className="p-4 border-t border-gray-700">
        <div className="flex space-x-2">
          <input
            type="text"
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            placeholder="Type a message..."
            className="flex-1 bg-gray-700 text-white rounded px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            type="submit"
            disabled={!newMessage.trim()}
            className="bg-blue-500 text-white rounded px-4 py-2 hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <IoSend />
          </button>
        </div>
      </form>
    </div>
  );
};

export default Chat;
