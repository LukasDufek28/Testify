import {Component,type ReactNode} from 'react';
import PublicHeader from './PublicHeader';
export default class ScreenBoundary extends Component<{children:ReactNode},{failed:boolean}>{
  state={failed:false};
  static getDerivedStateFromError(){return {failed:true};}
  render(){return this.state.failed?<div className="landing auth-screen auth-approved"><PublicHeader account/><main className="auth-card"><h1>Let’s reopen your workspace</h1><p>This screen could not load. Your saved strategies and backtests are safe.</p><button className="design-button" onClick={()=>location.reload()}>Try again</button></main></div>:this.props.children;}
}
