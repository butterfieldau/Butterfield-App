import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import React, { useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const BG     = '#F5F6FA';
const CARD   = '#FFFFFF';
const BLUE   = '#40C0F2';
const TEXT   = '#1C1C1E';
const MUTED  = '#8E8E93';
const BORDER = '#E5E7EB';
const LIGHT_BLUE = '#EBF8FF';

interface NotifItem {
  key:   string;
  icon:  string;
  title: string;
  desc:  string;
}

const NOTIF_ITEMS: NotifItem[] = [
  {
    key:   'orderUpdates',
    icon:  'bell',
    title: 'Order updates',
    desc:  'When your order is ready or status changes.',
  },
  {
    key:   'rewardsStamps',
    icon:  'coffee',
    title: 'Rewards & stamps',
    desc:  "Free coffee unlocked? We'll let you know.",
  },
  {
    key:   'newCookies',
    icon:  'package',
    title: 'New cookies',
    desc:  'Be first to try our latest bakes.',
  },
  {
    key:   'offersPromos',
    icon:  'tag',
    title: 'Offers & promotions',
    desc:  'Occasional deals and discounts.',
  },
];

export default function NotificationsScreen() {
  const insets = useSafeAreaInsets();

  const [prefs, setPrefs] = useState<Record<string, boolean>>({
    orderUpdates:  true,
    rewardsStamps: true,
    newCookies:    true,
    offersPromos:  false,
  });

  const toggle = (key: string) => {
    Haptics.selectionAsync();
    setPrefs((p) => ({ ...p, [key]: !p[key] }));
  };

  return (
    <View style={{ flex: 1, backgroundColor: BG }}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 14, backgroundColor: CARD, borderBottomColor: BORDER }]}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Feather name="arrow-left" size={22} color={TEXT} />
        </Pressable>
        <Text style={styles.headerTitle}>Notifications</Text>
        <Text style={[styles.headerBrand, { color: BLUE }]}>Butterfield</Text>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 20, gap: 12, paddingBottom: 60 }}
        showsVerticalScrollIndicator={false}
      >
        {NOTIF_ITEMS.map((item) => {
          const isOn = prefs[item.key] ?? false;
          return (
            <View key={item.key} style={[styles.card, { backgroundColor: CARD, borderColor: BORDER }]}>
              <View style={[styles.iconCircle, { backgroundColor: LIGHT_BLUE }]}>
                <Feather name={item.icon as any} size={22} color={BLUE} />
              </View>
              <View style={styles.cardBody}>
                <Text style={styles.cardTitle}>{item.title}</Text>
                <Text style={styles.cardDesc}>{item.desc}</Text>
              </View>
              <Switch
                value={isOn}
                onValueChange={() => toggle(item.key)}
                trackColor={{ false: '#D1D5DB', true: BLUE }}
                thumbColor="#ffffff"
                ios_backgroundColor="#D1D5DB"
              />
            </View>
          );
        })}

        <Text style={[styles.footerNote, { color: MUTED }]}>
          You'll only get notifications you enable. We never share your details.
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  header:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingBottom: 16, borderBottomWidth: 1 },
  backBtn:      { width: 38, height: 38, alignItems: 'center', justifyContent: 'center' },
  headerTitle:  { fontSize: 18, fontFamily: 'Inter_700Bold', color: '#1C1C1E' },
  headerBrand:  { fontSize: 18, fontFamily: 'Inter_700Bold', fontStyle: 'italic' },
  card:         { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16, borderRadius: 16, borderWidth: 1 },
  iconCircle:   { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  cardBody:     { flex: 1, gap: 3 },
  cardTitle:    { fontSize: 16, fontFamily: 'Inter_700Bold', color: '#1C1C1E' },
  cardDesc:     { fontSize: 13, fontFamily: 'Inter_400Regular', color: '#8E8E93', lineHeight: 19 },
  footerNote:   { fontSize: 13, fontFamily: 'Inter_400Regular', lineHeight: 20, textAlign: 'center', paddingTop: 4 },
});
