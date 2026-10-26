import './studioMonaco';
import Editor from '@monaco-editor/react';

export default function DesktopStrategyEditor({source,onChange,readOnly}:{source:string;onChange:(value:string)=>void;readOnly:boolean}){
 return <Editor height="100%" language="json" theme="testify-neutral" value={source} onChange={value=>onChange(value||'')}
  onMount={(editor,monaco)=>{editor.addAction({id:'testify.selectAllRules',label:'Select all rules',keybindings:[monaco.KeyMod.CtrlCmd|monaco.KeyCode.KeyA],run:instance=>{const model=instance.getModel();if(model)instance.setSelection(model.getFullModelRange());}});}}
  beforeMount={monaco=>monaco.editor.defineTheme('testify-neutral',{base:'vs-dark',inherit:false,rules:[{token:'',foreground:'f9f9fa'},{token:'string',foreground:'f9f9fa'},{token:'number',foreground:'f9f9fa'},{token:'keyword',foreground:'f9f9fa'}],colors:{'editor.background':'#18171f','editor.foreground':'#f9f9fa','editorLineNumber.foreground':'#9e9da7','editorLineNumber.activeForeground':'#f9f9fa','editor.selectionBackground':'#343149','editor.lineHighlightBackground':'#222128','editorCursor.foreground':'#f9f9fa'}})}
  options={{readOnly,editContext:false,bracketPairColorization:{enabled:false},minimap:{enabled:false},fontSize:15,lineHeight:20,fontFamily:'Urbanist, sans-serif',fontLigatures:false,scrollBeyondLastLine:false,automaticLayout:true,padding:{top:18,bottom:18},wordWrap:'off',renderLineHighlight:'none',overviewRulerLanes:0,ariaLabel:'Strategy JSON editor'}}/>;
}
