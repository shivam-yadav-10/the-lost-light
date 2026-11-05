import { doc, getDocFromServer } from 'firebase/firestore';
import { initializeSession } from './authService';
import { requireFirebaseServices } from './firebase';

export async function canEnterCompletion(teamId: string): Promise<boolean> {
  if (!teamId.trim()) throw new Error('A team is required to enter the finale.');
  await initializeSession();
  const { firestore } = requireFirebaseServices();
  const vault = await getDocFromServer(doc(firestore, 'teams', teamId, 'progress', '8'));
  return vault.get('status') === 'solved';
}
