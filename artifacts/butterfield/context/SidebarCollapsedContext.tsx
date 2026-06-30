import { createContext, useContext } from 'react';

export const SidebarCollapsedContext = createContext(false);
export const useSidebarCollapsed = () => useContext(SidebarCollapsedContext);
