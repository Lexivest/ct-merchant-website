import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App.jsx'
import AppFrame from './components/common/AppFrame.jsx'
import './styles/globals.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <AppFrame>
        <App />
      </AppFrame>
    </BrowserRouter>
  </React.StrictMode>,
)
