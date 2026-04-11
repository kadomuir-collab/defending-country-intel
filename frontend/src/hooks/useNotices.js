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

      // Get user's PBC IDs and role
      const { data: userData } = await supabase.auth.getUser()
      const { data: staffRows } = await supabase
        .from('staff')
        .select('pbc_id, role')
        .eq('user_id', userData.user.id)
        .eq('active', true)

      const isSuperuser = staffRows?.some(s => s.role === 'superuser')
      const pbcIds = staffRows?.map(s => s.pbc_id).filter(Boolean) || []

      let query = supabase
        .from('notices')
        .select('*')
        .order('deadline_date', { ascending: true })
        .limit(10000)

      // Filter by user's PBCs unless superuser
      if (!isSuperuser && pbcIds.length > 0) {
        query = query.in('pbc_id', pbcIds)
      }

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