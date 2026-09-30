import { redirect } from 'next/navigation';
import { ACCOUNT_PREFIX } from '@/lib/auth';
import { touchAccount } from '@/lib/accounts';
import { currentUser } from '@/lib/session';
import { storeReady } from '@/lib/store';

// On every page load: notes the account's last activity for the admin page, and ends the sign-in of an account
// the admin removed. If the database can't be reached, nobody is signed out.
export async function SessionCheck() {
  const user = await currentUser();
  if (!user?.startsWith(ACCOUNT_PREFIX) || !storeReady()) return null;
  const exists = await touchAccount(user.slice(ACCOUNT_PREFIX.length)).catch(() => true);
  if (!exists) redirect('/api/session-ended');
  return null;
}
