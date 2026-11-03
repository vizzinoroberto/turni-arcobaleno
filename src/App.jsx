import { useState, useEffect } from 'react'
import { supabase } from './supabase'
import Login from './Login.jsx'
import TurniGrid from './TurniGrid.jsx'

function roleOf(session) {
  return session?.user?.app_metadata?.role || null
}

export default function App() {
  // undefined = sessione ancora in verifica, null = non loggato
  const [session, setSession] = useState(undefined)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => setSession(s))
    return () => subscription.unsubscribe()
  }, [])

  if (session === undefined) return null

  const role = roleOf(session)
  if (!session || (role !== 'admin' && role !== 'staff')) {
    return <Login />
  }

  return (
    <TurniGrid
      key={role}
      isAdmin={role === 'admin'}
      onLogout={() => supabase.auth.signOut()}
    />
  )
}
