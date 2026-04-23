import { signOut } from 'firebase/auth';
import { clearDemoExplorer } from '../constants/demoMode';
import { clearShopCodeSession } from '../constants/shopCodeSession';
import { clearPhoneConfirmationResult } from '../firebase/phoneConfirmation';
import { auth } from '../firebase';

export async function logoutSeller() {
  clearPhoneConfirmationResult();
  clearDemoExplorer();
  clearShopCodeSession();
  try {
    localStorage.clear();
  } catch {
    /* ignore */
  }
  await signOut(auth);
}
