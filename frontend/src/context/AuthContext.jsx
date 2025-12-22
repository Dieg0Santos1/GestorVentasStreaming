import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let mounted = true

    async function loadSession() {
      setLoading(true)
      const {
        data: { session },
      } = await supabase.auth.getSession()

      if (!mounted) return
      setUser(session?.user ?? null)
      setLoading(false)
    }

    loadSession()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
    })

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [])

  // Auto-logout por inactividad (5 minutos)
  useEffect(() => {
    if (!user) return

    let timeoutId

    function resetTimer() {
      if (timeoutId) clearTimeout(timeoutId)
      timeoutId = setTimeout(() => {
        supabase.auth.signOut()
      }, 5 * 60 * 1000)
    }

    const events = ['mousemove', 'keydown', 'click', 'scroll', 'touchstart']
    events.forEach((evt) => window.addEventListener(evt, resetTimer))
    resetTimer()

    return () => {
      if (timeoutId) clearTimeout(timeoutId)
      events.forEach((evt) => window.removeEventListener(evt, resetTimer))
    }
  }, [user])

  async function signIn(email, password) {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
  }

  async function signOut() {
    await supabase.auth.signOut()
  }

  const value = { user, loading, signIn, signOut }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth debe usarse dentro de AuthProvider')
  return ctx
}
