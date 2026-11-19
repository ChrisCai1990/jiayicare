import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

if (navigator.userAgent.includes('JiayiCareStaffAndroid/')) {
  document.documentElement.classList.add('staff-android-app')
}


ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
