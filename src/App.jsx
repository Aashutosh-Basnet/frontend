import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import ViewerPage from './components/ViewerPage';
import AdminStreamer from './components/AdminStreamer';
import './App.css';
import AdminDashboard from './components/Admin';

function App() {
  return (
    <Router>
      <div className="min-h-screen bg-gray-900 text-white">
        <Routes>
          <Route path="/" element={<ViewerPage />} />
          <Route path="/admin-streamer" element={<AdminStreamer />} />
          <Route path = "/admin/admin-tester/12345" element={<AdminDashboard/>}/>
        </Routes>
      </div>
    </Router>
  );
}

export default App;