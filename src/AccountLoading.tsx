import PublicHeader from './PublicHeader';
import './auth.css';
export default function AccountLoading() {
  return <div className="landing auth-screen auth-approved">
    <div className="auth-public-header"><PublicHeader account/></div>
    <main className="auth-main" aria-busy="true" aria-label="Checking your account">
      <section className="auth-card auth-skeleton" aria-hidden="true"><div/><div/><div/><div/></section>
    </main>
  </div>;
}
