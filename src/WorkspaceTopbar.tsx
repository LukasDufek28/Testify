import {Layers} from 'lucide-react';
import {DesignIcon} from './PenpotPrimitives';

export type WorkspaceSearchProps={value:string;onChange:(value:string)=>void;onSearch:(query:string)=>void};
export default function WorkspaceTopbar({value,onChange,onSearch}:WorkspaceSearchProps){
 return <header className="design-topbar"><DesignIcon icon={Layers}/><input type="search" aria-label="Search your workspace" placeholder="Search your workspace..." value={value} onChange={event=>onChange(event.target.value)} onKeyDown={event=>{if(event.key==='Enter'){event.preventDefault();onSearch(value.trim());}}}/></header>;
}
