import { __authState, __firestoreState } from '../mocks/firebase-state.js';
import { setCalendarClock } from '../../js/utils/calendar-clock.js';

export const ownerKey = '__outbox_browser_fixture_owner__';
export const defaultOwner = localStorage.getItem(ownerKey) || 'outbox-app-initial';
export function seed(owner) {
    const policy = { version: 1, epoch: 'gym-sync-v1-2026-11' };
    __firestoreState.documents.set('runtime_config/sync_protocol', policy);
    __firestoreState.documents.set(`users/${owner}/app_data/sync_protocol`, { ...policy });
    __firestoreState.documents.set(`users/${owner}/app_data/session_revision`, { revision: 0, lastSessionId: null });
    __firestoreState.documents.set(`users/${owner}/app_data/user_preferences`, { weeklyTargetDays: 3 });
}
seed(defaultOwner); __authState.currentUser = { uid: defaultOwner, email: `${defaultOwner}@example.test` };
setCalendarClock(() => new Date('2026-11-27T12:00:00.000Z'));
globalThis.Chart = class { destroy() {} }; window.confirm = () => true; window.alert = () => {};
