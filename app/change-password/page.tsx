import { redirect } from 'next/navigation';
import { Nav } from '../nav';
import { ChangePasswordForm } from '../auth-forms';
import { currentAccount } from '@/lib/session';

export const metadata = { title: 'Change password' };

export default async function ChangePasswordPage() {
  const account = await currentAccount();
  if (!account) redirect('/');
  return (
    <>
      <Nav back={!account.mustChangePassword} />
      <main className="stack">
        <ChangePasswordForm temporary={!!account.mustChangePassword} />
      </main>
    </>
  );
}
