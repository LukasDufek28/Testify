import './studioMonaco';
import Editor from '@monaco-editor/react';
import { useRef, type ReactNode } from 'react';
import { DesignCard, CardTitle, designIcons } from './PenpotPrimitives';
import type { SavedStrategy } from './types';

type Props = {
  source: string; onChange: (source: string) => void;
  strategies: SavedStrategy[]; selected?: SavedStrategy; onOpen: (id: string) => void;
  onValidate: () => void; onSave: () => void;
  mode: 'create' | 'improve'; onMode: (mode: 'create' | 'improve') => void;
  idea: string; onIdea: (idea: string) => void; busy: boolean;
  onGenerate: () => void; onImprove: () => void; canImprove: boolean;
  feedbackCount: number; feedbackPicker: ReactNode;
};

export default function PenpotStrategyStudio(p: Props) {
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  return <div className="design-studio">
    <details className="design-card raised strategy-panel">
      <summary>Saved strategies <span>{p.strategies.length}</span></summary>
      <div className="strategy-list">{p.strategies.map(s => <button key={s.id} aria-pressed={s.id === p.selected?.id} onClick={() => p.onOpen(s.id)}><strong>{s.name}</strong><small>{new Date(s.updatedAt).toLocaleDateString()}</small></button>)}{!p.strategies.length && <p>No saved strategies yet. Save your first draft below.</p>}</div>
    </details>
    <div className="design-studio-grid">
      <DesignCard className="raised design-studio-editor">
        <header className="design-studio-toolbar"><div><h2>{p.selected?.name || 'New draft'}</h2><small>strategy.json</small></div><div className="design-studio-actions"><button className="design-button secondary" onClick={p.onValidate}>Validate</button><button className="design-button" onClick={p.onSave}>Save</button></div></header>
        <div className="editor-wrap"><Editor height="100%" language="json" theme="testify-neutral" value={p.source} onChange={value => p.onChange(value || '')}
          beforeMount={monaco => monaco.editor.defineTheme('testify-neutral', {base:'vs-dark',inherit:false,rules:[{token:'',foreground:'f9f9fa'},{token:'string',foreground:'f9f9fa'},{token:'number',foreground:'f9f9fa'},{token:'keyword',foreground:'f9f9fa'}],colors:{'editor.background':'#18171f','editor.foreground':'#f9f9fa','editorLineNumber.foreground':'#9e9da7','editorLineNumber.activeForeground':'#f9f9fa','editor.selectionBackground':'#343149','editor.lineHighlightBackground':'#222128','editorCursor.foreground':'#f9f9fa'}})}
          options={{editContext:false,bracketPairColorization:{enabled:false},minimap:{enabled:false},fontSize:15,lineHeight:20,fontFamily:'Urbanist, sans-serif',fontLigatures:false,scrollBeyondLastLine:false,automaticLayout:true,padding:{top:18,bottom:18},wordWrap:'off',renderLineHighlight:'none',overviewRulerLanes:0,ariaLabel:'Strategy JSON editor'}} /><textarea className="design-mobile-code" aria-label="Strategy JSON editor" spellCheck={false} autoCapitalize="off" wrap="off" value={p.source} onChange={e => p.onChange(e.target.value)} /></div>
        <footer>Rules are evaluated after bar close; orders fill no earlier than the next bar open.</footer>
      </DesignCard>
      <DesignCard className="design-assistant design-studio-assistant">
        <CardTitle icon={designIcons.assistant}>AI assistant</CardTitle>
        <h2>Build your next idea</h2><p>Describe the rules. Review the draft<br/>before saving.</p>
        <div className="design-studio-tabs" role="tablist" aria-label="AI tools">{(['create','improve'] as const).map((mode,i) => <button key={mode} ref={el => {tabs.current[i]=el;}} id={`studio-${mode}-tab`} role="tab" aria-selected={p.mode === mode} aria-controls="studio-ai-panel" tabIndex={p.mode === mode ? 0 : -1} onClick={() => p.onMode(mode)} onKeyDown={e => {if(['ArrowLeft','ArrowRight','Home','End'].includes(e.key)){e.preventDefault();const next=e.key==='Home'?0:e.key==='End'?1:1-i;p.onMode(next===0?'create':'improve');tabs.current[next]?.focus();}}}>{mode === 'create' ? 'Create' : 'Improve'}</button>)}</div>
        <div id="studio-ai-panel" role="tabpanel" aria-labelledby={`studio-${p.mode}-tab`}>
          <label className="design-studio-prompt">{p.mode === 'create' ? 'Describe your strategy' : 'Revision guidance'}<textarea value={p.idea} onChange={e => p.onIdea(e.target.value)} placeholder="For example: enter long when the 20-bar average crosses above the 50-bar average. Exit on the reverse cross, with a 1% stop and 2% target." /></label>
          {p.mode === 'improve' && p.feedbackPicker}
          <button className="design-button design-studio-generate" disabled={p.busy || (p.mode === 'improve' && !p.canImprove)} onClick={p.mode === 'create' ? p.onGenerate : p.onImprove}>{p.busy ? (p.mode === 'create' ? 'Generating…' : 'Revising…') : p.mode === 'create' ? 'Generate new draft' : `Improve selected strategy with ${p.feedbackCount} backtest${p.feedbackCount === 1 ? '' : 's'}`}</button>
          <small className="design-studio-review">{p.mode === 'create' ? 'Review the draft before saving.' : 'Only development results are used. Save the revised draft and backtest it again.'}</small>
        </div>
      </DesignCard>
    </div>
  </div>;
}
