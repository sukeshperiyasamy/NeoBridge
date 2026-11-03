import { Alert, Linking } from 'react-native';

import { telHref } from '@neobridge/demo';

/**
 * Opens the phone's dialer with the number filled in. On Android this is the
 * dialer screen (no call permission needed); iOS asks "Call …?" first.
 */
export async function dial(phone: string): Promise<void> {
  try {
    await Linking.openURL(telHref(phone));
  } catch {
    // tablets and simulators have no dialer
    Alert.alert(phone);
  }
}
