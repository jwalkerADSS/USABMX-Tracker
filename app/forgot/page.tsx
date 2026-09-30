import { ForgotForm } from '../auth-forms';

export const metadata = { title: 'Forgot password' };

export default function ForgotPage() {
  return (
    <main className="login">
      <h1>BMX Tracker</h1>
      <ForgotForm />
    </main>
  );
}
