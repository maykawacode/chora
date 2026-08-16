import React from 'react'
import ReactDOM from 'react-dom/client'
import { MapApp } from './MapApp'
import { applyUiTheme } from './design/theme'
import './styles/global.css'

applyUiTheme()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <MapApp />
  </React.StrictMode>
)
