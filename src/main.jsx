import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import { SessionGate } from './components/auth/SessionGate.jsx'
import AuthScreens from './components/auth/AuthScreens.jsx'
import AdminInvitations from './components/admin/AdminInvitations.jsx'
import AdminOverview from './components/admin/AdminOverview.jsx'
import AdminEvents from './components/admin/AdminEvents.jsx'
import AdminAccounts from './components/admin/AdminAccounts.jsx'
import ModelSettings from './components/admin/ModelSettings.jsx'
import UsageCosts from './components/admin/UsageCosts.jsx'
import SystemSettings from './components/admin/SystemSettings.jsx'
import './styles.css'
import './components/admin/spatial.css'

const path=window.location.pathname.replace(/\/$/,'')
const authPaths=['/login','/register','/admin/login','/admin/register']

createRoot(document.getElementById('root')).render(
  <StrictMode>
    {authPaths.includes(path)?<AuthScreens admin={path.startsWith('/admin/')} register={path.endsWith('/register')}/>:path==='/admin/invitations'?<SessionGate admin><AdminInvitations/></SessionGate>:path==='/admin/overview'?<SessionGate admin><AdminOverview/></SessionGate>:path==='/admin/events'?<SessionGate admin><AdminEvents/></SessionGate>:path==='/admin/settings'?<SessionGate admin><SystemSettings/></SessionGate>:path==='/admin/usage'?<SessionGate admin><UsageCosts/></SessionGate>:path==='/admin/models'?<SessionGate admin><ModelSettings/></SessionGate>:path==='/admin'?<SessionGate admin><AdminAccounts/></SessionGate>:<SessionGate><App/></SessionGate>}
  </StrictMode>,
)
