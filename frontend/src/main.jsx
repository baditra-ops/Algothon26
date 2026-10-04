import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import syncManager from './sync/syncManager.js'

// Initialize synchronization manager (triggers startup sync if online)
syncManager.init();

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
