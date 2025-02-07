import { useState, useEffect, useRef } from "react";
import { io } from "socket.io-client";
import ViewerPage from "./ViewerPage";

const API_URL = "http://localhost:3001/api/constants"; // Change for production
const SOCKET_URL = "http://localhost:3001"; // Change for production

const AdminDashboard = () => {
  const [botNames, setBotNames] = useState([]); 
  const [profilePics, setProfilePics] = useState([]); 
  const [messageTemplates, setMessageTemplates] = useState([]); 
  const [reactions, setReactions] = useState([]); 
  const [botMessages, setBotMessages] = useState([]); 
  const [isRecording, setIsRecording] = useState(false);
  const [recordedBlob, setRecordedBlob] = useState(null);

  const [newBotName, setNewBotName] = useState("");
  const [newMessage, setNewMessage] = useState("");
  const [newReaction, setNewReaction] = useState("");

  const [viewerCount, setViewerCount] = useState(0);
  const [viewerList, setViewerList] = useState([]);
  const socketRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);
  const streamRef = useRef(null);

  const startRecording = async () => {
    try {
      // Find the video element
      const videoElement = document.querySelector('video');
      if (!videoElement) {
        throw new Error('No video element found to record');
      }

      // Wait for video metadata to load
      if (videoElement.videoWidth === 0) {
        await new Promise((resolve) => {
          videoElement.onloadedmetadata = resolve;
        });
      }

      // Create a MediaStream from the video element
      const stream = videoElement.captureStream();
      streamRef.current = stream;
      console.log('Stream created:', stream.getTracks().length, 'tracks');

      // Try different MIME types
      const mimeTypes = [
        'video/webm;codecs=vp8,opus',
        'video/webm;codecs=vp9,opus',
        'video/webm;codecs=h264,opus',
        'video/webm'
      ];

      let selectedMimeType = mimeTypes.find(type => MediaRecorder.isTypeSupported(type));
      if (!selectedMimeType) {
        throw new Error('No supported MIME type found for recording');
      }

      console.log('Using MIME type:', selectedMimeType);

      // Create MediaRecorder
      mediaRecorderRef.current = new MediaRecorder(stream, {
        mimeType: selectedMimeType,
        videoBitsPerSecond: 2500000 // 2.5 Mbps
      });

      chunksRef.current = [];

      mediaRecorderRef.current.ondataavailable = (event) => {
        console.log('Data available event:', event.data.size, 'bytes');
        if (event.data && event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      mediaRecorderRef.current.onstart = () => {
        console.log('MediaRecorder started');
        chunksRef.current = [];
      };

      mediaRecorderRef.current.onstop = () => {
        console.log('MediaRecorder stopped');
        if (chunksRef.current.length > 0) {
          const blob = new Blob(chunksRef.current, { type: selectedMimeType });
          console.log('Recording completed:', blob.size, 'bytes');
          setRecordedBlob(blob);
        } else {
          console.error('No data chunks recorded');
        }
      };

      // Start recording
      mediaRecorderRef.current.start(100); // Collect data every 100ms
      setIsRecording(true);
      console.log('Recording started');

    } catch (error) {
      console.error('Error starting recording:', error);
      alert('Error starting recording: ' + error.message);
    }
  };

  const stopRecording = () => {
    console.log('Stopping recording...');
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      
      // Stop all tracks
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => {
          track.stop();
          console.log('Track stopped:', track.kind);
        });
      }
    }
  };

  const downloadRecording = () => {
    if (recordedBlob && recordedBlob.size > 0) {
      const url = URL.createObjectURL(recordedBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `stream-recording-${new Date().toISOString()}.webm`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      console.log('Downloading recording:', recordedBlob.size, 'bytes');
    } else {
      alert('No recording data available to download');
    }
  };

  // Clean up function
  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  useEffect(() => {
    console.log("Admin Dashboard: Connecting to WebSocket...");

    const socket = io(SOCKET_URL, {
      transports: ["websocket", "polling"],
      path: "/socket.io/", // Ensure this matches your backend
    });

    socket.on("connect", () => {
      console.log("Admin connected to WebSocket.");
    });

    // 🔥 Listen for viewer updates
    socket.on("viewers:update", (data) => {
      console.log("Received viewer count update:", data);
      setViewerCount(data.count);
      setViewerList(data.viewers);
    });

    socket.on("disconnect", () => {
      console.log("Disconnected from WebSocket.");
    });

    // Store the socket reference
    socketRef.current = socket;

    return () => {
      console.log("Admin Dashboard: Cleaning up WebSocket connection...");
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
    };
  }, []);

  // 🔥 Fetch Constants
  useEffect(() => {
    fetch(API_URL)
      .then((res) => res.json())
      .then((data) => {
        setBotNames(Array.isArray(data.botNames) ? data.botNames : []);
        setProfilePics(Array.isArray(data.profilePics) ? data.profilePics : []);
        setMessageTemplates(Array.isArray(data.messageTemplates) ? data.messageTemplates : []);
        setReactions(Array.isArray(data.reactions) ? data.reactions : []);
        setBotMessages(Array.isArray(data.botMessages) ? data.botMessages : []);
      })
      .catch((err) => {
        console.error("Error fetching constants:", err);
        // Set empty arrays on error
        setBotNames([]);
        setProfilePics([]);
        setMessageTemplates([]);
        setReactions([]);
        setBotMessages([]);
      });
  }, []);

  // 🔥 Update Constants
  const updateConstants = async (type, data) => {
    try {
        const response = await fetch("http://localhost:3001/api/constants", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ type, data })
        });

        if (!response.ok) throw new Error("Failed to update constants");

        const responseData = await response.json();
        console.log("Update success:", responseData);

        if (responseData.success) {
            // Update local state based on type
            switch(type) {
                case "botNames":
                    setBotNames(responseData.data || []);
                    break;
                case "messageTemplates":
                    setMessageTemplates(responseData.data || []);
                    break;
                case "reactions":
                    setReactions(responseData.data || []);
                    break;
                case "botMessages":
                    setBotMessages(responseData.data || []);
                    break;
            }
        }
    } catch (error) {
        console.error("Error updating constants:", error);
    }
};

  // 🔥 Update Comment
  const updateComment = async (commentId, updatedComment) => {
    try {
      const response = await fetch("http://localhost:3001/api/comments/update", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ commentId, updatedComment })
      });

      if (!response.ok) {
        throw new Error("Failed to update comment");
      }

      const data = await response.json();
      console.log("Comment update success:", data);
      
      // Optionally refresh your comments list here if you maintain one in state
      // You might want to call your existing fetch function or update the state directly
      
    } catch (error) {
      console.error("Error updating comment:", error);
    }
  };

  // 🔥 Remove Item
  const removeItem = (type, index) => {
    let updatedArray;
    if (type === "botNames") updatedArray = [...botNames];
    if (type === "messageTemplates") updatedArray = [...messageTemplates];
    if (type === "reactions") updatedArray = [...reactions];
    if (type === "botMessages") updatedArray = [...botMessages];

    updatedArray.splice(index, 1); // Remove item at index
    updateConstants(type, updatedArray);
  };

  return (
    <div className="p-6 bg-gray-900 text-white min-h-screen flex flex-col md:flex-row text-sm md:text-2xl">
      <div className="w-full md:w-[30vw] text-sm md:text-lg">
        <h1 className="font-bold mb-4">Admin Dashboard</h1>

        {/* Recording Controls */}
        <div className="bg-gray-800 p-6 rounded-lg shadow-lg mb-4">
          <h2 className="font-semibold mb-4">Stream Recording</h2>
          <div className="flex gap-4">
            {!isRecording ? (
              <button
                onClick={startRecording}
                className="px-4 py-2 bg-red-500 rounded hover:bg-red-600"
              >
                Start Recording
              </button>
            ) : (
              <button
                onClick={stopRecording}
                className="px-4 py-2 bg-gray-500 rounded hover:bg-gray-600"
              >
                Stop Recording
              </button>
            )}
            {recordedBlob && (
              <button
                onClick={downloadRecording}
                className="px-4 py-2 bg-blue-500 rounded hover:bg-blue-600"
              >
                Download Recording
              </button>
            )}
          </div>
        </div>

        <div className="bg-gray-800 p-6 rounded-lg shadow-lg max-h-[20vh] overflow-scroll overflow-x-hidden">
          <h2 className=" font-semibold">Live Viewers: {viewerCount}</h2>
          <ul className="mt-4 space-y-2">
            {viewerList.map((viewer, index) => (
              <li key={index} className="text-gray-300 text-sm">
                {viewer.username} ({viewer.country})
              </li>
            ))}
          </ul>
        </div>


        {/* 🔹 Bot Names Section */}
        <div className="mb-6">
          <h2 className=" font-semibold">Bot Names</h2>
          <ul>
            {botNames.map((name, index) => (
              <li key={index} className="text-gray-300 flex justify-between">
                {name}
                <button onClick={() => removeItem("botNames", index)} className="text-red-500">✖</button>
              </li>
            ))}
          </ul>
          <input
            type="text"
            placeholder="Add bot name"
            value={newBotName}
            onChange={(e) => setNewBotName(e.target.value)}
            className="p-2 bg-gray-800 text-white rounded"
          />
          <button
            onClick={() => {
              if (newBotName.trim()) {
                updateConstants("botNames", [...botNames, newBotName.trim()]);
                setNewBotName("");
              }
            }}
            className="ml-2 px-4 py-2 bg-blue-500 rounded"
          >
            Add
          </button>
        </div>

        {/* 🔹 Message Templates Section */}
        <div className="mb-6">
          <h2 className="font-semibold">Message Templates</h2>
          <ul>
            {messageTemplates.map((msg, index) => (
              <li key={index} className="text-gray-300 flex justify-between">
                {msg}
                <button onClick={() => removeItem("messageTemplates", index)} className="text-red-500">✖</button>
              </li>
            ))}
          </ul>
          <input
            type="text"
            placeholder="Add message"
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            className="p-2 bg-gray-800 text-white rounded"
          />
          <button
            onClick={() => {
              if (newMessage.trim()) {
                updateConstants("messageTemplates", [...messageTemplates, newMessage.trim()]);
                setNewMessage("");
              }
            }}
            className="ml-2 px-4 py-2 bg-green-500 rounded"
          >
            Add
          </button>
        </div>

        {/* 🔹 Reactions Section */}
        <div>
          <h2 className=" font-semibold">Reactions</h2>
          <ul>
            {reactions.map((reaction, index) => (
              <li key={index} className="text-gray-300 flex justify-between">
                {reaction}
                <button onClick={() => removeItem("reactions", index)} className="text-red-500">✖</button>
              </li>
            ))}
          </ul>
          <input
            type="text"
            placeholder="Add reaction (emoji)"
            value={newReaction}
            onChange={(e) => setNewReaction(e.target.value)}
            className="p-2 bg-gray-800 text-white rounded"
          />
          <button
            onClick={() => {
              if (newReaction.trim()) {
                updateConstants("reactions", [...reactions, newReaction.trim()]);
                setNewReaction("");
              }
            }}
            className="ml-2 px-4 py-2 bg-yellow-500 rounded"
          >
            Add
          </button>
        </div>

        {/* 🔹 Bot Messages Section */}
        <div className="mt-6">
          <h2 className=" font-semibold">Bot Messages</h2>
          <ul>
            {botMessages.map((msg, index) => (
              <li key={index} className="text-gray-300 flex justify-between">
                {msg}
                <button onClick={() => removeItem("botMessages", index)} className="text-red-500">✖</button>
              </li>
            ))}
          </ul>
        </div>

      </div>
      <div className="w-full md:w-[60vw] text-sm md: text-lg">
          <ViewerPage />
      </div>
    </div>
  );
};

export default AdminDashboard;
