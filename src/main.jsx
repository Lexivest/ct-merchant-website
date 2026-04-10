import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App.jsx'
import AppFrame from './components/common/AppFrame.jsx'
import GlobalFeedbackProvider from './components/common/GlobalFeedbackProvider.jsx'
import './styles/globals.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter future={{ v7_startTransition: true }}>
      <GlobalFeedbackProvider>
        <AppFrame>
          <App />
        </AppFrame>
      </GlobalFeedbackProvider>
    </BrowserRouter>
  </React.StrictMode>,
)
