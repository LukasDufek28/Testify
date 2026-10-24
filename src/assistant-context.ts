import {createContext,useContext} from 'react';
import type {useAssistantController} from './AssistantWorkspace';

// Keep the context identity outside the UI module so Fast Refresh can replace
// the panel or launcher without disconnecting existing workspace consumers.
export const AssistantContext=createContext<ReturnType<typeof useAssistantController>|null>(null);
export function useAssistantContext(){
  const context=useContext(AssistantContext);
  if(!context)throw new Error('Assistant context is missing.');
  return context;
}
