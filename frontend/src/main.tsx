import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'
import { getTheme, getLanguage } from './store/appStore'
import { I18nProvider } from './i18n/context'
import { startSyncQueue } from './services/syncQueue'

const savedTheme = getTheme();
document.documentElement.classList.toggle('dark', savedTheme === 'dark');
const lang = getLanguage();
document.documentElement.setAttribute('lang', lang);
document.documentElement.setAttribute('dir', lang === 'en' ? 'ltr' : 'rtl');
startSyncQueue();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <I18nProvider>
      <App />
    </I18nProvider>
  </React.StrictMode>,
)
