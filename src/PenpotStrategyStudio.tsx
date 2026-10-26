import './studioMonaco';
import Editor from '@monaco-editor/react';
import { type ReactNode } from 'react';
import { DesignCard } from './PenpotPrimitives';
import type { SavedStrategy } from './types';
import {useAssistantContext} from './AssistantWorkspace';
import StudioActions,{StudioStatus,type StudioOperation} from './StudioActions';

type Props = {
  source: string; onChange: (source: string) => void;
  strategies: SavedStrategy[]; selected?: SavedStrategy; onOpen: (id: string) => void;
  onValidate: () => Promise<boolean>; onSave: () => Promise<SavedStrategy|null>;
  beforeSource:string|null;onAcceptPreview:()=>void;onUndo:()=>void;onRun:()=>Promise<void>;canRun:boolean;
  mode: 'create' | 'improve'; onMode: (mode: 'create' | 'improve') => void;
  idea: string; onIdea: (idea: string) => void; busy: boolean;
  onGenerate: () => void; onImprove: () => void; canImprove: boolean;
  feedbackCount: number; feedbackPicker: ReactNode;
  operation:StudioOperation;validated:boolean;
};

export default function PenpotStrategyStudio(p: Props) {
  const assistant=useAssistantContext();
  return <div className="design-studio" onKeyDownCapture={event=>{if((event.ctrlKey||event.metaKey)&&!event.shiftKey&&!event.altKey&&event.key.toLowerCase()==='s'){event.preventDefault();event.stopPropagation();if(!p.busy&&!p.canRun)void p.onSave();}}}>
    <details className="design-card raised strategy-panel">
      <summary>Saved strategies <span>{p.strategies.length}</span></summary>
      <div className="strategy-list">{p.strategies.map(s => <button key={s.id} disabled={p.busy} aria-pressed={s.id === p.selected?.id} onClick={() => p.onOpen(s.id)}><strong>{s.name}</strong><small>{new Date(s.updatedAt).toLocaleDateString()}</small></button>)}{!p.strategies.length && <p>No saved strategies yet. Save your first draft below.</p>}</div>
    </details>
    <div className="design-studio-grid studio-unified">
      <DesignCard className="raised design-studio-editor">
        <header className="design-studio-toolbar"><div><h2>{p.selected?.name || 'New draft'}</h2><StudioStatus operation={p.operation} saved={p.canRun} validated={p.validated} existing={!!p.selected} revision={p.selected?.revision}/></div><StudioActions operation={p.operation} saved={p.canRun} validated={p.validated} existing={!!p.selected} busy={p.busy} onUndo={p.onUndo} onRun={p.onRun} onValidate={p.onValidate} onSave={p.onSave}/></header>
        {p.beforeSource!==null&&<details open className="strategy-diff"><summary>Review proposed changes</summary><div className="strategy-diff-columns"><div><h3>Previous</h3><pre>{p.beforeSource}</pre></div><div><h3>Proposed</h3><pre>{p.source}</pre></div></div><div className="design-default-actions"><button className="design-button" disabled={p.busy} onClick={p.onAcceptPreview}>Use this draft</button><button className="design-button secondary" disabled={p.busy} onClick={p.onUndo}>Discard suggestion</button></div><p>The saved version stays unchanged until you Save.</p></details>}
        <div className="editor-wrap"><Editor height="100%" language="json" theme="testify-neutral" value={p.source} onChange={value => p.onChange(value || '')}
          onMount={(editor,monaco)=>{editor.addAction({id:'testify.selectAllRules',label:'Select all rules',keybindings:[monaco.KeyMod.CtrlCmd|monaco.KeyCode.KeyA],run:instance=>{const model=instance.getModel();if(model)instance.setSelection(model.getFullModelRange());}});}}
          beforeMount={monaco => monaco.editor.defineTheme('testify-neutral', {base:'vs-dark',inherit:false,rules:[{token:'',foreground:'f9f9fa'},{token:'string',foreground:'f9f9fa'},{token:'number',foreground:'f9f9fa'},{token:'keyword',foreground:'f9f9fa'}],colors:{'editor.background':'#18171f','editor.foreground':'#f9f9fa','editorLineNumber.foreground':'#9e9da7','editorLineNumber.activeForeground':'#f9f9fa','editor.selectionBackground':'#343149','editor.lineHighlightBackground':'#222128','editorCursor.foreground':'#f9f9fa'}})}
          options={{readOnly:p.operation==='save',editContext:false,bracketPairColorization:{enabled:false},minimap:{enabled:false},fontSize:15,lineHeight:20,fontFamily:'Urbanist, sans-serif',fontLigatures:false,scrollBeyondLastLine:false,automaticLayout:true,padding:{top:18,bottom:18},wordWrap:'off',renderLineHighlight:'none',overviewRulerLanes:0,ariaLabel:'Strategy JSON editor'}} /><textarea className="design-mobile-code" aria-label="Strategy JSON editor" readOnly={p.operation==='save'} spellCheck={false} autoCapitalize="off" wrap="off" value={p.source} onChange={e => p.onChange(e.target.value)} /></div>
        <footer><span>Rules are evaluated after bar close; orders fill no earlier than the next bar open.</span><button className="design-button secondary" onClick={()=>assistant.setOpen(true)}>Ask assistant</button></footer>
      </DesignCard>

    </div>
  </div>;
}
