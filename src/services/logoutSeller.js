import { signOut } from 'firebase/auth';
import { clearDemoExplorer } from '../constants/demoMode';
import { clearAuthRecaptchaSession } from '../firebase/authRecaptchaSession';
import { clearPhoneConfirmationResult } from '../firebase/phoneConfirmation';
import { clearShopCodeSession } from '../constants/shopCodeSession';
import { clearSellerCodeSessionLocal } from '../constants/shopCodeLocalSession';
import { auth } from '../firebase';

export async function logoutSeller() {
  clearAuthRecaptchaSession();
  clearPhoneConfirmationResult();
  clearDemoExplorer();
  clearShopCodeSession();
  clearSellerCodeSessionLocal();
  try {
    if (auth.currentUser) {
      await signOut(auth);
    }
  } catch {
    /* */
  }
}
