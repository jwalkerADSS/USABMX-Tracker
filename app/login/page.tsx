export const metadata = { title: 'Sign in' };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string; next?: string }> }) {
  const { error, next } = await searchParams;
  return (
    <main className="login">
      <h1>BMX Tracker</h1>
      <form method="post" action="/api/login" className="card stack">
        <label>
          Email or username
          <input name="email" type="text" autoComplete="username" autoCapitalize="none" autoCorrect="off" required />
        </label>
        <label>
          Password
          <input name="password" type="password" autoComplete="current-password" required />
        </label>
        {next ? <input type="hidden" name="next" value={next} /> : null}
        {error ? <p className="error">That email, username or password didn&apos;t match.</p> : null}
        <button type="submit">Sign in</button>
      </form>
    </main>
  );
}
