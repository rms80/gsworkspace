import { useState, useEffect } from 'react'

export interface MenuState<T> {
  menuData: T | null
  menuPosition: { x: number; y: number } | null
  openMenu: (data: T, position: { x: number; y: number }) => void
  closeMenu: () => void
}

export function useMenuState<T>(): MenuState<T> {
  const [menuData, setMenuData] = useState<T | null>(null)
  const [menuPosition, setMenuPosition] = useState<{ x: number; y: number } | null>(null)

  const openMenu = (data: T, position: { x: number; y: number }) => {
    setMenuData(data)
    setMenuPosition(position)
  }

  const closeMenu = () => {
    setMenuData(null)
    setMenuPosition(null)
  }

  // Close on click or right-click elsewhere
  useEffect(() => {
    if (menuData === null) return

    const handleDismiss = () => closeMenu()

    const timeoutId = setTimeout(() => {
      document.addEventListener('click', handleDismiss)
      document.addEventListener('contextmenu', handleDismiss)
    }, 0)

    return () => {
      clearTimeout(timeoutId)
      document.removeEventListener('click', handleDismiss)
      document.removeEventListener('contextmenu', handleDismiss)
    }
  }, [menuData])

  return { menuData, menuPosition, openMenu, closeMenu }
}
