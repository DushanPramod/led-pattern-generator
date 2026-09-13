import { createContext, useContext } from 'react'

/**
 * Where popovers (select menus and the like) should be portalled. Null means
 * the main document's body; a pop-out window supplies its own body so menus
 * open next to the control that opened them.
 */
export const PortalContainerContext = createContext<HTMLElement | null>(null)

export function usePortalContainer() {
  return useContext(PortalContainerContext) ?? undefined
}
