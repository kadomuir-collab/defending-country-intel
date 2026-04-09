// hooks/useNotices.js
import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

export function useNotices(filter = 'active') {
  const [notices, setNotices] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    fetchNotices()

    const channel = supabase
      .channel('notices-realtime')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'notices'
      }, (payload) => {
        if (payload.eventType === 'INSERT') {
          setNotices(prev => [payload.new, ...prev])
        } else if (payload.eventType === 'UPDATE') {
          setNotices(prev => prev.map(n =>
            n.id === payload.new.id ? payload.new : n
          ))
        }
      })
      .subscribe()

    return () => supabase.removeChannel(channel)
  }, [filter])

  async function fetchNotices() {
    try {
      setLoading(true)
      let query = supabase
        .from('notices')
        .select('*')
        .order('deadline_date', { ascending: true })

      if (filter === 'active') {
        query = query.eq('status', 'active')
      } else if (filter === 'urgent') {
        query = query.in('deadline_status', ['red', 'critical'])
      }

      const { data, error } = await query

      if (error) throw error
      setNotices(data || [])
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return { notices, loading, error, refetch: fetchNotices }
}