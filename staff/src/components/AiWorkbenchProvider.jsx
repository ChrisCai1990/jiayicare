import React, { createContext, useContext } from 'react'
import { staffAPI, getToken } from '../api'
import useWorkbenchResource from '../hooks/useWorkbenchResource'
const Context = createContext(null)
export const useAiWorkbench = () => useContext(Context)
export default function AiWorkbenchProvider({ children }) {
  const resource = useWorkbenchResource(async () => (await staffAPI.getAiTodos()).data || [], getToken(), [])
  return <Context.Provider value={resource}>{children}</Context.Provider>
}
