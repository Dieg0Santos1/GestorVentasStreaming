import { useState, useEffect } from 'react'

export function useCurrentPage(initialPage = 'dashboard') {
  const [current, setCurrent] = useState(initialPage)
  
  useEffect(() => {
    const handlePageChange = (event) => {
      setCurrent(event.detail)
    }
    
    window.addEventListener('changePage', handlePageChange)
    return () => window.removeEventListener('changePage', handlePageChange)
  }, [])
  
  return { current, setCurrent }
}
