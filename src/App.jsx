import { useState } from 'react'
import Login from './Login.jsx'
import TurniGrid from './TurniGrid.jsx'

export default function App() {
  const [screen, setScreen] = useState('login') // 'login' | 'admin' | 'staff'

  if (screen === 'login') {
    return (
      <Login
        onAdmin={() => setScreen('admin')}
        onStaff={() => setScreen('staff')}
      />
    )
  }

  return (
    <TurniGrid
      isAdmin={screen === 'admin'}
      onLogout={() => setScreen('login')}
    />
  )
}
