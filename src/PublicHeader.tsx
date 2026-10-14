export default function PublicHeader({account=false}:{account?:boolean}) {
  return <header className="landing-header">
    <a className="landing-logo silver-text" href="#" aria-label="Testify home">TESTIFY</a>
    <nav aria-label="Main navigation">
      {account ? <a className="landing-button landing-primary" href="#">Back to home</a> : <>
        <a className="landing-nav-link" href="#how-it-works">How it works</a>
        <a className="landing-nav-link" href="#product-preview">Product</a>
        <a className="landing-button landing-primary" href="#/app/overview">Start for free</a>
      </>}
    </nav>
  </header>;
}
